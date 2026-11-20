import { Context } from 'hono';
import { D1Database } from '@cloudflare/workers-types';
import { Env } from './types';
import { getCurrentTimestamp } from './utils';

// 管理员密码在 settings 表中的 key（固定）
export const ADMIN_PASSWORD_KEY = 'admin_password_hash';

// PBKDF2 参数：SHA-256、10 万次迭代、16 字节盐、32 字节 hash
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;
// 会话有效期：7 天（秒）
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

// 存储格式：pbkdf2-sha256$100000$<base64url 盐>$<base64url hash>
const HASH_FORMAT_PREFIX = 'pbkdf2-sha256';

/** Uint8Array -> base64url（无 padding） */
function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url -> Uint8Array */
function base64urlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Uint8Array -> 小写 hex */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 对输入求 SHA-256，返回小写 hex（会话 token 只存这个，不存原文） */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

/**
 * 生成管理员密码 hash（PBKDF2-SHA256，10 万次迭代）。
 * 16 字节随机盐 + 32 字节 hash，只返回 `pbkdf2-sha256$100000$<盐>$<hash>` 字符串，绝不存明文。
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    PBKDF2_HASH_LENGTH_BYTES * 8,
  );
  return `${HASH_FORMAT_PREFIX}$${PBKDF2_ITERATIONS}$${bytesToBase64url(salt)}$${bytesToBase64url(new Uint8Array(hash))}`;
}

/**
 * 校验密码与存储的 hash 是否一致。
 * 格式不对（缺字段 / 前缀 / 迭代次数非法 / base64url 解码失败）一律返回 false。
 * 比对用逐字节异或累加（恒定时间比对：无论在哪一位不同都跑满全长，不提前返回）。
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== HASH_FORMAT_PREFIX) return false;
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;
    const salt = base64urlToBytes(parts[2]);
    const expected = base64urlToBytes(parts[3]);
    if (salt.length === 0 || expected.length === 0) return false;

    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const hash = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
      key,
      expected.length * 8,
    );
    const actual = new Uint8Array(hash);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/** 读 settings 表里的管理员密码 hash，未设置返回 null */
export async function getAdminPasswordHash(db: D1Database): Promise<string | null> {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = ?`).bind(ADMIN_PASSWORD_KEY).first();
  if (!row) return null;
  return (row.value as string | null) ?? null;
}

/** 写 / 覆盖 settings 表里的管理员密码 hash */
export async function setAdminPasswordHash(db: D1Database, hash: string): Promise<void> {
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).bind(ADMIN_PASSWORD_KEY, hash).run();
}

/** 是否已设置管理员密码 */
export async function isAdminPasswordSet(db: D1Database): Promise<boolean> {
  return (await getAdminPasswordHash(db)) !== null;
}

/**
 * 创建会话：32 字节随机 token（base64url 编码，只返回给前端这一次），
 * 库里只存其 SHA-256 hex + 过期时间戳（当前时间 + 7 天，秒）。返回原始 token 字符串。
 */
export async function createSession(db: D1Database): Promise<string> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64url(tokenBytes);
  const tokenHash = await sha256Hex(token);
  const expiresAt = getCurrentTimestamp() + SESSION_TTL_SECONDS;
  await db.prepare(`INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)`).bind(tokenHash, expiresAt).run();
  return token;
}

/**
 * 校验会话 token：算 SHA-256 查 sessions 表，存在且未过期返回 true；
 * 已过期则删除该行并返回 false；不存在返回 false。
 */
export async function verifySession(db: D1Database, token: string): Promise<boolean> {
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(`SELECT expires_at FROM sessions WHERE token_hash = ?`).bind(tokenHash).first();
  if (!row) return false;
  const expiresAt = row.expires_at as number;
  if (expiresAt <= getCurrentTimestamp()) {
    await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
    return false;
  }
  return true;
}

/** 按 token 的 SHA-256 删除会话行（logout 用） */
export async function deleteSession(db: D1Database, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
}

/** 删除全部会话（改密码后用：所有端都需重新登录） */
export async function deleteAllSessions(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM sessions`).run();
}

/**
 * 从请求头取管理员会话 token。
 * 支持 Authorization: Bearer <token> 和 X-Admin-Token 两种，Bearer 优先。
 * 参数可以是 Hono 的 Context，也可以是原生 Request。
 */
export function getAdminTokenHeader(c: Context<{ Bindings: Env }> | Request): string | null {
  const header = (name: string): string | undefined => {
    // Hono Context：c.req.header(name)
    if (typeof (c as Context).req?.header === 'function') {
      return (c as Context<{ Bindings: Env }>).req.header(name);
    }
    // 原生 Request：c.headers.get(name)
    if (typeof (c as Request).headers?.get === 'function') {
      return (c as Request).headers.get(name) ?? undefined;
    }
    return undefined;
  };

  const auth = header('Authorization');
  if (auth) {
    // Bearer 不区分大小写，token 前后去空格
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  const adminToken = header('X-Admin-Token');
  if (adminToken && adminToken.trim()) return adminToken.trim();
  return null;
}
