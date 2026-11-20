import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TopToastData = { msg: string; kind: 'success' | 'error' } | null;

/**
 * 屏幕上方中间的悬浮提示（复制 / 更换邮箱 / 复制验证码等共用）。
 * 成功绿底 2 秒消失、失败红底 3 秒消失。
 */
export function useTopToast() {
  const [toast, setToast] = useState<TopToastData>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string, kind: 'success' | 'error') => {
    setToast({ msg, kind });
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
    }, kind === 'success' ? 2000 : 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  return { toast, showToast };
}

/**
 * 渲染悬浮提示本体：用 Portal 挂到 body，避免被祖先元素的
 * 入场动画 transform 影响 fixed 定位。
 */
export const TopToast: React.FC<{ toast: TopToastData }> = ({ toast }) => {
  if (!toast) return null;
  return createPortal(
    <div className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
      <div className={`animate-dialog-in flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-xl whitespace-nowrap ${
        toast.kind === 'success'
          ? 'bg-emerald-500/90 border-emerald-300/30 text-white'
          : 'bg-red-500/90 border-red-300/30 text-white'
      }`}>
        {toast.kind === 'success' ? (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        ) : (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        )}
        {toast.msg}
      </div>
    </div>,
    document.body
  );
};
