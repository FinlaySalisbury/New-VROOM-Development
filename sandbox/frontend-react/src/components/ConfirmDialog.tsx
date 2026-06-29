import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action. */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Provides a promise-based confirm() for destructive actions, rendered on the
 * accessible <Modal>. Usage: `const ok = await confirm({ title, message });`
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);
  const pendingRef = useRef<PendingState | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    if (current) current.resolve(value);
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={pending !== null}
        title={pending?.title ?? ''}
        onClose={() => settle(false)}
        footer={
          pending && (
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                marginLeft: 'auto',
              }}
            >
              <Button variant="ghost" onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant="primary"
                onClick={() => settle(true)}
                data-destructive={pending.destructive || undefined}
                autoFocus
              >
                {pending.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          )
        }
      >
        <p style={{ margin: 0, color: 'var(--app-fg)' }}>{pending?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** Returns a promise-based confirm(). Throws outside <ConfirmDialogProvider>. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a <ConfirmDialogProvider>.');
  }
  return ctx;
}
