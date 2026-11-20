import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import AuthScreen from './components/AuthScreen';
import { MailboxProvider } from './contexts/MailboxContext';
import { authStatus, adminLogout, ADMIN_UNAUTHORIZED_EVENT } from './utils/api';

type AuthState = 'loading' | 'setup' | 'login' | 'authed';

const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>('loading');

  // 启动查一次 /api/auth/status，决定显示设置密码 / 登录 / 主界面。
  // 查不到状态时也进登录页（fail-closed）：没确认登录态就不放行进主界面。
  const checkAuth = useCallback(async () => {
    const result = await authStatus();
    if (!result.success) {
      setAuthState('login');
      return;
    }
    if (result.setupRequired) {
      setAuthState('setup');
    } else if (result.authenticated) {
      setAuthState('authed');
    } else {
      setAuthState('login');
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 401 统一处理：api.ts 的 apiFetch 收到 401 会清 token 并广播此事件，
  // 这里收到后回到登录界面（MailboxContext 不用每个调用处重复写）。
  useEffect(() => {
    const handleUnauthorized = () => setAuthState('login');
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  const handleLogout = useCallback(async () => {
    await adminLogout();
    setAuthState('login');
  }, []);

  // 改密码成功后全部会话失效，回登录页重新登录
  const handlePasswordChanged = useCallback(() => {
    setAuthState('login');
  }, []);

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (authState === 'setup' || authState === 'login') {
    return (
      <AuthScreen mode={authState} onSuccess={() => setAuthState('authed')} />
    );
  }

  return (
    <MailboxProvider>
      <div className="min-h-screen">
        <Routes>
          <Route
            path="/"
            element={
              <Layout onLogout={handleLogout} onPasswordChanged={handlePasswordChanged} />
            }
          >
            <Route index element={<HomePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </div>
    </MailboxProvider>
  );
};

export default App;
