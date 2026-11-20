import React, { useState } from 'react';
import { changePassword } from '../utils/api';

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
  /** 修改成功后调用：全部会话已失效，App 应回登录页 */
  onSuccess: () => void;
}

/** 修改密码小对话框：旧密码、新密码、确认新密码（新密码至少 6 位）。 */
const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!open) return null;

  const resetAndClose = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setIsLoading(true);
    const result = await changePassword(oldPassword, newPassword);
    setIsLoading(false);

    if (result.success) {
      resetAndClose();
      onSuccess();
    } else {
      setError('旧密码错误，修改失败');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/30"
      onClick={resetAndClose}
    >
      <div
        className="glass rounded-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">修改密码</h2>
        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="glass-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="旧密码"
            disabled={isLoading}
            autoFocus
            autoComplete="current-password"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="glass-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="新密码（至少 6 位）"
            disabled={isLoading}
            autoComplete="new-password"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="glass-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="再次输入新密码"
            disabled={isLoading}
            autoComplete="new-password"
          />
          {error && (
            <div className="p-3 rounded-md bg-red-100 text-red-800 text-sm">{error}</div>
          )}
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="glass-btn flex-1 px-4 py-2 rounded-md hover:opacity-90"
              disabled={isLoading}
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60"
              disabled={isLoading}
            >
              {isLoading ? '请稍候…' : '确认修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordDialog;
