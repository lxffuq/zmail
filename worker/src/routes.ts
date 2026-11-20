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
import {
  hashPassword,
  verifyPassword,
  createSession,
  verifySession,
  deleteSession,
  deleteAllSessions,
  getAdminTokenHeader,
  getAdminPasswordHash,
  setAdminPasswordHash,
  isAdminPasswordSet,
} from './auth';

// 管理员密码最短长度
const MIN_ADMIN_PASSWORD_LENGTH = 6;

// 创建 Hono 应用
const app = new Hono<{ Bindings: Env }>();

// 添加 CORS 中间件
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Mailbox-Token', 'Authorization', 'X-Admin-Token'],
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

/**
 * 管理员鉴权中间件：所有 /api/* 请求都要校验会话 token。
 * 放行：/api/auth/*（全部）和 /api/config。
 * 非 /api 路径不走这条中间件（静态资源由平台处理）。
 * 未登录返回 401 {success:false, error:'未登录'}。
 * 注意：email() 不走 HTTP，不受影响；邮箱归属 token（X-Mailbox-Token）是另一套机制，不动。
 */
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (path === '/api/config' || path.startsWith('/api/auth/')) {
    await next();
    return;
  }
  const token = getAdminTokenHeader(c);
  if (!token || !(await verifySession(c.env.DB, token))) {
    return c.json({ success: false, error: '未登录' }, 401);
  }
  await next();
  return;
});

// ---- 管理员认证接口 ----

// 认证状态：是否需要初始化密码、当前请求是否已登录
app.get('/api/auth/status', async (c) => {
  try {
    const setupRequired = !(await isAdminPasswordSet(c.env.DB));
    let authenticated = false;
    const token = getAdminTokenHeader(c);
    if (token) {
      authenticated = await verifySession(c.env.DB, token);
    }
    return c.json({ success: true, setupRequired, authenticated });
  } catch (error) {
    console.error('获取认证状态失败:', error);
    return c.json({ success: false, error: '服务器内部错误' }, 500);
  }
});

// 首次设置管理员密码（仅当尚未设置时可用），成功后直接创建会话并返回 token
app.post('/api/auth/setup', async (c) => {
  try {
    const setupRequired = !(await isAdminPasswordSet(c.env.DB));
    if (!setupRequired) {
      return c.json({ success: false, error: '管理员密码已设置' }, 400);
    }

    let body: { password?: unknown; confirmPassword?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: '无效的请求体' }, 400);
    }
    const { password, confirmPassword } = body;
    if (typeof password !== 'string' || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
      return c.json({ success: false, error: '密码至少 6 位' }, 400);
    }
    if (password !== confirmPassword) {
      return c.json({ success: false, error: '两次输入的密码不一致' }, 400);
    }

    await setAdminPasswordHash(c.env.DB, await hashPassword(password));
    const token = await createSession(c.env.DB);
    return c.json({ success: true, token });
  } catch (error) {
    console.error('设置管理员密码失败:', error);
    return c.json({ success: false, error: '服务器内部错误' }, 500);
  }
});

// 管理员登录
app.post('/api/auth/login', async (c) => {
  try {
    const storedHash = await getAdminPasswordHash(c.env.DB);
    if (!storedHash) {
      return c.json({ success: false, error: '管理员密码未设置' }, 400);
    }

    let body: { password?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: '无效的请求体' }, 400);
    }
    const { password } = body;
    if (typeof password !== 'string' || password.length === 0) {
      return c.json({ success: false, error: '密码不能为空' }, 400);
    }
    if (!(await verifyPassword(password, storedHash))) {
      return c.json({ success: false, error: '密码错误' }, 401);
    }

    const token = await createSession(c.env.DB);
    return c.json({ success: true, token });
  } catch (error) {
    console.error('管理员登录失败:', error);
    return c.json({ success: false, error: '服务器内部错误' }, 500);
  }
});

// 管理员登出：需有效会话，删除该会话
app.post('/api/auth/logout', async (c) => {
  try {
    const token = getAdminTokenHeader(c);
    if (!token || !(await verifySession(c.env.DB, token))) {
      return c.json({ success: false, error: '未登录' }, 401);
    }
    await deleteSession(c.env.DB, token);
    return c.json({ success: true });
  } catch (error) {
    console.error('管理员登出失败:', error);
    return c.json({ success: false, error: '服务器内部错误' }, 500);
  }
});

// 修改管理员密码：需有效会话；改完删除全部会话（前端需重新登录）
app.post('/api/auth/change', async (c) => {
  try {
    const token = getAdminTokenHeader(c);
    if (!token || !(await verifySession(c.env.DB, token))) {
      return c.json({ success: false, error: '未登录' }, 401);
    }

    const storedHash = await getAdminPasswordHash(c.env.DB);
    if (!storedHash) {
      return c.json({ success: false, error: '管理员密码未设置' }, 400);
    }

    let body: { oldPassword?: unknown; newPassword?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: '无效的请求体' }, 400);
    }
    const { oldPassword, newPassword } = body;
    if (typeof oldPassword !== 'string' || !(await verifyPassword(oldPassword, storedHash))) {
      return c.json({ success: false, error: '旧密码错误' }, 401);
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_ADMIN_PASSWORD_LENGTH) {
      return c.json({ success: false, error: '新密码至少 6 位' }, 400);
    }

    await setAdminPasswordHash(c.env.DB, await hashPassword(newPassword));
    await deleteAllSessions(c.env.DB);
    return c.json({ success: true });
  } catch (error) {
    console.error('修改管理员密码失败:', error);
    return c.json({ success: false, error: '服务器内部错误' }, 500);
  }
});

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
