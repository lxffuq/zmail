import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { MailboxContext } from '../contexts/MailboxContext';
import EmailDetail from './EmailDetail';

interface EmailListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onSelectEmail: (id: string | null) => void;
  isLoading: boolean;
}

const EmailList: React.FC<EmailListProps> = ({
  emails,
  selectedEmailId,
  onSelectEmail,
  isLoading
}) => {
  const { t } = useTranslation();
  const { autoRefresh, setAutoRefresh, refreshEmails } = useContext(MailboxContext);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const handleRefresh = () => {
    refreshEmails();
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  if (isLoading) {
    return (
      <div className="glass rounded-3xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="section-title text-lg">{t('email.inbox')}</h2>
        </div>
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl overflow-hidden">
      <div className="flex justify-between items-center px-5 py-4 border-b border-white/10">
        <h2 className="section-title text-lg">{t('email.inbox')}</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            className="glass-chip w-9 h-9 rounded-full flex items-center justify-center"
            title={t('email.refresh')}
          >
            <i className="fas fa-sync-alt text-sm"></i>
          </button>
          <button
            onClick={toggleAutoRefresh}
            className={`glass-chip w-9 h-9 rounded-full flex items-center justify-center ${autoRefresh ? 'text-indigo-300 border-indigo-400/40' : 'text-slate-400'}`}
            title={autoRefresh ? t('email.autoRefreshOn') : t('email.autoRefreshOff')}
          >
            <i className="fas fa-clock text-sm"></i>
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center px-5 py-3 border-b border-white/10 bg-white/[0.03]">
        <span className="text-sm text-slate-300">
          {emails.length} {emails.length === 1 ? t('email.message') : t('email.messages')}
        </span>
        <span className="text-xs text-slate-400">
          {autoRefresh ? t('email.autoRefreshOn') : t('email.autoRefreshOff')}
        </span>
      </div>

      {emails.length === 0 ? (
        <div className="p-8 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl glass-soft flex items-center justify-center">
            <i className="far fa-envelope-open text-2xl text-indigo-300"></i>
          </div>
          <p className="text-slate-200 font-medium">{t('email.emptyInbox')}</p>
          <p className="text-sm mt-1.5 text-slate-400">{t('email.waitingForEmails')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.07]">
          {emails.map((email) => (
            <React.Fragment key={email.id}>
              <li
                className={`px-5 py-4 cursor-pointer transition-colors hover:bg-white/[0.06] ${
                  selectedEmailId === email.id ? 'bg-white/[0.09] border-l-2 border-indigo-400' : 'border-l-2 border-transparent'
                } ${!email.isRead ? 'font-semibold' : ''}`}
                onClick={() => onSelectEmail(selectedEmailId === email.id ? null : email.id)}
              >
                <div className="flex justify-between mb-1 gap-3">
                  <span className="truncate text-slate-100">{email.fromName || email.fromAddress}</span>
                  <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
                    {formatDate(email.receivedAt)}
                  </span>
                </div>
                <div className="text-sm truncate text-slate-300">
                  {email.subject || t('email.noSubject')}
                </div>
              </li>
              {selectedEmailId === email.id && (
                <li className="border-t border-white/[0.07] px-4 py-4 bg-white/[0.02]">
                  <EmailDetail
                    emailId={email.id}
                    onClose={() => onSelectEmail(null)}
                  />
                </li>
              )}
            </React.Fragment>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EmailList;
