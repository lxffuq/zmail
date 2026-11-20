import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import ChangePasswordDialog from './ChangePasswordDialog';
import Container from './Container';

interface HeaderProps {
  mailbox: Mailbox | null;
  onMailboxChange?: (mailbox: Mailbox) => void;
  isLoading?: boolean;
  onLogout?: () => void;
  onPasswordChanged?: () => void;
}

/**
 * 顶部吸顶玻璃横条（参考图顶部）：圆角毛玻璃条，左边 logo + 标题，
 * 右边是修改密码 / 退出等玻璃小按钮。邮箱地址不在这里，移到下方仪表盘卡片里。
 */
const Header: React.FC<HeaderProps> = ({
  onLogout = () => {},
  onPasswordChanged = () => {},
}) => {
  const { t } = useTranslation();
  const [showChangePassword, setShowChangePassword] = useState(false);

  return (
    <header className="sticky top-0 z-40 pt-3">
      <Container>
        <div className="glass-header rounded-2xl px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <span className="btn-gradient flex-none w-9 h-9 rounded-xl flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-bold leading-tight truncate text-slate-50">
                {t('app.title')}
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setShowChangePassword(true)}
              className="glass-chip px-3 py-1.5 text-sm rounded-full"
              title="修改密码"
            >
              修改密码
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="btn-danger-glass px-3 py-1.5 text-sm rounded-full"
              title="退出登录"
            >
              退出
            </button>
            <LanguageSwitcher />
            <a
              href="https://github.com/lxffuq/zmail"
              target="_blank"
              rel="noopener noreferrer"
              className="glass-chip w-9 h-9 hidden sm:flex items-center justify-center rounded-full"
              aria-label="GitHub"
              title="GitHub"
            >
              <i className="fab fa-github text-base"></i>
            </a>
          </div>
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
