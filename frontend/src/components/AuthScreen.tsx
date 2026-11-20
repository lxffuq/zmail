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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass rounded-2xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2">ZMAIL</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {mode === 'setup' ? '首次使用，请先设置管理密码' : '请输入管理密码继续'}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="glass-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
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
              className="glass-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="再次输入密码"
              disabled={isLoading}
              autoComplete="new-password"
            />
          )}
          {error && (
            <div className="p-3 rounded-md bg-red-100 text-red-800 text-sm">{error}</div>
          )}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
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
