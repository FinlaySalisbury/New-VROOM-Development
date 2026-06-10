import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Short headline, e.g. "No engineers yet". */
  title: string;
  /** One-line guidance on how to populate this list. */
  description?: ReactNode;
  /** Optional decorative icon (e.g. an inline SVG). */
  icon?: ReactNode;
  /** Optional call-to-action slot (e.g. a <Button>). */
  action?: ReactNode;
}

/**
 * Composed empty state for async lists. Always explains how to populate the
 * list and offers an optional CTA. Reuses the legacy .empty-state styling.
 */
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      {icon && (
        <div className="empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}
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
      {description && (
        <p style={{ margin: '0 0 var(--space-4)', maxWidth: '42ch' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
