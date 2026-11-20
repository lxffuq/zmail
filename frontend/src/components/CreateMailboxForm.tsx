import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MAILBOX_TTL_HOURS } from '../config';
import { apiFetch, saveMailboxToken } from '../utils/api';

// 自定义地址格式：3-32 个字符，仅小写字母、数字、点、下划线、连字符（与后端一致）
export const CUSTOM_ADDRESS_PATTERN = /^[a-z0-9._-]{3,32}$/;
const CUSTOM_ADDRESS_ERROR = '自定义地址格式不正确：仅支持小写字母、数字、点、下划线和连字符，长度 3-32 个字符';

interface CreateMailboxFormProps {
  onMailboxCreated: (address: string) => void;
}

const CreateMailboxForm: React.FC<CreateMailboxFormProps> = ({ onMailboxCreated }) => {
  const { t } = useTranslation();
  const [isCustom, setIsCustom] = useState(false);
  const [customAddress, setCustomAddress] = useState('');
  const expiresInHours = MAILBOX_TTL_HOURS;
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);
  const successTimeoutRef = useRef<number | null>(null);
  
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
  
  const handleCreateRandom = async () => {
    try {
      // 清除之前的错误和成功信息
      setErrorMessage(null);
      setSuccessMessage(null);
      
      setIsLoading(true);
      const response = await apiFetch('/api/mailboxes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expiresInHours,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create mailbox');
      }
      
      const data = await response.json();
      if (data.success) {
        // 创建时后端只返回一次 accessToken，存入 zmail_tokens
        if (data.mailbox?.address && data.mailbox.accessToken) {
          saveMailboxToken(data.mailbox.address, data.mailbox.accessToken);
        }
        setSuccessMessage(t('mailbox.createSuccess'));
        
        // 2秒后调用回调函数
        if (successTimeoutRef.current) {
          window.clearTimeout(successTimeoutRef.current);
        }
        successTimeoutRef.current = window.setTimeout(() => {
          onMailboxCreated(data.mailbox.address);
        }, 2000);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      setErrorMessage(t('mailbox.createFailed'));
      
      // 3秒后清除错误信息
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = window.setTimeout(() => {
        setErrorMessage(null);
      }, 3000);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 清除之前的错误和成功信息
    setErrorMessage(null);
    setSuccessMessage(null);
    
    if (!customAddress.trim()) {
      setErrorMessage(t('mailbox.invalidAddress'));
      
      // 3秒后清除错误信息
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = window.setTimeout(() => {
        setErrorMessage(null);
      }, 3000);
      return;
    }

    // 提交前校验格式，不通过不发请求
    if (!CUSTOM_ADDRESS_PATTERN.test(customAddress.trim())) {
      setErrorMessage(CUSTOM_ADDRESS_ERROR);

      // 3秒后清除错误信息
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = window.setTimeout(() => {
        setErrorMessage(null);
      }, 3000);
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await apiFetch('/api/mailboxes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: customAddress.trim(),
          expiresInHours,
        }),
      });
      
      if (!response.ok) {
        if (response.status === 400) {
          setErrorMessage(t('mailbox.addressExists'));
          
          // 3秒后清除错误信息
          if (errorTimeoutRef.current) {
            window.clearTimeout(errorTimeoutRef.current);
          }
          errorTimeoutRef.current = window.setTimeout(() => {
            setErrorMessage(null);
          }, 3000);
          return;
        }
        throw new Error('Failed to create mailbox');
      }
      
      const data = await response.json();
      if (data.success) {
        // 创建时后端只返回一次 accessToken，存入 zmail_tokens
        if (data.mailbox?.address && data.mailbox.accessToken) {
          saveMailboxToken(data.mailbox.address, data.mailbox.accessToken);
        }
        setSuccessMessage(t('mailbox.createSuccess'));
        
        // 2秒后调用回调函数
        if (successTimeoutRef.current) {
          window.clearTimeout(successTimeoutRef.current);
        }
        successTimeoutRef.current = window.setTimeout(() => {
          onMailboxCreated(data.mailbox.address);
        }, 2000);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      setErrorMessage(t('mailbox.createFailed'));
      
      // 3秒后清除错误信息
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = window.setTimeout(() => {
        setErrorMessage(null);
      }, 3000);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="glass rounded-3xl p-5 sm:p-6 animate-fade-up">
      {/* 错误和成功提示 */}
      {(errorMessage || successMessage) && (
        <div className={`p-3 mb-4 rounded-xl border text-sm ${errorMessage ? 'bg-red-500/15 border-red-400/30 text-red-300' : 'bg-green-500/15 border-green-400/30 text-green-300'}`}>
          {errorMessage || successMessage}
        </div>
      )}
      
      <div className="flex mb-5">
        <button
          type="button"
          className={`flex-1 py-3 px-4 min-h-[44px] rounded-l-full text-sm font-medium ${
            !isCustom ? 'btn-gradient' : 'glass-btn'
          }`}
          onClick={() => setIsCustom(false)}
        >
          {t('mailbox.createRandom')}
        </button>
        <button
          type="button"
          className={`flex-1 py-3 px-4 min-h-[44px] rounded-r-full text-sm font-medium ${
            isCustom ? 'btn-gradient' : 'glass-btn'
          }`}
          onClick={() => setIsCustom(true)}
        >
          {t('mailbox.createCustom')}
        </button>
      </div>
      
      {isCustom ? (
        <form onSubmit={handleCreateCustom}>
          <div className="flex flex-col space-y-4">
            <div className="flex">
              <input
                type="text"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                className="glass-input flex-1 min-w-0 px-4 py-3 rounded-l-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={t('mailbox.customAddressPlaceholder')}
                disabled={isLoading}
              />
              <button
                type="submit"
                className="btn-gradient flex-none px-5 py-3 min-h-[44px] rounded-r-xl focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              >
                {isLoading ? t('common.loading') : t('common.create')}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={handleCreateRandom}
          className="btn-gradient w-full px-4 py-3 min-h-[44px] rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isLoading}
        >
          {isLoading ? t('common.loading') : t('mailbox.createRandom')}
        </button>
      )}
    </div>
  );
};

export default CreateMailboxForm; 