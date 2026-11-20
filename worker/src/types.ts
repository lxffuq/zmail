import { D1Database } from '@cloudflare/workers-types';

// 环境变量类型
export interface Env {
  DB: D1Database;
  // 收信域名（例如 example.com），在控制台 Worker → 设置 → 变量里设置；不设置时为空
  EMAIL_DOMAIN?: string;
}

// 邮箱类型
export interface Mailbox {
  id: string;
  address: string;
  createdAt: number;
  expiresAt: number;
  ipAddress: string;
  lastAccessed: number;
  // 邮箱归属 token，仅在创建接口返回；按地址/邮件查询时不返回
  accessToken?: string;
}

// 创建邮箱参数
export interface CreateMailboxParams {
  address: string;
  expiresInHours: number;
  ipAddress: string;
}

// 邮件类型
export interface Email {
  id: string;
  mailboxId: string;
  fromAddress: string;
  fromName: string;
  toAddress: string;
  subject: string;
  textContent?: string;
  htmlContent?: string;
  receivedAt: number;
  hasAttachments: boolean;
  isRead: boolean;
}

// 保存邮件参数
export interface SaveEmailParams {
  mailboxId: string;
  fromAddress: string;
  fromName?: string;
  toAddress: string;
  subject?: string;
  textContent?: string;
  htmlContent?: string;
  hasAttachments?: boolean;
}

// 邮件列表项（不包含内容）
export interface EmailListItem {
  id: string;
  mailboxId: string;
  fromAddress: string;
  fromName: string;
  toAddress: string;
  subject: string;
  receivedAt: number;
  hasAttachments: boolean;
  isRead: boolean;
}

// 附件类型
export interface Attachment {
  id: string;
  emailId: string;
  filename: string;
  mimeType: string;
  content: string; // Base64编码的内容，仅用于小型附件
  size: number;
  createdAt: number;
  isLarge: boolean; // 是否为大型附件
  chunksCount: number; // 分块数量
}

// 附件块类型
export interface AttachmentChunk {
  id: string;
  attachmentId: string;
  chunkIndex: number;
  content: string; // 分块的Base64内容
}

// 附件列表项（不包含内容）
export interface AttachmentListItem {
  id: string;
  emailId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
  isLarge: boolean;
  chunksCount: number;
}

// 保存附件参数
export interface SaveAttachmentParams {
  emailId: string;
  filename: string;
  mimeType: string;
  content: string; // Base64编码的内容
  size: number;
}

// 管理员配置（settings 表）：key 固定为 'admin_password_hash'，value 为密码 hash
export interface AdminSetting {
  key: string;
  value: string;
}

// 管理员会话（sessions 表）：只存 token 的 SHA-256 hex，不存 token 原文
export interface AdminSession {
  tokenHash: string;
  expiresAt: number;
}

// 管理员认证请求体
export interface AuthSetupRequest {
  password: string;
  confirmPassword: string;
}

export interface AuthLoginRequest {
  password: string;
}

export interface AuthChangeRequest {
  oldPassword: string;
  newPassword: string;
}

// 管理员认证状态响应
export interface AuthStatusResponse {
  success: boolean;
  setupRequired: boolean;
  authenticated: boolean;
}

// 解析后的邮件类型
export interface ParsedEmail {
  html?: string;
  text?: string;
  subject?: string;
  from: {
    address: string;
    name?: string;
  };
  to: Array<{
    address: string;
    name?: string;
  }>;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    content: ArrayBuffer;
    size?: number;
  }>;
}
