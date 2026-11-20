import React, { createContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { 
  createRandomMailbox, 
  deleteMailbox as deleteMailboxApi,
  removeMailboxToken,
  getMailboxFromLocalStorage, 
  saveMailboxToLocalStorage,
  removeMailboxFromLocalStorage,
  getEmails
} from '../utils/api';
import { useTranslation } from 'react-i18next';
import { DEFAULT_AUTO_REFRESH, AUTO_REFRESH_INTERVAL } from '../config';

// 邮件详情缓存接口
interface EmailCache {
  [emailId: string]: {
    email: Email;
    attachments: any[];
    timestamp: number;
  }
}

// 邮件详情缓存 TTL：1 小时
const EMAIL_CACHE_TTL_MS = 60 * 60 * 1000;
// 大邮件不进 localStorage 的阈值：htmlContent + textContent 总长度超过 200KB
const EMAIL_CACHE_LOCAL_STORAGE_MAX_SIZE = 200 * 1024;

interface MailboxContextType {
  mailbox: Mailbox | null;
  setMailbox: (mailbox: Mailbox) => void;
  isLoading: boolean;
  emails: Email[];
  setEmails: (emails: Email[]) => void;
  selectedEmail: string | null;
  setSelectedEmail: (id: string | null) => void;
  isEmailsLoading: boolean;
  setIsEmailsLoading: (loading: boolean) => void;
  autoRefresh: boolean;
  setAutoRefresh: (autoRefresh: boolean) => void;
  createNewMailbox: () => Promise<void>;
  deleteMailbox: () => void;
  refreshEmails: () => Promise<void>;
  emailCache: EmailCache;
  addToEmailCache: (emailId: string, email: Email, attachments: any[]) => void;
  clearEmailCache: () => void;
  handleMailboxNotFound: () => Promise<void>;
  errorMessage: string | null;
  successMessage: string | null;
}

export const MailboxContext = createContext<MailboxContextType>({
  mailbox: null,
  setMailbox: () => {},
  isLoading: false,
  emails: [],
  setEmails: () => {},
  selectedEmail: null,
  setSelectedEmail: () => {},
  isEmailsLoading: false,
  setIsEmailsLoading: () => {},
  autoRefresh: DEFAULT_AUTO_REFRESH,
  setAutoRefresh: () => {},
  createNewMailbox: async () => {},
  deleteMailbox: () => {},
  refreshEmails: async () => {},
  emailCache: {},
  addToEmailCache: () => {},
  clearEmailCache: () => {},
  handleMailboxNotFound: async () => {},
  errorMessage: null,
  successMessage: null
});

interface MailboxProviderProps {
  children: ReactNode;
}

export const MailboxProvider: React.FC<MailboxProviderProps> = ({ children }) => {
  const { t } = useTranslation();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [isEmailsLoading, setIsEmailsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(DEFAULT_AUTO_REFRESH);
  const [emailCache, setEmailCache] = useState<EmailCache>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);
  const successTimeoutRef = useRef<number | null>(null);
  // 轮询进行中标志：用 ref 而不用 state，state 在闭包里会拿到旧值
  const refreshInFlightRef = useRef(false);
  
  // 清除提示的定时器
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current);
      }
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);
  
  // 初始化：检查本地存储或创建新邮箱
  useEffect(() => {
    const initMailbox = async () => {
      // 检查本地存储中是否有未过期的邮箱
      const savedMailbox = getMailboxFromLocalStorage();
      
      if (savedMailbox) {
        setMailbox(savedMailbox);
        setIsLoading(false);
      } else {
        // 创建新邮箱
        await createNewMailbox();
      }
    };
    
    initMailbox();
  }, []);
  
  // 创建新邮箱
  const createNewMailbox = async () => {
    try {
      // 清除之前的错误和成功信息
      setErrorMessage(null);
      setSuccessMessage(null);
      
      console.log('createNewMailbox: Started');
      setIsLoading(true);
      
      console.log('createNewMailbox: Calling createRandomMailbox...');
      const result = await createRandomMailbox();
      console.log('createNewMailbox: createRandomMailbox result:', result);
      
      if (result.success && result.mailbox) {
        console.log('createNewMailbox: Setting new mailbox:', result.mailbox);
        setMailbox(result.mailbox);
        saveMailboxToLocalStorage(result.mailbox);
      } else {
        console.error('createNewMailbox: Failed to create mailbox:', result.error);
        setErrorMessage(t('mailbox.createFailed'));
        
        // 3秒后清除错误信息
        if (errorTimeoutRef.current) {
          window.clearTimeout(errorTimeoutRef.current);
        }
        errorTimeoutRef.current = window.setTimeout(() => {
          setErrorMessage(null);
        }, 3000);
        throw new Error('Failed to create mailbox');
      }
    } catch (error) {
      console.error('createNewMailbox: Error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // 清理指定邮箱在 localStorage 里的邮件缓存；是当前邮箱时也清内存缓存
  const removeEmailCacheForAddress = (address: string) => {
    try {
      localStorage.removeItem(`emailCache_${address}`);
    } catch (error) {
      console.error('Error clearing email cache from localStorage:', error);
    }
    if (mailbox?.address === address) {
      setEmailCache({});
    }
  };
  
  // 删除邮箱：先调后端 DELETE，成功后再清本地；后端失败也清本地并记 console.error
  const deleteMailbox = async () => {
    const oldAddress = mailbox?.address;
    if (oldAddress) {
      try {
        const result = await deleteMailboxApi(oldAddress);
        if (!result.success) {
          console.error('Failed to delete mailbox on server:', oldAddress, result.error);
        }
      } catch (error) {
        console.error('Failed to delete mailbox on server:', oldAddress, error);
      }
    }
    setMailbox(null);
    setEmails([]);
    setSelectedEmail(null);
    removeMailboxFromLocalStorage();
    if (oldAddress) {
      removeMailboxToken(oldAddress);
      removeEmailCacheForAddress(oldAddress);
    }
    createNewMailbox();
  };
  
  // 刷新邮件列表
  const refreshEmails = async () => {
    if (!mailbox) return;
    
    // 防止重复请求（ref 标志，请求结束复位）
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    
    setIsEmailsLoading(true);
    
    try {
      const result = await getEmails(mailbox.address);
      
      if (result.success) {
        setEmails(result.emails);
      } else if (result.notFound) {
        // 如果邮箱不存在，清除本地缓存并创建新邮箱
        try {
          // 直接调用handleMailboxNotFound函数
          await handleMailboxNotFound();
        } catch (error) {
          // 出错时也尝试清除缓存并创建新邮箱
          setMailbox(null);
          setEmails([]);
          setSelectedEmail(null);
          removeMailboxFromLocalStorage();
          clearEmailCache();
          
          // 刷新页面
          window.location.href = '/';
        }
      }
    } catch (error) {
      // 错误处理
      console.error('Error refreshing emails:', error);
    } finally {
      refreshInFlightRef.current = false;
      setIsEmailsLoading(false);
    }
  };
  
  // 自动刷新邮件：页面隐藏时停掉定时器，重新可见时立即刷一次并恢复定时器
  useEffect(() => {
    if (!mailbox) return;
    
    // 首次加载邮件（无论autoRefresh是否开启）
    refreshEmails();
    
    // 如果自动刷新开启，则设置定时器
    let intervalId: number | undefined;
    const startInterval = () => {
      if (autoRefresh && intervalId === undefined) {
        intervalId = window.setInterval(refreshEmails, AUTO_REFRESH_INTERVAL);
      }
    };
    const stopInterval = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopInterval();
      } else {
        // 重新可见时立即刷一次并恢复定时器
        refreshEmails();
        stopInterval();
        startInterval();
      }
    };

    startInterval();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopInterval();
    };
  }, [mailbox, autoRefresh]);
  
  // 处理邮箱不存在的情况
  const handleMailboxNotFound = async () => {
    try {
      // 清除之前的错误和成功信息
      setErrorMessage(null);
      setSuccessMessage(null);
      
      setSuccessMessage(t('mailbox.creatingNew'));
      
      // 清除当前邮箱信息
      const oldAddress = mailbox?.address;
      setMailbox(null);
      setEmails([]);
      setSelectedEmail(null);
      removeMailboxFromLocalStorage();
      if (oldAddress) {
        removeMailboxToken(oldAddress);
        removeEmailCacheForAddress(oldAddress);
      }
      clearEmailCache();
      
      // 创建新邮箱
      try {
        const result = await createRandomMailbox();
        
        if (result.success && result.mailbox) {
          // 直接保存到localStorage，而不是通过setMailbox触发状态更新
          saveMailboxToLocalStorage(result.mailbox);
          
          // 直接刷新页面，让页面重新加载时从localStorage获取新邮箱
          window.location.href = '/'; // 使用href而不是reload，确保导航到首页
        } else {
          throw new Error('Failed to create mailbox');
        }
      } catch (error) {
        throw error;
      }
    } catch (error) {
      throw error;
    }
  };
  
  // 添加邮件到缓存：用 useCallback 包起来，避免每次渲染生成新函数
  // 导致 EmailDetail 的 useEffect 重复请求
  const addToEmailCache = useCallback((emailId: string, email: Email, attachments: any[]) => {
    const mailboxAddress = mailbox?.address;
    const entry = {
      email,
      attachments,
      timestamp: Date.now()
    };
    setEmailCache(prev => {
      const updatedCache = {
        ...prev,
        [emailId]: entry
      };
      // 大邮件不进 localStorage（htmlContent + textContent 总长度超过 200KB）
      if (mailboxAddress) {
        const contentSize = (email.htmlContent?.length || 0) + (email.textContent?.length || 0);
        if (contentSize <= EMAIL_CACHE_LOCAL_STORAGE_MAX_SIZE) {
          try {
            const cacheKey = `emailCache_${mailboxAddress}`;
            localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
          } catch (error) {
            console.error('Error saving email cache to localStorage:', error);
          }
        }
      }
      return updatedCache;
    });
  }, [mailbox?.address]);
  
  // 清除邮件缓存
  const clearEmailCache = () => {
    setEmailCache({});
    
    // 清除localStorage中的缓存
    try {
      const mailboxAddress = mailbox?.address;
      if (mailboxAddress) {
        const cacheKey = `emailCache_${mailboxAddress}`;
        localStorage.removeItem(cacheKey);
      }
    } catch (error) {
      console.error('Error clearing email cache from localStorage:', error);
    }
  };
  
  // 从localStorage加载邮件缓存（过期条目直接丢弃，TTL 1 小时）
  useEffect(() => {
    if (!mailbox) return;
    
    try {
      const cacheKey = `emailCache_${mailbox.address}`;
      const cachedData = localStorage.getItem(cacheKey);
      
      if (cachedData) {
        const parsedCache = JSON.parse(cachedData) as EmailCache;
        const now = Date.now();
        const freshCache: EmailCache = {};
        let hasExpired = false;
        for (const [emailId, entry] of Object.entries(parsedCache)) {
          if (entry && now - entry.timestamp <= EMAIL_CACHE_TTL_MS) {
            freshCache[emailId] = entry;
          } else {
            hasExpired = true;
          }
        }
        setEmailCache(freshCache);
        if (hasExpired) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify(freshCache));
          } catch (error) {
            console.error('Error saving email cache to localStorage:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading email cache from localStorage:', error);
    }
  }, [mailbox]);
  
  // 设置邮箱并保存到localStorage；切换邮箱时清理旧邮箱的 token 和邮件缓存
  const handleSetMailbox = (newMailbox: Mailbox) => {
    const oldAddress = mailbox?.address;
    if (oldAddress && oldAddress !== newMailbox.address) {
      removeMailboxToken(oldAddress);
      removeEmailCacheForAddress(oldAddress);
    }
    setMailbox(newMailbox);
    saveMailboxToLocalStorage(newMailbox);
  };
  
  return (
    <MailboxContext.Provider
      value={{
        mailbox,
        setMailbox: handleSetMailbox,
        isLoading,
        emails,
        setEmails,
        selectedEmail,
        setSelectedEmail,
        isEmailsLoading,
        setIsEmailsLoading,
        autoRefresh,
        setAutoRefresh,
        createNewMailbox,
        deleteMailbox,
        refreshEmails,
        emailCache,
        addToEmailCache,
        clearEmailCache,
        handleMailboxNotFound,
        errorMessage,
        successMessage
      }}
    >
      {/* 错误和成功提示 */}
      {(errorMessage || successMessage) && (
        <div className="fixed top-4 right-4 z-50 p-3 rounded-md shadow-lg max-w-md" style={{ backgroundColor: errorMessage ? '#FEE2E2' : '#ECFDF5', color: errorMessage ? '#991B1B' : '#065F46' }}>
          {errorMessage || successMessage}
        </div>
      )}
      {children}
    </MailboxContext.Provider>
  );
};
