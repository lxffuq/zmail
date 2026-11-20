import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createRandomMailbox, createCustomMailbox, deleteMailbox as deleteMailboxApi, removeMailboxToken } from '../utils/api';
import { CUSTOM_ADDRESS_PATTERN } from './CreateMailboxForm';

interface HeaderMailboxProps {
  mailbox: Mailbox | null;
  onMailboxChange: (mailbox: Mailbox) => void;
  domain: string;
  isLoading: boolean;
}

const HeaderMailbox: React.FC<HeaderMailboxProps> = ({ 
  mailbox, 
  onMailboxChange,
  domain,
  isLoading
}) => {
  const { t } = useTranslation();
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customAddress, setCustomAddress] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showCopyTooltip, setShowCopyTooltip] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [customAddressError, setCustomAddressError] = useState<string | null>(null);
  const [customAddressSuccess, setCustomAddressSuccess] = useState<string | null>(null);
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);
  const copyTooltipTimeoutRef = useRef<number | null>(null);
  const refreshSuccessTimeoutRef = useRef<number | null>(null);
  const successMessageTimeoutRef = useRef<number | null>(null);
  const errorMessageTimeoutRef = useRef<number | null>(null);
  
  // 清除提示的定时器
  useEffect(() => {
    return () => {
      if (copyTooltipTimeoutRef.current) {
        window.clearTimeout(copyTooltipTimeoutRef.current);
      }
      if (refreshSuccessTimeoutRef.current) {
        window.clearTimeout(refreshSuccessTimeoutRef.current);
      }
      if (successMessageTimeoutRef.current) {
        window.clearTimeout(successMessageTimeoutRef.current);
      }
      if (errorMessageTimeoutRef.current) {
        window.clearTimeout(errorMessageTimeoutRef.current);
      }
    };
  }, []);
  
  if (!mailbox || isLoading) return null;

  // 完整地址：未设置域名时只显示用户名部分，不拼出残缺的 @
  const fullAddress = mailbox.address.includes('@')
    ? mailbox.address
    : (domain ? `${mailbox.address}@${domain}` : mailbox.address);

  // 复制邮箱地址到剪贴板
  const copyToClipboard = () => {
    // 清除之前的错误信息
    setCopyError(null);
    
    navigator.clipboard.writeText(fullAddress)
      .then(() => {
        // 显示复制成功提示
        setShowCopyTooltip(true);
        
        // 2秒后隐藏提示
        if (copyTooltipTimeoutRef.current) {
          window.clearTimeout(copyTooltipTimeoutRef.current);
        }
        copyTooltipTimeoutRef.current = window.setTimeout(() => {
          setShowCopyTooltip(false);
        }, 2000);
      })
      .catch(() => {
        // 显示复制失败错误
        setCopyError(t('mailbox.copyFailed'));
        
        // 3秒后隐藏错误
        if (errorMessageTimeoutRef.current) {
          window.clearTimeout(errorMessageTimeoutRef.current);
        }
        errorMessageTimeoutRef.current = window.setTimeout(() => {
          setCopyError(null);
        }, 3000);
      });
  };
  
  // 更换随机邮箱：先调后端删除旧邮箱，再创建新邮箱
  const handleRefreshMailbox = async () => {
    // 清除之前的错误信息
    setRefreshError(null);
    
    setIsActionLoading(true);
    const oldAddress = mailbox.address;
    try {
      const deleteResult = await deleteMailboxApi(oldAddress);
      if (!deleteResult.success) {
        console.error('Failed to delete old mailbox on server:', oldAddress, deleteResult.error);
      }
    } catch (error) {
      console.error('Failed to delete old mailbox on server:', oldAddress, error);
    }
    // 切换邮箱时删掉旧地址的 token（后端失败也清本地）
    removeMailboxToken(oldAddress);
    const result = await createRandomMailbox();
    setIsActionLoading(false);
    
    if (result.success && result.mailbox) {
      onMailboxChange(result.mailbox);
      
      // 显示更新成功提示
      setShowRefreshSuccess(true);
      
      // 3秒后隐藏提示
      if (refreshSuccessTimeoutRef.current) {
        window.clearTimeout(refreshSuccessTimeoutRef.current);
      }
      refreshSuccessTimeoutRef.current = window.setTimeout(() => {
        setShowRefreshSuccess(false);
      }, 3000);
    } else {
      // 显示刷新失败错误
      setRefreshError(t('mailbox.refreshFailed'));
      
      // 3秒后隐藏错误
      if (errorMessageTimeoutRef.current) {
        window.clearTimeout(errorMessageTimeoutRef.current);
      }
      errorMessageTimeoutRef.current = window.setTimeout(() => {
        setRefreshError(null);
      }, 3000);
    }
  };
  
  // 创建自定义邮箱
  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 清除之前的错误和成功信息
    setCustomAddressError(null);
    setCustomAddressSuccess(null);
    
    if (!customAddress.trim()) {
      setCustomAddressError(t('mailbox.invalidAddress'));
      return;
    }

    // 提交前校验格式，不通过不发请求
    if (!CUSTOM_ADDRESS_PATTERN.test(customAddress.trim())) {
      setCustomAddressError('自定义地址格式不正确：仅支持小写字母、数字、点、下划线和连字符，长度 3-32 个字符');
      return;
    }
    
    setIsActionLoading(true);
    const oldAddress = mailbox.address;
    const result = await createCustomMailbox(customAddress);
    setIsActionLoading(false);
    
    if (result.success && result.mailbox) {
      // 创建成功后再删旧邮箱（避免地址已存在等 400 时丢了旧邮箱），并清旧地址 token
      try {
        const deleteResult = await deleteMailboxApi(oldAddress);
        if (!deleteResult.success) {
          console.error('Failed to delete old mailbox on server:', oldAddress, deleteResult.error);
        }
      } catch (error) {
        console.error('Failed to delete old mailbox on server:', oldAddress, error);
      }
      removeMailboxToken(oldAddress);
      onMailboxChange(result.mailbox);
      
      // 显示成功消息在表单下方
      setCustomAddressSuccess(t('mailbox.createSuccess'));
      
      // 3秒后自动关闭表单
      if (successMessageTimeoutRef.current) {
        window.clearTimeout(successMessageTimeoutRef.current);
      }
      successMessageTimeoutRef.current = window.setTimeout(() => {
        setIsCustomMode(false);
        setCustomAddress('');
        setCustomAddressSuccess(null);
      }, 3000);
    } else {
      // 检查错误信息是否包含"邮箱地址已存在"
      const isAddressExistsError = 
        result.error === 'Address already exists' || 
        String(result.error).includes('已存在');
      
      if (isAddressExistsError) {
        setCustomAddressError(t('mailbox.addressExists'));
      } else {
        setCustomAddressError(t('mailbox.createFailed'));
      }
    }
  };
  
  // 取消自定义模式
  const handleCancelCustom = () => {
    setIsCustomMode(false);
    setCustomAddress('');
    setCustomAddressError(null);
    setCustomAddressSuccess(null);
  };
  
  // 按钮基础样式（图标按钮统一 40px 点击区）
  const buttonBaseClass = "flex items-center justify-center transition-all duration-200";
  const copyButtonClass = `${buttonBaseClass} glass-chip hover:scale-105 mx-1`;
  const refreshButtonClass = `${buttonBaseClass} glass-chip hover:scale-105 mr-1`;
  const customizeButtonClass = `${buttonBaseClass} btn-gradient hover:scale-105`;
  
  return (
    <div className="flex items-center">
      {isCustomMode ? (
        <form onSubmit={handleCreateCustom} className="flex flex-col space-y-2 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center flex-1 min-w-[180px]">
              <input
                type="text"
                value={customAddress}
                onChange={(e) => {
                  setCustomAddress(e.target.value);
                  if (customAddressError) setCustomAddressError(null);
                  if (customAddressSuccess) setCustomAddressSuccess(null);
                }}
                className={`glass-input flex-1 min-w-0 px-3 py-2 text-sm rounded-l-xl focus:outline-none focus:ring-1 focus:ring-primary ${
                  customAddressError ? 'border-red-500' : ''
                }`}
                placeholder={t('mailbox.customAddressPlaceholder')}
                disabled={isActionLoading}
                autoFocus
              />
              {domain !== '' && (
                <span className="px-2 py-2 text-sm text-slate-300 border-y border-r border-white/10 rounded-r-xl bg-white/5 whitespace-nowrap">
                  @{domain}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleCancelCustom}
              className="px-3 py-2 min-h-[36px] text-sm rounded-full glass-btn transition-colors"
              disabled={isActionLoading}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="px-3 py-2 min-h-[36px] text-sm rounded-full btn-gradient transition-colors"
              disabled={isActionLoading}
            >
              {isActionLoading ? t('common.loading') : t('common.create')}
            </button>
          </div>
          
          {/* 错误信息显示 */}
          {customAddressError && (
            <div className="text-red-300 text-xs px-1">
              {customAddressError}
            </div>
          )}
          
          {/* 成功信息显示 */}
          {customAddressSuccess && (
            <div className="text-green-300 text-xs px-1">
              {customAddressSuccess}
            </div>
          )}
        </form>
      ) : (
        <>
          {/* 桌面版显示 */}
          <div className="hidden md:flex items-center flex-col">
            {/* 邮箱地址和操作按钮 */}
            <div className="flex items-center">
              <code className="px-3 py-1.5 text-[15px] font-semibold text-slate-50 break-all">
                {fullAddress}
              </code>
              
              <div className="relative">
                <button
                  onClick={copyToClipboard}
                  className={`w-10 h-10 rounded-full ${copyButtonClass}`}
                  aria-label={t('common.copy')}
                  title={t('common.copy')}
                >
                  <i className="fas fa-copy text-sm"></i>
                </button>
                
                {/* 复制成功提示 */}
                {showCopyTooltip && (
                  <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-slate-800/95 text-slate-100 border border-white/10 text-xs py-1 px-2 rounded-lg shadow-xl whitespace-nowrap z-10">
                    {t('mailbox.copySuccess')}
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                  </div>
                )}
              </div>
              
              <div className="relative">
                <button
                  onClick={handleRefreshMailbox}
                  className={`w-10 h-10 rounded-full ${refreshButtonClass}`}
                  disabled={isActionLoading}
                  title={t('mailbox.refresh')}
                >
                  <i className="fas fa-sync-alt text-sm"></i>
                </button>
                
                {/* 更新成功提示 */}
                {showRefreshSuccess && (
                  <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-slate-800/95 text-slate-100 border border-white/10 text-xs py-1 px-2 rounded-lg shadow-xl whitespace-nowrap z-10">
                    {t('mailbox.refreshSuccess')}
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                  </div>
                )}
              </div>
              
              <button
                onClick={() => setIsCustomMode(true)}
                className={`w-10 h-10 rounded-full ${customizeButtonClass}`}
                disabled={isActionLoading}
                title={t('mailbox.customize')}
              >
                <i className="fas fa-edit text-sm"></i>
              </button>
            </div>
            
            {/* 错误信息显示 */}
            {(copyError || refreshError) && (
              <div className="text-red-300 text-xs mt-1">
                {copyError || refreshError}
              </div>
            )}
          </div>
          
          {/* 移动版显示：地址独占一行完整显示（自动换行不截断），按钮另起一行 */}
          <div className="flex md:hidden flex-col items-stretch gap-2.5 w-full">
            <code className="w-full break-all bg-white/10 text-slate-50 px-3 py-2.5 rounded-xl text-sm font-semibold border border-white/10">
              {fullAddress}
            </code>

            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  onClick={copyToClipboard}
                  className={`w-10 h-10 rounded-full ${copyButtonClass}`}
                  aria-label={t('common.copy')}
                  title={t('common.copy')}
                >
                  <i className="fas fa-copy text-sm"></i>
                </button>

                {/* 复制成功提示 */}
                {showCopyTooltip && (
                  <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-slate-800/95 text-slate-100 border border-white/10 text-xs py-1 px-2 rounded-lg shadow-xl whitespace-nowrap z-10">
                    {t('mailbox.copySuccess')}
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={handleRefreshMailbox}
                  className={`w-10 h-10 rounded-full ${refreshButtonClass}`}
                  disabled={isActionLoading}
                  title={t('mailbox.refresh')}
                >
                  <i className="fas fa-sync-alt text-sm"></i>
                </button>

                {/* 更新成功提示 */}
                {showRefreshSuccess && (
                  <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-slate-800/95 text-slate-100 border border-white/10 text-xs py-1 px-2 rounded-lg shadow-xl whitespace-nowrap z-10">
                    {t('mailbox.refreshSuccess')}
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsCustomMode(true)}
                className={`w-10 h-10 rounded-full ${customizeButtonClass}`}
                disabled={isActionLoading}
                title={t('mailbox.customize')}
              >
                <i className="fas fa-edit text-sm"></i>
              </button>
            </div>

            {/* 错误信息显示 */}
            {(copyError || refreshError) && (
              <div className="text-red-300 text-xs px-1">
                {copyError || refreshError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default HeaderMailbox; 