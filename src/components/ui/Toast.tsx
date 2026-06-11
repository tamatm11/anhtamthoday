'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import styles from './Toast.module.css';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  dismissing?: boolean;
}

let addToastGlobal: ((message: string, type?: ToastType) => void) | null = null;

/** Imperatively show a toast from anywhere. */
export function showToast(message: string, type: ToastType = 'info') {
  addToastGlobal?.(message, type);
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

let nextId = 0;

export default function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 280);
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  useEffect(() => {
    addToastGlobal = addToast;
    return () => {
      addToastGlobal = null;
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.type]} ${toast.dismissing ? styles.out : ''}`}
        >
          <span className={styles.icon}>{ICONS[toast.type]}</span>
          <span className={styles.message}>{toast.message}</span>
          <button className={styles.close} onClick={() => dismiss(toast.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
