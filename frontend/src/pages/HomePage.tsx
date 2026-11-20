import React, { useContext, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EmailList from '../components/EmailList';
import HeaderMailbox from '../components/HeaderMailbox';
import CreateMailboxForm from '../components/CreateMailboxForm';
import { MailboxContext } from '../contexts/MailboxContext';
import { EMAIL_DOMAIN } from '../config';
import Container from '../components/Container';

// 添加结构化数据组件
const StructuredData: React.FC = () => {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "24小时匿名邮箱",
    "applicationCategory": "UtilityApplication",
    "operatingSystem": "All",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "CNY"
    },
    "description": "创建临时邮箱地址，接收邮件，无需注册，保护您的隐私安全"
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
};

const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const {
    mailbox,
    setMailbox,
    isLoading,
    emails,
    selectedEmail,
    setSelectedEmail,
    isEmailsLoading,
    autoRefresh,
    setAutoRefresh,
    deleteMailbox,
  } = useContext(MailboxContext);

  // 使用ref来跟踪是否已经处理过404错误
  const handlingNotFoundRef = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const calculateTimeLeft = (expiresAt: number) => {
    const now = Math.floor(Date.now() / 1000);
    const timeLeftSeconds = expiresAt - now;
    if (timeLeftSeconds <= 0) return t('mailbox.expired');
    const hours = Math.floor(timeLeftSeconds / 3600);
    const minutes = Math.floor((timeLeftSeconds % 3600) / 60);
    if (hours > 0) return t('mailbox.expiresInTime', { hours, minutes });
    return t('mailbox.expiresInMinutes', { minutes });
  };

  if (isLoading) {
    return (
      <Container>
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <StructuredData />

      {/* 大标题 + 副标题（参考图仪表盘标题区） */}
      <div className="mt-2 mb-5">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-50">
          {t('app.title')}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400">
          {t('app.subtitle')}
        </p>
      </div>

      {/* 邮箱地址玻璃卡片 */}
      {mailbox ? (
        <section className="glass rounded-3xl p-5 sm:p-6 mb-5">
          <h2 className="section-title text-lg mb-4">{t('mailbox.address')}</h2>

          <div className="glass-soft rounded-2xl px-4 py-3 mb-4 overflow-hidden">
            <HeaderMailbox
              mailbox={mailbox}
              onMailboxChange={setMailbox}
              domain={EMAIL_DOMAIN}
              isLoading={isLoading}
            />
          </div>

          {/* 创建时间 / 过期时间 / 剩余时间 / 邮件数 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div className="glass-soft rounded-2xl px-4 py-3">
              <p className="text-xs text-slate-400 mb-1">{t('mailbox.created')}</p>
              <p className="text-slate-100 leading-snug">{formatDate(mailbox.createdAt)}</p>
            </div>
            <div className="glass-soft rounded-2xl px-4 py-3">
              <p className="text-xs text-slate-400 mb-1">{t('mailbox.expiresAt')}</p>
              <p className="text-slate-100 leading-snug">{formatDate(mailbox.expiresAt)}</p>
            </div>
            <div className="glass-soft rounded-2xl px-4 py-3">
              <p className="text-xs text-slate-400 mb-1">{t('mailbox.timeLeft')}</p>
              <p className="text-slate-100 leading-snug">{calculateTimeLeft(mailbox.expiresAt)}</p>
            </div>
            <div className="glass-soft rounded-2xl px-4 py-3">
              <p className="text-xs text-slate-400 mb-1">{t('email.inbox')}</p>
              <p className="text-slate-100 leading-snug">
                {emails.length} {emails.length === 1 ? t('email.message') : t('email.messages')}
              </p>
            </div>
          </div>

          {/* 自动刷新 / 删除邮箱 */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-4 py-2 rounded-full text-sm transition-all ${
                autoRefresh ? 'btn-gradient' : 'glass-btn'
              }`}
            >
              {autoRefresh ? t('email.autoRefreshOn') : t('email.autoRefreshOff')}
            </button>
            {showDeleteConfirm ? (
              <>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="glass-btn px-4 py-2 rounded-full text-sm"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); deleteMailbox(); }}
                  className="btn-danger-glass px-4 py-2 rounded-full text-sm"
                >
                  {t('common.confirm')}
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="btn-danger-glass px-4 py-2 rounded-full text-sm"
              >
                {t('common.delete')}
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="mb-5">
          <CreateMailboxForm onMailboxCreated={() => window.location.reload()} />
        </section>
      )}

      {/* 收件箱：独立玻璃卡片 */}
      <EmailList
        emails={emails}
        selectedEmailId={selectedEmail}
        onSelectEmail={setSelectedEmail}
        isLoading={isEmailsLoading}
      />
    </Container>
  );
};

export default HomePage;
