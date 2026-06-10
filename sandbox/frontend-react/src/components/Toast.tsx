import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastEntry {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  /** Show a toast. Returns its id (so callers can dismiss early if needed). */
  toast: (message: string, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Ports legacy toast.js: a single polite aria-live region, brand-tokened
 * variants, click-to-dismiss, auto-dismiss. Wrap the app once with
 * <ToastProvider> and read the API via useToast().
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = ++nextId.current;
      const variant: ToastVariant = opts.variant ?? 'info';
      const durationMs =
        typeof opts.durationMs === 'number' ? opts.durationMs : 3500;
      setToasts((prev) => [...prev, { id, message, variant }]);
      if (durationMs > 0) {
        const handle = window.setTimeout(() => dismiss(id), durationMs);
        timers.current.set(id, handle);
      }
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        id="toast-region"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          bottom: 'var(--space-5)',
          right: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          zIndex: 'var(--z-toast, 4000)',
          pointerEvents: 'none',
          maxWidth: 'min(360px, calc(100vw - var(--space-6)))',
        }}
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`toast toast--${t.variant}`}
            role="status"
            onClick={() => dismiss(t.id)}
            aria-label={`Dismiss notification: ${t.message}`}
            style={{ textAlign: 'left' }}
          >
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Access the toast API. Throws if used outside <ToastProvider>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>.');
  }
  return ctx;
}
