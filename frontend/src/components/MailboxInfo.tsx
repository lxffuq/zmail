import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface MailboxInfoProps {
  mailbox: Mailbox;
  onDelete: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
}

const MailboxInfo: React.FC<MailboxInfoProps> = ({ 
  mailbox, 
  onDelete,
  autoRefresh,
  onToggleAutoRefresh
}) => {
  const { t } = useTranslation();
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
    
    if (timeLeftSeconds <= 0) {
      return t('mailbox.expired');
    }
    
    const hours = Math.floor(timeLeftSeconds / 3600);
    const minutes = Math.floor((timeLeftSeconds % 3600) / 60);
    
    if (hours > 0) {
      return t('mailbox.expiresInTime', { hours, minutes });
    } else {
      return t('mailbox.expiresInMinutes', { minutes });
    }
  };
  

  
  return (
    <div className="glass rounded-3xl p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
        <div className="flex mt-4 md:mt-0 space-x-2">
          <button
            onClick={onToggleAutoRefresh}
            className={`px-4 py-2 rounded-full text-sm ${
              autoRefresh 
                ? 'btn-gradient' 
                : 'glass-btn'
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
                onClick={onDelete}
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
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="glass-soft rounded-2xl px-4 py-3">
          <p className="text-xs text-slate-400 mb-1">{t('mailbox.created')}</p>
          <p className="text-slate-100">{formatDate(mailbox.createdAt)}</p>
        </div>
        <div className="glass-soft rounded-2xl px-4 py-3">
          <p className="text-xs text-slate-400 mb-1">{t('mailbox.expiresAt')}</p>
          <p className="text-slate-100">{formatDate(mailbox.expiresAt)}</p>
        </div>
        <div className="glass-soft rounded-2xl px-4 py-3">
          <p className="text-xs text-slate-400 mb-1">{t('mailbox.timeLeft')}</p>
          <p className="text-slate-100">{calculateTimeLeft(mailbox.expiresAt)}</p>
        </div>
      </div>
    </div>
  );
};

export default MailboxInfo; 