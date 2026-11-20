import React, { useState } from 'react';
import { setupPassword, adminLogin } from '../utils/api';

interface AuthScreenProps {
  mode: 'setup' | 'login';
  onSuccess: () => void;
}

/**
 * 管理密码认证界面：首次使用设密码（两次输入，至少 6 位），
 * 已设密码时登录。成功后 token 已由 api.ts 存入 localStorage，
 * 这里只通知 App 进入主界面。
 */
const AuthScreen: React.FC<AuthScreenProps> = ({ mode, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (mode === 'setup' && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setIsLoading(true);
    const result =
      mode === 'setup'
        ? await setupPassword(password, confirmPassword)
        : await adminLogin(password);
    setIsLoading(false);

    if (result.success) {
      onSuccess();
    } else {
      setError(
        mode === 'login'
          ? '密码错误，请重试'
          : typeof result.error === 'string' && result.error
            ? result.error
            : '设置失败，请重试',
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="glass rounded-3xl p-8 w-full max-w-sm animate-dialog-in">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl btn-gradient flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg></div>
        <h1 className="text-2xl font-bold tracking-tight text-center mb-2 text-slate-50">24小时匿名邮箱</h1>
        <p className="text-sm text-slate-400 text-center mb-6">
          {mode === 'setup' ? '首次使用，请先设置管理密码' : '请输入管理密码继续'}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="glass-input w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder={mode === 'setup' ? '设置密码（至少 6 位）' : '管理密码'}
            disabled={isLoading}
            autoFocus
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
          />
          {mode === 'setup' && (
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="再次输入密码"
              disabled={isLoading}
              autoComplete="new-password"
            />
          )}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-400/30 text-red-300 text-sm">{error}</div>
          )}
          <button
            type="submit"
            className="btn-gradient w-full px-4 py-3 min-h-[44px] rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
          >
            {isLoading ? '请稍候…' : mode === 'setup' ? '设置密码并进入' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthScreen;
