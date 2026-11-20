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
    
    const response = await fetch(apiUrl('/api/mailboxes'), {
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
    
    const response = await fetch(apiUrl('/api/mailboxes'), {
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
    const response = await fetch(apiUrl(`/api/mailboxes/${address}`), {
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
    
    const response = await fetch(apiUrl(`/api/mailboxes/${address}/emails`), {
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
    const response = await fetch(apiUrl(`/api/mailboxes/${address}`), {
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
