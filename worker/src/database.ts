import { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { 
  Mailbox, 
  CreateMailboxParams, 
  Email, 
  SaveEmailParams, 
  EmailListItem,
  Attachment,
  AttachmentListItem,
  SaveAttachmentParams
} from './types';
import { 
  generateId, 
  getCurrentTimestamp, 
  calculateExpiryTimestamp 
} from './utils';

// 附件分块大小（字节）
const CHUNK_SIZE = 500000; // 约500KB

/**
 * 初始化数据库
 * @param db 数据库实例
 */
export async function initializeDatabase(db: D1Database): Promise<void> {
  try {
    // 13 条建表/建索引语句一次 batch 提交
    const statements = [
      `CREATE TABLE IF NOT EXISTS mailboxes (id TEXT PRIMARY KEY, address TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, ip_address TEXT, last_accessed INTEGER NOT NULL, access_token TEXT);`,
      `CREATE TABLE IF NOT EXISTS emails (id TEXT PRIMARY KEY, mailbox_id TEXT NOT NULL, from_address TEXT NOT NULL, from_name TEXT, to_address TEXT NOT NULL, subject TEXT, text_content TEXT, html_content TEXT, received_at INTEGER NOT NULL, has_attachments BOOLEAN DEFAULT FALSE, is_read BOOLEAN DEFAULT FALSE, FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE);`,
      `CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, email_id TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT NOT NULL, content TEXT, size INTEGER NOT NULL, created_at INTEGER NOT NULL, is_large BOOLEAN DEFAULT FALSE, chunks_count INTEGER DEFAULT 0, FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE);`,
      `CREATE TABLE IF NOT EXISTS attachment_chunks (id TEXT PRIMARY KEY, attachment_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, content TEXT NOT NULL, FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE);`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
      `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);`,
      `CREATE INDEX IF NOT EXISTS idx_mailboxes_address ON mailboxes(address);`,
      `CREATE INDEX IF NOT EXISTS idx_mailboxes_expires_at ON mailboxes(expires_at);`,
      `CREATE INDEX IF NOT EXISTS idx_emails_mailbox_id ON emails(mailbox_id);`,
      `CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);`,
      `CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);`,
      `CREATE INDEX IF NOT EXISTS idx_attachment_chunks_attachment_id ON attachment_chunks(attachment_id);`,
      `CREATE INDEX IF NOT EXISTS idx_attachment_chunks_chunk_index ON attachment_chunks(chunk_index);`,
    ].map((sql) => db.prepare(sql));

    await db.batch(statements);

    // 给已上线数据库迁移：补 access_token 列；列已存在时会报错，直接吞掉
    try {
      await db.prepare(`ALTER TABLE mailboxes ADD COLUMN access_token TEXT`).run();
    } catch {
      // 列已存在，无需处理
    }
    
    console.log('数据库初始化成功');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    // 抛出错误，让上层处理
    throw new Error(`数据库初始化失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 创建邮箱
 * @param db 数据库实例
 * @param params 参数
 * @returns 创建的邮箱（仅此处返回 accessToken）
 */
export async function createMailbox(db: D1Database, params: CreateMailboxParams): Promise<Mailbox> {
  const now = getCurrentTimestamp();
  const accessToken = crypto.randomUUID();
  const mailbox: Mailbox = {
    id: generateId(),
    address: params.address,
    createdAt: now,
    expiresAt: calculateExpiryTimestamp(params.expiresInHours),
    ipAddress: params.ipAddress,
    lastAccessed: now,
    accessToken,
  };
  
  await db.prepare(`INSERT INTO mailboxes (id, address, created_at, expires_at, ip_address, last_accessed, access_token) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(mailbox.id, mailbox.address, mailbox.createdAt, mailbox.expiresAt, mailbox.ipAddress, mailbox.lastAccessed, accessToken).run();
  
  return mailbox;
}

/**
 * 获取邮箱信息（不含 access_token，SELECT 显式列字段）
 * @param db 数据库实例
 * @param address 邮箱地址
 * @returns 邮箱信息
 */
export async function getMailbox(db: D1Database, address: string): Promise<Mailbox | null> {
  const now = getCurrentTimestamp();
  const result = await db.prepare(`SELECT id, address, created_at, expires_at, ip_address, last_accessed FROM mailboxes WHERE address = ? AND expires_at > ?`).bind(address, now).first();
  
  if (!result) return null;
  
  return {
    id: result.id as string,
    address: result.address as string,
    createdAt: result.created_at as number,
    expiresAt: result.expires_at as number,
    ipAddress: result.ip_address as string,
    lastAccessed: result.last_accessed as number,
  };
}

/**
 * 按邮箱 ID 查询 access_token（内部校验用）
 * @param db 数据库实例
 * @param mailboxId 邮箱 ID
 * @returns token；邮箱不存在或旧邮箱无 token 时返回 null
 */
export async function getMailboxAccessToken(db: D1Database, mailboxId: string): Promise<string | null> {
  const result = await db.prepare(`SELECT access_token FROM mailboxes WHERE id = ?`).bind(mailboxId).first();
  if (!result) return null;
  return (result.access_token as string | null) ?? null;
}

/**
 * 按邮件 ID 查所属邮箱 ID（供 token 校验用，不产生已读等副作用）
 * @param db 数据库实例
 * @param emailId 邮件 ID
 * @returns 邮箱 ID，不存在返回 null
 */
export async function getMailboxIdForEmail(db: D1Database, emailId: string): Promise<string | null> {
  const result = await db.prepare(`SELECT mailbox_id FROM emails WHERE id = ?`).bind(emailId).first();
  if (!result) return null;
  return result.mailbox_id as string;
}

/**
 * 按附件 ID 查所属邮箱 ID（供 token 校验用）
 * @param db 数据库实例
 * @param attachmentId 附件 ID
 * @returns 邮箱 ID，不存在返回 null
 */
export async function getMailboxIdForAttachment(db: D1Database, attachmentId: string): Promise<string | null> {
  const result = await db.prepare(`SELECT e.mailbox_id FROM emails e JOIN attachments a ON a.email_id = e.id WHERE a.id = ?`).bind(attachmentId).first();
  if (!result) return null;
  return result.mailbox_id as string;
}

/**
 * 删除邮箱
 * @param db 数据库实例
 * @param address 邮箱地址
 */
export async function deleteMailbox(db: D1Database, address: string): Promise<void> {
  await db.prepare(`DELETE FROM mailboxes WHERE address = ?`).bind(address).run();
}

/**
 * 清理过期邮箱（集合式 DELETE，不依赖外键级联）
 * @param db 数据库实例
 * @returns 删除的邮箱数量
 */
export async function cleanupExpiredMailboxes(db: D1Database): Promise<number> {
  const now = getCurrentTimestamp();
  const mailboxFilter = `mailbox_id IN (SELECT id FROM mailboxes WHERE expires_at <= ?)`;
  const emailFilter = `email_id IN (SELECT id FROM emails WHERE ${mailboxFilter})`;

  // 先删附件块，再删附件，再删邮件，最后删邮箱，每一步都是一条 DELETE
  await db.prepare(`DELETE FROM attachment_chunks WHERE attachment_id IN (SELECT id FROM attachments WHERE ${emailFilter})`).bind(now).run();
  await db.prepare(`DELETE FROM attachments WHERE ${emailFilter}`).bind(now).run();
  await db.prepare(`DELETE FROM emails WHERE ${mailboxFilter}`).bind(now).run();
  const result = await db.prepare(`DELETE FROM mailboxes WHERE expires_at <= ?`).bind(now).run();

  return result.meta?.changes || 0;
}

/**
 * 清理过期邮件（集合式 DELETE，不依赖外键级联）
 * @param db 数据库实例
 * @returns 删除的邮件数量
 */
export async function cleanupExpiredMails(db: D1Database): Promise<number> {
  const now = getCurrentTimestamp();
  const oneDayAgo = now - 24 * 60 * 60; // 24小时前的时间戳（秒）
  const emailFilter = `email_id IN (SELECT id FROM emails WHERE received_at <= ?)`;

  await db.prepare(`DELETE FROM attachment_chunks WHERE attachment_id IN (SELECT id FROM attachments WHERE ${emailFilter})`).bind(oneDayAgo).run();
  await db.prepare(`DELETE FROM attachments WHERE ${emailFilter}`).bind(oneDayAgo).run();
  const result = await db.prepare(`DELETE FROM emails WHERE received_at <= ?`).bind(oneDayAgo).run();

  return result.meta?.changes || 0;
}

/**
 * 构建保存邮件的语句（不执行，供批量原子提交用）
 */
function buildSaveEmailStatement(db: D1Database, params: SaveEmailParams): { email: Email; statement: D1PreparedStatement } {
  const now = getCurrentTimestamp();
  const email: Email = {
    id: generateId(),
    mailboxId: params.mailboxId,
    fromAddress: params.fromAddress,
    fromName: params.fromName || '',
    toAddress: params.toAddress,
    subject: params.subject || '',
    textContent: params.textContent || '',
    htmlContent: params.htmlContent || '',
    receivedAt: now,
    hasAttachments: params.hasAttachments || false,
    isRead: false,
  };

  const statement = db.prepare(`INSERT INTO emails (id, mailbox_id, from_address, from_name, to_address, subject, text_content, html_content, received_at, has_attachments, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(email.id, email.mailboxId, email.fromAddress, email.fromName, email.toAddress, email.subject, email.textContent, email.htmlContent, email.receivedAt, email.hasAttachments ? 1 : 0, email.isRead ? 1 : 0);

  return { email, statement };
}

/**
 * 构建保存附件的语句（不执行，供批量原子提交用）
 */
function buildSaveAttachmentStatements(db: D1Database, params: SaveAttachmentParams): { attachment: Attachment; statements: D1PreparedStatement[] } {
  const now = getCurrentTimestamp();
  const attachmentId = generateId();

  // 检查附件大小，决定是否需要分块存储
  const isLarge = params.content.length > CHUNK_SIZE;
  console.log(`附件大小: ${params.content.length} 字节, 是否为大型附件: ${isLarge}`);

  if (isLarge) {
    // 大型附件，需要分块存储
    const contentLength = params.content.length;
    const chunksCount = Math.ceil(contentLength / CHUNK_SIZE);
    console.log(`将附件分为 ${chunksCount} 块存储`);

    const attachment: Attachment = {
      id: attachmentId,
      emailId: params.emailId,
      filename: params.filename,
      mimeType: params.mimeType,
      content: '', // 大型附件不在主表存储内容
      size: params.size,
      createdAt: now,
      isLarge: true,
      chunksCount: chunksCount
    };

    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO attachments (id, email_id, filename, mime_type, content, size, created_at, is_large, chunks_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(attachment.id, attachment.emailId, attachment.filename, attachment.mimeType, attachment.content, attachment.size, attachment.createdAt, attachment.isLarge ? 1 : 0, attachment.chunksCount)
    ];

    for (let i = 0; i < chunksCount; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, contentLength);
      const chunkContent = params.content.substring(start, end);
      const chunkId = generateId();
      statements.push(
        db.prepare(`INSERT INTO attachment_chunks (id, attachment_id, chunk_index, content) VALUES (?, ?, ?, ?)`).bind(chunkId, attachment.id, i, chunkContent)
      );
    }

    return { attachment, statements };
  } else {
    // 小型附件，直接存储
    const attachment: Attachment = {
      id: attachmentId,
      emailId: params.emailId,
      filename: params.filename,
      mimeType: params.mimeType,
      content: params.content,
      size: params.size,
      createdAt: now,
      isLarge: false,
      chunksCount: 0
    };

    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO attachments (id, email_id, filename, mime_type, content, size, created_at, is_large, chunks_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(attachment.id, attachment.emailId, attachment.filename, attachment.mimeType, attachment.content, attachment.size, attachment.createdAt, attachment.isLarge ? 1 : 0, attachment.chunksCount)
    ];

    return { attachment, statements };
  }
}

/**
 * 原子保存一封邮件及其全部附件（一次 db.batch 提交）
 * @param db 数据库实例
 * @param emailParams 邮件参数
 * @param attachmentParams 附件参数列表
 * @returns 保存的邮件
 */
export async function saveEmailWithAttachments(db: D1Database, emailParams: SaveEmailParams, attachmentParams: SaveAttachmentParams[]): Promise<Email> {
  try {
    console.log('开始保存邮件...');
    const { email, statement } = buildSaveEmailStatement(db, emailParams);
    const statements: D1PreparedStatement[] = [statement];

    for (const attachmentParam of attachmentParams) {
      // 附件归属以这里生成的邮件 ID 为准，调用方传的 emailId 占位符会被覆盖
      const { statements: attachmentStatements } = buildSaveAttachmentStatements(db, { ...attachmentParam, emailId: email.id });
      statements.push(...attachmentStatements);
    }

    await db.batch(statements);
    console.log('邮件保存成功:', email.id);
    return email;
  } catch (error) {
    console.error('保存邮件失败:', error);
    throw new Error(`保存邮件失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 获取邮件列表
 * @param db 数据库实例
 * @param mailboxId 邮箱ID
 * @returns 邮件列表（最多 100 条）
 */
export async function getEmails(db: D1Database, mailboxId: string): Promise<EmailListItem[]> {
  const results = await db.prepare(`SELECT id, mailbox_id, from_address, from_name, to_address, subject, received_at, has_attachments, is_read FROM emails WHERE mailbox_id = ? ORDER BY received_at DESC LIMIT 100`).bind(mailboxId).all();
  
  if (!results.results) return [];
  
  return results.results.map(result => ({
    id: result.id as string,
    mailboxId: result.mailbox_id as string,
    fromAddress: result.from_address as string,
    fromName: result.from_name as string,
    toAddress: result.to_address as string,
    subject: result.subject as string,
    receivedAt: result.received_at as number,
    hasAttachments: !!result.has_attachments,
    isRead: !!result.is_read,
  }));
}

/**
 * 获取邮件详情
 * @param db 数据库实例
 * @param id 邮件ID
 * @returns 邮件详情
 */
export async function getEmail(db: D1Database, id: string): Promise<Email | null> {
  const result = await db.prepare(`SELECT id, mailbox_id, from_address, from_name, to_address, subject, text_content, html_content, received_at, has_attachments, is_read FROM emails WHERE id = ?`).bind(id).first();
  
  if (!result) return null;
  
  // 标记为已读
  await db.prepare(`UPDATE emails SET is_read = 1 WHERE id = ?`).bind(id).run();
  
  return {
    id: result.id as string,
    mailboxId: result.mailbox_id as string,
    fromAddress: result.from_address as string,
    fromName: result.from_name as string,
    toAddress: result.to_address as string,
    subject: result.subject as string,
    textContent: result.text_content as string,
    htmlContent: result.html_content as string,
    receivedAt: result.received_at as number,
    hasAttachments: !!result.has_attachments,
    isRead: true,
  };
}

/**
 * 获取附件列表
 * @param db 数据库实例
 * @param emailId 邮件ID
 * @returns 附件列表
 */
export async function getAttachments(db: D1Database, emailId: string): Promise<AttachmentListItem[]> {
  const results = await db.prepare(`SELECT id, email_id, filename, mime_type, size, created_at, is_large, chunks_count FROM attachments WHERE email_id = ? ORDER BY created_at ASC`).bind(emailId).all();
  
  if (!results.results) return [];
  
  return results.results.map(result => ({
    id: result.id as string,
    emailId: result.email_id as string,
    filename: result.filename as string,
    mimeType: result.mime_type as string,
    size: result.size as number,
    createdAt: result.created_at as number,
    isLarge: !!result.is_large,
    chunksCount: result.chunks_count as number
  }));
}

/**
 * 获取附件详情
 * @param db 数据库实例
 * @param id 附件ID
 * @returns 附件详情
 */
export async function getAttachment(db: D1Database, id: string): Promise<Attachment | null> {
  const result = await db.prepare(`SELECT id, email_id, filename, mime_type, content, size, created_at, is_large, chunks_count FROM attachments WHERE id = ?`).bind(id).first();
  
  if (!result) return null;
  
  const isLarge = !!result.is_large;
  let content = result.content as string;
  
  // 如果是大型附件，需要从块表中获取内容
  if (isLarge) {
    content = await getAttachmentContent(db, id);
  }
  
  return {
    id: result.id as string,
    emailId: result.email_id as string,
    filename: result.filename as string,
    mimeType: result.mime_type as string,
    content: content,
    size: result.size as number,
    createdAt: result.created_at as number,
    isLarge: isLarge,
    chunksCount: result.chunks_count as number
  };
}

/**
 * 获取大型附件的内容（一条查询取回全部块，按 chunk_index 顺序拼接）
 * @param db 数据库实例
 * @param attachmentId 附件ID
 * @returns 完整的附件内容
 */
async function getAttachmentContent(db: D1Database, attachmentId: string): Promise<string> {
  const results = await db.prepare(`SELECT content FROM attachment_chunks WHERE attachment_id = ? ORDER BY chunk_index ASC`).bind(attachmentId).all();
  if (!results.results) return '';
  return results.results.map((row) => row.content as string).join('');
}

/**
 * 删除邮件（集合式清理附件，不依赖外键级联）
 * @param db 数据库实例
 * @param id 邮件ID
 */
export async function deleteEmail(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM attachment_chunks WHERE attachment_id IN (SELECT id FROM attachments WHERE email_id = ?)`).bind(id),
    db.prepare(`DELETE FROM attachments WHERE email_id = ?`).bind(id),
    db.prepare(`DELETE FROM emails WHERE id = ?`).bind(id),
  ]);
}
