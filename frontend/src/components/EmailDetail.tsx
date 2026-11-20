import React, { useState, useEffect, useContext, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { API_BASE_URL } from '../config';
import { apiFetch, getMailboxTokenHeaders } from '../utils/api';
import { MailboxContext } from '../contexts/MailboxContext';
import { useTopToast, TopToast } from './TopToast';

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

// 验证码关键词：中文、英文、OTP 等
const VERIFICATION_CODE_KEYWORDS = /验证码|驗證碼|verification\s*code|confirmation\s*code|confirm\s*code|otp|动态码|動態碼|校验码|确认码|確認碼|安全码|login\s*code|sign[- ]in\s*code|auth(?:entication)?\s*code|is your\s+(?:\w+\s+){0,2}code|is the\s+(?:\w+\s+){0,2}code/i;

// 关键词附近的数字（3 位以上，长度不限，如“您的验证码是 1234567890”）；
// 跳过“5 分钟内有效”这种时间数量，避免把 5 认成验证码。
function matchCodeNearKeyword(text: string): string | null {
  const keyword = `(?:${VERIFICATION_CODE_KEYWORDS.source})`;
  const afterPattern = new RegExp(`${keyword}[^0-9]{0,30}([0-9]{3,})(?![0-9])`, 'gi');
  for (const m of text.matchAll(afterPattern)) {
    if (!isTimeAmount(text, m, m[1])) return m[1];
  }
  const beforePattern = new RegExp(`(?:^|[^0-9])([0-9]{3,})(?![0-9])[^0-9]{0,30}${keyword}`, 'gi');
  for (const m of text.matchAll(beforePattern)) {
    if (!isTimeAmount(text, m, m[1])) return m[1];
  }
  return null;
}

// 数字后面紧跟时间单位（如“5 分钟内有效”里的 5）不是验证码
function isTimeAmount(text: string, m: RegExpMatchArray, code: string): boolean {
  const start = (m.index ?? 0) + m[0].indexOf(code);
  const rest = text.slice(start + code.length, start + code.length + 8).trimStart();
  return /^(分钟|秒|小时|天|minutes?|seconds?|hours?|days?)\b/i.test(rest);
}

// 兜底：正文里第一个独立的数字（3-16 位），排除年份和日期/时间片段
function matchFallbackCode(text: string): string | null {
  for (const m of text.matchAll(/(?:^|[^0-9])([0-9]{3,16})(?![0-9])/g)) {
    const code = m[1];
    const start = (m.index ?? 0) + m[0].indexOf(code);
    const next = text[start + code.length];
    if (next === '-' || next === '/' || next === ':') continue;
    if (/^(19|20)\d{2}$/.test(code)) continue;
    return code;
  }
  return null;
}

// HTML 转纯文本：先删 <style>/<script>/注释块（里面的像素值、尺寸数字
// 不是正文内容，之前就因为 max-width: 480px 把 480 误认成验证码），再去标签。
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 从邮件里提取验证码：正文优先用纯文本，没有再从 HTML 去标签；
// 先找关键词附近的（长度不限），再找主题里的，最后兜底找正文第一个独立数字。
function extractVerificationCode(email: Email): string | null {
  const bodyText = (email.textContent || '').trim()
    || (email.htmlContent ? stripHtml(email.htmlContent) : '');
  if (!bodyText && !email.subject) return null;
  return (
    (bodyText ? matchCodeNearKeyword(bodyText) : null)
    ?? (email.subject ? matchCodeNearKeyword(email.subject) : null)
    ?? (bodyText ? matchFallbackCode(bodyText) : null)
  );
}

const EmailDetail: React.FC<EmailDetailProps> = ({ emailId, onClose }) => {
  const { t } = useTranslation();
  const { mailbox, emailCache, addToEmailCache, handleMailboxNotFound } = useContext(MailboxContext);
  const [email, setEmail] = useState<Email | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { toast, showToast } = useTopToast();
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
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
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

  // 邮件里的验证码（没有则不显示卡片）
  const verificationCode = email ? extractVerificationCode(email) : null;

  // 一键复制验证码，提示走屏幕上方中间的悬浮 toast
  const copyVerificationCode = () => {
    if (!verificationCode) return;
    navigator.clipboard.writeText(verificationCode)
      .then(() => showToast(t('email.codeCopied'), 'success'))
      .catch(() => showToast(t('email.copyCodeFailed'), 'error'));
  };
  
  return (
    <div className="glass-soft rounded-2xl p-5 sm:p-6">
      <TopToast toast={toast} />
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
          
          {/* 验证码：一键复制 */}
          {verificationCode && (
            <div className="glass rounded-2xl px-4 py-3.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400 mb-1">{t('email.verificationCode')}</p>
                <p className="text-2xl font-bold tracking-[0.25em] text-slate-50 font-mono break-all">
                  {verificationCode}
                </p>
              </div>
              <button
                type="button"
                onClick={copyVerificationCode}
                className="btn-gradient flex-none px-4 py-2.5 min-h-[40px] rounded-full text-sm flex items-center gap-2"
              >
                <i className="fas fa-copy text-xs"></i>
                {t('email.copyCode')}
              </button>
            </div>
          )}

          {/* 分隔线 */}
          <hr className="border-white/10" />
          
          {/* 邮件内容 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2.5">{t('email.content')}</h3>
            {email.htmlContent ? (
              <div
                className="email-html max-w-none glass-soft rounded-xl p-4 sm:p-5 overflow-x-auto"
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
