import React, { useState, useEffect, useContext, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { API_BASE_URL } from '../config';
import { apiFetch, getMailboxTokenHeaders } from '../utils/api';
import { MailboxContext } from '../contexts/MailboxContext';

interface EmailDetailProps {
  emailId: string;
  onClose: () => void;
}

interface Attachment {
  id: string;
  emailId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
  isLarge: boolean;
  chunksCount: number;
}

// 邮件详情缓存 TTL：1 小时，过期视为未命中
const EMAIL_CACHE_TTL_MS = 60 * 60 * 1000;

// 附件预览白名单：只允许 PDF 和常见图片类型进 iframe/图片预览，
// 其他类型只提供下载入口，不预览。SVG 不在白名单内（可能内嵌脚本）。
const PREVIEWABLE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
]);

const normalizeMimeType = (mimeType: string): string =>
  mimeType.split(';')[0].trim().toLowerCase();

const isPreviewableAttachment = (mimeType: string): boolean => {
  const normalized = normalizeMimeType(mimeType);
  return normalized === 'application/pdf' || PREVIEWABLE_IMAGE_MIME_TYPES.has(normalized);
};

// 附件预览：先用带 token 的 fetch 取内容转成 blob URL 再渲染，
// 这样请求头 X-Mailbox-Token 才能带上（<img>/<iframe> 的 src 无法带请求头）。
// PDF 的 iframe 加 sandbox=""，禁止其中脚本执行。
const AttachmentPreview: React.FC<{ attachment: Attachment; mailboxAddress: string }> = ({
  attachment,
  mailboxAddress,
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isPreviewableAttachment(attachment.mimeType)) return;

    let cancelled = false;
    let url: string | null = null;

    (async () => {
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/attachments/${attachment.id}?download=true`,
          { headers: getMailboxTokenHeaders(mailboxAddress) },
        );
        if (!response.ok) return;
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
        if (!cancelled) {
          setObjectUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error('Error fetching attachment preview:', error);
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id, attachment.mimeType, mailboxAddress]);

  if (!isPreviewableAttachment(attachment.mimeType)) return null;
  if (!objectUrl) return null;

  if (normalizeMimeType(attachment.mimeType) === 'application/pdf') {
    return (
      <div className="mt-2">
        <iframe
          src={objectUrl}
          sandbox=""
          className="w-full h-[400px] border border-white/10 rounded-xl bg-black/30"
          title={attachment.filename}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 max-w-full overflow-hidden">
      <img
        src={objectUrl}
        alt={attachment.filename}
        className="max-w-full max-h-[300px] object-contain rounded-xl border border-white/10"
      />
    </div>
  );
};

const EmailDetail: React.FC<EmailDetailProps> = ({ emailId, onClose }) => {
  const { t } = useTranslation();
  const { mailbox, emailCache, addToEmailCache, handleMailboxNotFound } = useContext(MailboxContext);
  const [email, setEmail] = useState<Email | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);
  const successTimeoutRef = useRef<number | null>(null);

  // 当前邮箱地址（用于取该邮箱的 token）
  const mailboxAddress = mailbox?.address ?? '';
  
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
  
  useEffect(() => {
    const fetchEmail = async () => {
      try {
        // 清除之前的错误和成功信息
        setErrorMessage(null);
        setSuccessMessage(null);
        
        // 首先检查缓存中是否有该邮件（超过 1 小时视为过期，不返回）
        const cached = emailCache[emailId];
        if (cached && Date.now() - cached.timestamp <= EMAIL_CACHE_TTL_MS) {
          setEmail(cached.email);
          setAttachments(cached.attachments);
          setIsLoading(false);
          return;
        }
        
        setIsLoading(true);
        const response = await apiFetch(`${API_BASE_URL}/api/emails/${emailId}`, {
          headers: getMailboxTokenHeaders(mailboxAddress),
        });
        
        if (!response.ok) {
          // 如果邮箱不存在（404），则清除本地缓存并创建新邮箱
          if (response.status === 404) {
            await handleMailboxNotFound();
            onClose(); // 关闭邮件详情
            return;
          }
          throw new Error('Failed to fetch email');
        }
        
        const data = await response.json();
        if (data.success) {
          setEmail(data.email);
          
          // 如果邮件有附件，获取附件列表
          if (data.email.hasAttachments) {
            await fetchAttachments(emailId, data.email);
          } else {
            // 没有附件，将邮件添加到缓存
            addToEmailCache(emailId, data.email, []);
          }
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (error) {
        setErrorMessage(t('email.fetchFailed'));
        
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
    
    fetchEmail();
  }, [emailId, t, emailCache, addToEmailCache, handleMailboxNotFound, onClose, mailboxAddress]);
  
  const fetchAttachments = async (emailId: string, emailData?: Email) => {
    try {
      setIsLoadingAttachments(true);
      const response = await apiFetch(`${API_BASE_URL}/api/emails/${emailId}/attachments`, {
        headers: getMailboxTokenHeaders(mailboxAddress),
      });
      
      if (!response.ok) {
        // 如果邮箱不存在（404），则清除本地缓存并创建新邮箱
        if (response.status === 404) {
          await handleMailboxNotFound();
          onClose(); // 关闭邮件详情
          return;
        }
        throw new Error('Failed to fetch attachments');
      }
      
      const data = await response.json();
      if (data.success) {
        setAttachments(data.attachments);
        
        // 将邮件和附件添加到缓存
        if (emailData) {
          addToEmailCache(emailId, emailData, data.attachments);
        }
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error fetching attachments:', error);
    } finally {
      setIsLoadingAttachments(false);
    }
  };
  
  const handleDelete = async () => {
    try {
      // 清除之前的错误和成功信息
      setErrorMessage(null);
      setSuccessMessage(null);
      
      const response = await apiFetch(`${API_BASE_URL}/api/emails/${emailId}`, {
        method: 'DELETE',
        headers: getMailboxTokenHeaders(mailboxAddress),
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete email');
      }
      
      const data = await response.json();
      if (data.success) {
        setSuccessMessage(t('email.deleteSuccess'));
        
        // 2秒后关闭邮件详情
        if (successTimeoutRef.current) {
          window.clearTimeout(successTimeoutRef.current);
        }
        successTimeoutRef.current = window.setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      setErrorMessage(t('email.deleteFailed'));
      
      // 3秒后清除错误信息
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = window.setTimeout(() => {
        setErrorMessage(null);
      }, 3000);
    }
  };

  // 下载附件：用带 token 的 fetch 取内容再触发下载（直接拼 URL 的 <a> 无法带请求头）
  const handleDownloadAttachment = async (attachment: Attachment) => {
    try {
      const response = await apiFetch(getAttachmentUrl(attachment.id, true), {
        headers: getMailboxTokenHeaders(mailboxAddress),
      });
      if (!response.ok) throw new Error('Failed to download attachment');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      // 兜底：无 token 的旧邮箱可直接用链接下载
      window.open(getAttachmentUrl(attachment.id, true), '_blank', 'noopener,noreferrer');
    }
  };
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };
  
  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // 判断文件类型（仅用于图标）
  const getFileType = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('text/')) return 'text';
    return 'file';
  };
  
  // 获取文件图标
  const getFileIcon = (mimeType: string): string => {
    const fileType = getFileType(mimeType);
    switch (fileType) {
      case 'image': return 'fa-file-image';
      case 'video': return 'fa-file-video';
      case 'audio': return 'fa-file-audio';
      case 'pdf': return 'fa-file-pdf';
      case 'text': return 'fa-file-alt';
      default: return 'fa-file';
    }
  };
  
  // 获取附件下载链接
  const getAttachmentUrl = (attachmentId: string, download: boolean = false): string => {
    return `${API_BASE_URL}/api/attachments/${attachmentId}${download ? '?download=true' : ''}`;
  };
  
  // 渲染附件预览：只有白名单类型（PDF、常见图片）才预览，其他类型只提供下载入口
  const renderAttachmentPreview = (attachment: Attachment) => {
    if (!isPreviewableAttachment(attachment.mimeType)) return null;
    return <AttachmentPreview attachment={attachment} mailboxAddress={mailboxAddress} />;
  };

  // 邮件 HTML 先经 DOMPurify 净化再渲染（默认配置即可挡掉 script/事件处理器/javascript: 链接）
  const sanitizedHtmlContent = email?.htmlContent ? DOMPurify.sanitize(email.htmlContent) : '';
  
  return (
    <div className="glass-soft rounded-2xl p-5 sm:p-6">
      {/* 错误和成功提示 */}
      {(errorMessage || successMessage) && (
        <div className={`p-3 mb-4 rounded-xl border text-sm ${errorMessage ? 'bg-red-500/15 border-red-400/30 text-red-300' : 'bg-green-500/15 border-green-400/30 text-green-300'}`}>
          {errorMessage || successMessage}
        </div>
      )}
      
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : email ? (
        <div className="space-y-5">
          {/* 邮件头部信息 */}
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight leading-snug text-slate-50 mb-3 break-words">
                {email.subject || t('email.noSubject')}
              </h2>
              <dl className="space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <dt className="w-10 flex-none text-slate-500">{t('email.from')}</dt>
                  <dd className="min-w-0 truncate text-slate-200" title={email.fromAddress}>{email.fromAddress}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-10 flex-none text-slate-500">{t('email.to')}</dt>
                  <dd className="min-w-0 truncate text-slate-200" title={email.toAddress}>{email.toAddress}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-10 flex-none text-slate-500">{t('email.date')}</dt>
                  <dd className="min-w-0 text-slate-400">{formatDate(email.receivedAt)}</dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-none space-x-2">
              <button
                onClick={onClose}
                className="glass-chip w-10 h-10 rounded-full flex items-center justify-center"
                title={t('common.close')}
              >
                <i className="fas fa-times"></i>
              </button>
              <button
                onClick={handleDelete}
                className="btn-danger-glass w-10 h-10 rounded-full flex items-center justify-center"
                title={t('common.delete')}
              >
                <i className="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>
          
          {/* 分隔线 */}
          <hr className="border-white/10" />
          
          {/* 邮件内容 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2.5">{t('email.content')}</h3>
            {email.htmlContent ? (
              <div 
                className="email-html max-w-none glass-soft rounded-xl p-4 sm:p-5"
                dangerouslySetInnerHTML={{ __html: sanitizedHtmlContent }}
              />
            ) : email.textContent ? (
              <pre className="whitespace-pre-wrap glass-soft rounded-xl p-4 sm:p-5 font-sans text-[15px] leading-relaxed text-slate-200">
                {email.textContent}
              </pre>
            ) : (
              <p className="text-muted-foreground italic">
                {t('email.noContent')}
              </p>
            )}
          </div>
          
          {/* 附件 */}
          {email.hasAttachments && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2.5">
                {t('email.attachments')} 
                {isLoadingAttachments && (
                  <span className="ml-2 inline-block animate-spin h-4 w-4 border-b-2 border-primary rounded-full"></span>
                )}
              </h3>
              
              {attachments.length > 0 ? (
                <div className="space-y-3">
                  {attachments.map(attachment => (
                    <div key={attachment.id} className="glass-soft rounded-xl p-3.5 sm:p-4">
                      <div className="flex justify-between items-center gap-3">
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <i className={`fas ${getFileIcon(attachment.mimeType)} text-primary text-lg flex-none`}></i>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-100 truncate" title={attachment.filename}>{attachment.filename}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(attachment)}
                          className="btn-gradient flex-none px-4 py-2 min-h-[36px] rounded-full text-sm"
                        >
                          {t('email.download')}
                        </button>
                      </div>
                      
                      {/* 附件预览（仅白名单类型） */}
                      {renderAttachmentPreview(attachment)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">
                  {t('email.noAttachments')}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">
            {t('email.notFound')}
          </p>
        </div>
      )}
    </div>
  );
};

export default EmailDetail;
