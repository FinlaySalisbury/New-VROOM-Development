import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** The single <h1> for the view. */
  title: string;
  /** Optional supporting line under the title. */
  subtitle?: ReactNode;
  /** Optional actions slot (buttons), aligned to the trailing edge. */
  actions?: ReactNode;
}

/**
 * Section header: one <h1> using .view-title styling, optional subtitle and an
 * actions slot. One per view to keep heading order correct.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        marginBottom: 'var(--space-5)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1 className="view-title">{title}</h1>
        {subtitle && <p className="view-subtitle">{subtitle}</p>}
      </div>
      {actions && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          {actions}
        </div>
      )}
    </header>
  );
}
