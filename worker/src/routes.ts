import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { 
  createMailbox, 
  getMailbox, 
  deleteMailbox, 
  getEmails, 
  getEmail, 
  deleteEmail,
  getAttachments,
  getAttachment,
  getMailboxAccessToken,
  getMailboxIdForEmail,
  getMailboxIdForAttachment
} from './database';
import { generateRandomAddress, MAILBOX_TTL_HOURS } from './utils';

// 创建 Hono 应用
const app = new Hono<{ Bindings: Env }>();

// 添加 CORS 中间件
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Mailbox-Token'],
  maxAge: 86400,
}));

// 自定义地址格式：3-32 位小写字母/数字/._-
const CUSTOM_ADDRESS_PATTERN = /^[a-z0-9._-]{3,32}$/;

/**
 * 校验邮箱归属 token。
 * mailbox.access_token 为 NULL（旧邮箱）时放行；有值时请求头 X-Mailbox-Token 必须等于它。
 * @returns 校验不通过时返回 403 响应，通过返回 null
 */
async function checkMailboxToken(c: Context<{ Bindings: Env }>, mailboxId: string): Promise<Response | null> {
  const token = await getMailboxAccessToken(c.env.DB, mailboxId);
  if (token === null) return null;
  if (c.req.header('X-Mailbox-Token') !== token) {
    return c.json({ success: false, error: '无权访问该邮箱' }, 403);
  }
  return null;
}

// 运行时配置：前端启动时读取收信域名等配置。
// EMAIL_DOMAIN 在控制台 Worker → 设置 → 变量里设置，改完即生效，无需重新构建。
app.get('/api/config', (c) => {
  return c.json({
    success: true,
    emailDomain: c.env.EMAIL_DOMAIN || '',
  });
});

// 创建邮箱
app.post('/api/mailboxes', async (c) => {
  try {
    const body = await c.req.json();
    
    // 验证参数
    if (body.address && typeof body.address !== 'string') {
      return c.json({ success: false, error: '无效的邮箱地址' }, 400);
    }

    // 自定义地址必须符合格式
    if (body.address && !CUSTOM_ADDRESS_PATTERN.test(body.address)) {
      return c.json({ success: false, error: '无效的邮箱地址' }, 400);
    }
    
    const expiresInHours = MAILBOX_TTL_HOURS;
    
    // 获取客户端IP
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    
    // 生成或使用提供的地址
    const address = body.address || generateRandomAddress();
    
    // 检查邮箱是否已存在
    const existingMailbox = await getMailbox(c.env.DB, address);
    if (existingMailbox) {
      return c.json({ success: false, error: '邮箱地址已存在' }, 400);
    }
    
    // 创建邮箱
    const mailbox = await createMailbox(c.env.DB, {
      address,
      expiresInHours,
      ipAddress: ip,
    });
    
    return c.json({ success: true, mailbox });
  } catch (error) {
    console.error('创建邮箱失败:', error);
    // 并发创建同一地址时触发唯一约束
    if (error instanceof Error && (error.message.includes('UNIQUE') || error.message.includes('SQLITE_CONSTRAINT'))) {
      return c.json({ success: false, error: '邮箱地址已存在' }, 400);
    }
    return c.json({ 
      success: false, 
      error: '创建邮箱失败'
    }, 500);
  }
});

// 获取邮箱信息
app.get('/api/mailboxes/:address', async (c) => {
  try {
    const address = c.req.param('address');
    const mailbox = await getMailbox(c.env.DB, address);
    
    if (!mailbox) {
      return c.json({ success: false, error: '邮箱不存在' }, 404);
    }

    const forbidden = await checkMailboxToken(c, mailbox.id);
    if (forbidden) return forbidden;
    
    return c.json({ success: true, mailbox });
  } catch (error) {
    console.error('获取邮箱失败:', error);
    return c.json({ 
      success: false, 
      error: '服务器内部错误'
    }, 500);
  }
});

// 删除邮箱
app.delete('/api/mailboxes/:address', async (c) => {
  try {
    const address = c.req.param('address');
    const mailbox = await getMailbox(c.env.DB, address);

    if (!mailbox) {
      return c.json({ success: false, error: '邮箱不存在' }, 404);
    }

    const forbidden = await checkMailboxToken(c, mailbox.id);
    if (forbidden) return forbidden;

    await deleteMailbox(c.env.DB, address);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('删除邮箱失败:', error);
    return c.json({ 
      success: false, 
      error: '服务器内部错误'
    }, 500);
  }
});

