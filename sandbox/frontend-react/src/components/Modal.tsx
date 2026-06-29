import { useCallback, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export type ModalSize = 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional footer (typically action buttons). */
  footer?: ReactNode;
  size?: ModalSize;
  /** When true, backdrop clicks do NOT close the modal (use for destructive flows). */
  disableBackdropClose?: boolean;
}

const SIZE_CLASS: Partial<Record<ModalSize, string>> = {
  lg: 'modal-lg',
  xl: 'modal-xl',
};

/**
 * Accessible dialog. Ports the behaviour of legacy modal.js: focus trap,
 * Escape closes, focus restored to the trigger on close, background scroll
 * lock, aria-modal + aria-labelledby. Rendered in a portal on document.body.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  disableBackdropClose = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const focusables = useCallback((): HTMLElement[] => {
    const el = dialogRef.current;
    if (!el) return [];
    return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => n.offsetParent !== null || n === document.activeElement,
    );
  }, []);

  // Remember the trigger and lock body scroll while open; restore on close.
  useEffect(() => {
    if (!open) return;

    triggerRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Initial focus on next tick so entry animation doesn't steal it.
    const id = window.setTimeout(() => {
      const list = focusables();
      (list[0] ?? dialogRef.current)?.focus();
    }, 0);

    const savedTrigger = triggerRef.current;
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prevOverflow;
      if (savedTrigger && document.contains(savedTrigger)) {
        try {
          savedTrigger.focus();
        } catch {
          /* element may be gone */
        }
      }
    };
  }, [open, focusables]);

  // Escape + focus trap.
  useEffect(() => {
    if (!open) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const list = focusables();
        if (list.length === 0) {
          e.preventDefault();
          dialogRef.current?.focus();
          return;
        }
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [open, onClose, focusables]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      style={{ display: 'flex' }}
      onMouseDown={(e) => {
        if (disableBackdropClose) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={['modal-dialog', SIZE_CLASS[size]].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="yx-btn yx-btn-ghost yx-btn-sm"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
