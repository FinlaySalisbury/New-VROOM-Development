import { Button } from './Button';

export interface ErrorStateProps {
  /** Short headline. Defaults to a generic message. */
  title?: string;
  /** Detail line — pass the error message where safe to show. */
  message?: string;
  /** Retry handler; when provided, a "Try again" button is shown. */
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * Inline error block for failed async loads, with an optional retry. Uses
 * role="alert" so screen readers announce it immediately.
 */
export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this content.',
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  return (
    <div
      className="empty-state"
      role="alert"
      style={{ border: '1px solid var(--app-border)', borderRadius: 'var(--radius-lg)' }}
    >
      <div className="empty-icon" aria-hidden="true">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-h4)',
          fontWeight: 700,
          color: 'var(--app-fg)',
          margin: '0 0 var(--space-2)',
        }}
      >
        {title}
      </h2>
      <p style={{ margin: '0 0 var(--space-4)', maxWidth: '42ch' }}>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
