import { API_BASE_URL, MAILBOX_TTL_HOURS } from "../config";

// API请求基础URL
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

// ---- 邮箱访问令牌（zmail_tokens）----
// 创建邮箱时后端只返回一次 accessToken，前端把它存在 localStorage，
// key 为 `zmail_tokens`，值是 JSON 对象 {地址: token}。
// 之后读写删邮箱、读邮件、读附件、删邮件都通过请求头 X-Mailbox-Token 携带，
// 绝不拼进 URL。没有 token 的旧邮箱（后端 access_token 为 NULL）不带请求头即可访问。
const TOKEN_STORAGE_KEY = 'zmail_tokens';

export const getMailboxToken = (address: string): string | null => {
  if (!address) return null;
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const tokens = JSON.parse(raw) as Record<string, string>;
    return typeof tokens[address] === 'string' ? tokens[address] : null;
  } catch {
    return null;
  }
};

export const saveMailboxToken = (address: string, token: string): void => {
  if (!address || !token) return;
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    const tokens: Record<string, string> = raw ? JSON.parse(raw) : {};
    tokens[address] = token;
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  } catch (error) {
    console.error('Error saving mailbox token to localStorage:', error);
  }
};

export const removeMailboxToken = (address: string): void => {
  if (!address) return;
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return;
    const tokens: Record<string, string> = JSON.parse(raw);
    if (address in tokens) {
      delete tokens[address];
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
    }
  } catch (error) {
    console.error('Error removing mailbox token from localStorage:', error);
  }
};

// 该邮箱的 token 请求头；无 token 时返回空对象（旧邮箱按地址可访问）
export const getMailboxTokenHeaders = (address: string): Record<string, string> => {
  const token = getMailboxToken(address);
  return token ? { 'X-Mailbox-Token': token } : {};
};

// ---- 管理员认证 token（zmail_admin_token）----
// 与邮箱 token（zmail_tokens）是两套东西：这个是整站管理密码登录后拿到的
// 会话 token，登录后所有 /api/* 请求都要带 Authorization: Bearer <token>。
const ADMIN_TOKEN_STORAGE_KEY = 'zmail_admin_token';

/** 401 时广播的事件名：App 监听到后回到登录界面（统一处理一次） */
export const ADMIN_UNAUTHORIZED_EVENT = 'zmail:unauthorized';

export const getAdminToken = (): string | null => {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const saveAdminToken = (token: string): void => {
  if (!token) return;
  try {
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch (error) {
    console.error('Error saving admin token to localStorage:', error);
  }
};

export const removeAdminToken = (): void => {
  try {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch (error) {
    console.error('Error removing admin token from localStorage:', error);
  }
};

// 管理员 token 请求头；无 token 时返回空对象（不带请求头）
export const getAdminAuthHeaders = (): Record<string, string> => {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * 所有发往 /api/* 的 fetch 都走这里：统一带上 Authorization: Bearer token。
 * 收到 401 时清掉本地 token 并广播 ADMIN_UNAUTHORIZED_EVENT，App 收到后回登录页。
 * 认证接口本身（登录/设置密码）传 skipAuthEvent=true，避免把“密码错了”
 * 的 401 也当成会话失效广播出去。
 */
export const apiFetch = async (
  url: string,
  init: RequestInit = {},
  skipAuthEvent = false,
): Promise<Response> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getAdminAuthHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (response.status === 401 && !skipAuthEvent) {
    removeAdminToken();
    window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
  }
  return response;
};

// ---- 管理员认证接口（后端契约：返回 JSON {success, ...}）----
export interface AuthStatusResult {
  success: boolean;
  setupRequired: boolean;
  authenticated: boolean;
}

export const authStatus = async (): Promise<AuthStatusResult> => {
  try {
    const response = await apiFetch(apiUrl('/api/auth/status'), {}, true);
    const data = await response.json();
    if (response.ok && data.success) {
      return {
        success: true,
        setupRequired: Boolean(data.setupRequired),
        authenticated: Boolean(data.authenticated),
      };
    }
    return { success: false, setupRequired: false, authenticated: false };
  } catch (error) {
    console.error('Error fetching auth status:', error);
    return { success: false, setupRequired: false, authenticated: false };
  }
};

// 首次设置管理密码（仅未设密码时可用）；成功后自动存 token
export const setupPassword = async (password: string, confirmPassword: string) => {
  try {
    const response = await apiFetch(
      apiUrl('/api/auth/setup'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmPassword }),
      },
      true,
    );
    const data = await response.json();
    if (response.ok && data.success && data.token) {
      saveAdminToken(data.token);
      return { success: true };
    }
    return { success: false, error: data.error || 'Failed to set password' };
  } catch (error) {
    console.error('Error setting up password:', error);
    return { success: false, error };
  }
};

// 管理员登录；成功后自动存 token
export const adminLogin = async (password: string) => {
  try {
    const response = await apiFetch(
      apiUrl('/api/auth/login'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      },
      true,
    );
    const data = await response.json();
    if (response.ok && data.success && data.token) {
      saveAdminToken(data.token);
      return { success: true };
    }
    return { success: false, error: data.error || 'Invalid password' };
  } catch (error) {
    console.error('Error logging in:', error);
    return { success: false, error };
  }
};

// 退出登录：后端失败也清本地 token
export const adminLogout = async () => {
  try {
    await apiFetch(apiUrl('/api/auth/logout'), { method: 'POST' }, true);
  } catch (error) {
    console.error('Error logging out:', error);
  } finally {
    removeAdminToken();
  }
  return { success: true };
};

// 修改密码；成功后全部会话失效，调用方需清 token 回登录页
export const changePassword = async (oldPassword: string, newPassword: string) => {
  try {
    const response = await apiFetch(
      apiUrl('/api/auth/change'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      },
      true,
    );
    const data = await response.json();
    if (response.ok && data.success) {
      removeAdminToken();
      return { success: true };
    }
    return { success: false, error: data.error || 'Failed to change password' };
  } catch (error) {
    console.error('Error changing password:', error);
    return { success: false, error };
  }
};

// 创建成功后如带 accessToken，存入 zmail_tokens
const storeTokenFromMailbox = (mailbox: Mailbox | undefined): void => {
  if (mailbox?.address && mailbox.accessToken) {
    saveMailboxToken(mailbox.address, mailbox.accessToken);
  }
};

// 创建随机邮箱
export const createRandomMailbox = async (expiresInHours = MAILBOX_TTL_HOURS) => {
  try {
    const requestBody = JSON.stringify({
      expiresInHours,
    });
    
    const response = await apiFetch(apiUrl('/api/mailboxes'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });
    
    if (!response.ok) {
      throw new Error('Failed to create mailbox');
    }
    
    const data = await response.json();
    
    if (data.success) {
      storeTokenFromMailbox(data.mailbox);
      return { success: true, mailbox: data.mailbox };
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    return { success: false, error };
  }
};

// 创建自定义邮箱
export const createCustomMailbox = async (address: string, expiresInHours = MAILBOX_TTL_HOURS) => {
  try {
    if (!address.trim()) {
      return { success: false, error: 'Invalid address' };
    }
    
    const response = await apiFetch(apiUrl('/api/mailboxes'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: address.trim(),
        expiresInHours,
      }),
    });
    
    // 尝试解析响应内容
    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 400) {
        // 使用后端返回的错误信息
        return { success: false, error: data.error || 'Address already exists' };
      }
      throw new Error(data.error || 'Failed to create mailbox');
    }
    
    if (data.success) {
      storeTokenFromMailbox(data.mailbox);
      return { success: true, mailbox: data.mailbox };
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error creating custom mailbox:', error);
    return { success: false, error };
  }
};