// 获取邮件列表
app.get('/api/mailboxes/:address/emails', async (c) => {
  try {
    const address = c.req.param('address');
    const mailbox = await getMailbox(c.env.DB, address);
    
    if (!mailbox) {
      return c.json({ success: false, error: '邮箱不存在' }, 404);
    }

    const forbidden = await checkMailboxToken(c, mailbox.id);
    if (forbidden) return forbidden;
    
    const emails = await getEmails(c.env.DB, mailbox.id);
    
    return c.json({ success: true, emails });
  } catch (error) {
    console.error('获取邮件列表失败:', error);
    return c.json({ 
      success: false, 
      error: '服务器内部错误'
    }, 500);
  }
});

// 获取邮件详情
app.get('/api/emails/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // 先查所属邮箱做 token 校验（不触发已读标记）
    const mailboxId = await getMailboxIdForEmail(c.env.DB, id);
    if (!mailboxId) {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }

    const forbidden = await checkMailboxToken(c, mailboxId);
    if (forbidden) return forbidden;

    const email = await getEmail(c.env.DB, id);
    
    if (!email) {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }
    
    return c.json({ success: true, email });
  } catch (error) {
    console.error('获取邮件详情失败:', error);
    return c.json({ 
      success: false, 
      error: '服务器内部错误'
    }, 500);
  }
});

// 获取邮件的附件列表
app.get('/api/emails/:id/attachments', async (c) => {
  try {
    const id = c.req.param('id');
    
    // 先查所属邮箱做 token 校验（不触发已读标记）
    const mailboxId = await getMailboxIdForEmail(c.env.DB, id);
    if (!mailboxId) {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }

    const forbidden = await checkMailboxToken(c, mailboxId);
    if (forbidden) return forbidden;

    // 获取附件列表
    const attachments = await getAttachments(c.env.DB, id);
    
    return c.json({ success: true, attachments });
  } catch (error) {
    console.error('获取附件列表失败:', error);
    return c.json({ 
      success: false, 
      error: '服务器内部错误'
    }, 500);
  }
});

// 获取附件详情
app.get('/api/attachments/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // 先查所属邮箱做 token 校验
    const mailboxId = await getMailboxIdForAttachment(c.env.DB, id);
    if (!mailboxId) {
      return c.json({ success: false, error: '附件不存在' }, 404);
    }

    const forbidden = await checkMailboxToken(c, mailboxId);
    if (forbidden) return forbidden;

    const attachment = await getAttachment(c.env.DB, id);
    
    if (!attachment) {
      return c.json({ success: false, error: '附件不存在' }, 404);
    }
    
    // 检查是否需要直接返回附件内容
    const download = c.req.query('download') === 'true';
    
    if (download) {
      // 将Base64内容转换为二进制
      const bytes = Uint8Array.from(atob(attachment.content), (ch) => ch.charCodeAt(0));
      
      // 设置响应头
      c.header('Content-Type', attachment.mimeType);
      c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('Content-Security-Policy', 'sandbox');
      
      return c.body(bytes);
    }
    
    // 返回附件信息（不包含内容，避免响应过大）
    return c.json({ 
      success: true, 
      attachment: {
        id: attachment.id,
        emailId: attachment.emailId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt,
        isLarge: attachment.isLarge,
        chunksCount: attachment.chunksCount
      }
    });
  } catch (error) {
    console.error('获取附件详情失败:', error);
    return c.json({ 
      success: false, 
      error: '服务器内部错误'
    }, 500);
  }
});

// 删除邮件
app.delete('/api/emails/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // 先查所属邮箱做 token 校验
    const mailboxId = await getMailboxIdForEmail(c.env.DB, id);
    if (!mailboxId) {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }

    const forbidden = await checkMailboxToken(c, mailboxId);
    if (forbidden) return forbidden;

    await deleteEmail(c.env.DB, id);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('删除邮件失败:', error);
    return c.json({ 
      success: false, 
      error: '服务器内部错误'
    }, 500);
  }
});

export default app;
