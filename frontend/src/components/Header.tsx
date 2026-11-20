import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import HeaderMailbox from './HeaderMailbox';
import ChangePasswordDialog from './ChangePasswordDialog';
import Container from './Container';
import { EMAIL_DOMAIN } from '../config';

interface HeaderProps {
  mailbox: Mailbox | null;
  onMailboxChange?: (mailbox: Mailbox) => void;
  isLoading?: boolean;
  onLogout?: () => void;
  onPasswordChanged?: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  mailbox = null, 
  onMailboxChange = () => {}, 
  isLoading = false,
  onLogout = () => {},
  onPasswordChanged = () => {},
}) => {
  const { t } = useTranslation();
  const [showChangePassword, setShowChangePassword] = useState(false);
  
  return (
    <header className="glass-header">
      <Container>
        <div className="flex items-center justify-between py-3">
          <Link to="/" className="text-2xl font-bold">
            {t('app.title')}
          </Link>
          
          {mailbox && (
            <div className="flex items-center glass-soft rounded-md px-3 py-1.5">
              <HeaderMailbox 
                mailbox={mailbox} 
                onMailboxChange={onMailboxChange}
                domain={EMAIL_DOMAIN}
                isLoading={isLoading}
              />
              <div className="ml-3 pl-3 border-l border-muted-foreground/20 flex items-center">
                <button
                  type="button"
                  onClick={() => setShowChangePassword(true)}
                  className="px-2 py-1 text-sm rounded-md transition-colors hover:bg-primary/20 hover:text-primary"
                  title="修改密码"
                >
                  修改密码
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-2 py-1 text-sm rounded-md transition-colors hover:bg-primary/20 hover:text-primary"
                  title="退出登录"
                >
                  退出
                </button>
                <LanguageSwitcher />
                <a
                  href="https://github.com/lxffuq/zmail"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center rounded-md transition-all duration-200 hover:bg-primary/20 hover:text-primary hover:scale-110 ml-1"
                  aria-label="GitHub"
                  title="GitHub"
                >
                  <i className="fab fa-github text-base"></i>
                </a>
              </div>
            </div>
          )}
        </div>
      </Container>
      <ChangePasswordDialog
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        onSuccess={onPasswordChanged}
      />
    </header>
  );
};

export default Header; 