// 获取邮箱信息
export const getMailbox = async (address: string) => {
  try {
    const response = await apiFetch(apiUrl(`/api/mailboxes/${address}`), {
      headers: getMailboxTokenHeaders(address),
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Mailbox not found' };
      }
      throw new Error('Failed to fetch mailbox');
    }
    
    const data = await response.json();
    if (data.success) {
      return { success: true, mailbox: data.mailbox };
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error fetching mailbox:', error);
    return { success: false, error };
  }
};

// 获取邮件列表
export const getEmails = async (address: string) => {
  try {
    // 检查地址是否为空
    if (!address) {
      return { success: false, error: 'Address is empty', emails: [] };
    }
    
    const response = await apiFetch(apiUrl(`/api/mailboxes/${address}/emails`), {
      headers: getMailboxTokenHeaders(address),
    });
    
    // 直接处理404状态码
    if (response.status === 404) {
      return { success: false, error: 'Mailbox not found', notFound: true };
    }
    
    if (!response.ok) {
      throw new Error(`Failed to fetch emails: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, emails: data.emails };
    } else {
      // 检查错误信息是否包含"邮箱不存在"
      if (data.error && (data.error.includes('邮箱不存在') || data.error.includes('Mailbox not found'))) {
        return { success: false, error: data.error, notFound: true };
      }
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    return { success: false, error, emails: [] };
  }
};

// 删除邮箱
export const deleteMailbox = async (address: string) => {
  try {
    const response = await apiFetch(apiUrl(`/api/mailboxes/${address}`), {
      method: 'DELETE',
      headers: getMailboxTokenHeaders(address),
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete mailbox');
    }
    
    const data = await response.json();
    if (data.success) {
      return { success: true };
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error deleting mailbox:', error);
    return { success: false, error };
  }
};

// 保存邮箱信息到本地存储（accessToken 不存这里，token 只放 zmail_tokens）
export const saveMailboxToLocalStorage = (mailbox: Mailbox) => {
  const { accessToken: _accessToken, ...mailboxWithoutToken } = mailbox;
  localStorage.setItem('tempMailbox', JSON.stringify({
    ...mailboxWithoutToken,
    savedAt: Date.now() / 1000
  }));
};

// 从本地存储获取邮箱信息
export const getMailboxFromLocalStorage = (): Mailbox | null => {
  const savedMailbox = localStorage.getItem('tempMailbox');
  if (!savedMailbox) return null;
  
  try {
    const mailbox = JSON.parse(savedMailbox) as Mailbox & { savedAt: number };
    const now = Date.now() / 1000;
    
    // 检查邮箱是否过期
    if (mailbox.expiresAt < now) {
      localStorage.removeItem('tempMailbox');
      return null;
    }
    
    return mailbox;
  } catch (error) {
    localStorage.removeItem('tempMailbox');
    return null;
  }
};

// 从本地存储删除邮箱信息
export const removeMailboxFromLocalStorage = () => {
  localStorage.removeItem('tempMailbox');
};
