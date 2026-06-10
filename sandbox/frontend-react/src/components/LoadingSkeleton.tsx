import type { CSSProperties } from 'react';

export interface LoadingSkeletonProps {
  /** Number of placeholder cards to render. */
  count?: number;
  /** Approximate height of each card, e.g. "160px". */
  height?: string;
  /** When true, lay cards out in the responsive bento grid (matches data lists). */
  grid?: boolean;
  /** Accessible busy label for screen readers. */
  label?: string;
}

const shimmer: CSSProperties = {
  background:
    'linear-gradient(100deg, var(--app-card) 30%, var(--yx-gray, #E4EDED) 50%, var(--app-card) 70%)',
  backgroundSize: '200% 100%',
  animation: 'yx-skeleton-shimmer 1.4s ease-in-out infinite',
  border: '1px solid var(--app-border)',
  borderRadius: 'var(--radius-lg)',
};

/**
 * Card skeletons for async lists. Matches the .data-card / bento-grid layout
 * so the loaded content does not jump. Respects reduced motion via the
 * keyframe — falls back to a static tint when motion is disabled.
 */
export function LoadingSkeleton({
  count = 3,
  height = '140px',
  grid = true,
  label = 'Loading',
}: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <>
      <style>{`
        @keyframes yx-skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .yx-skeleton-card { animation: none !important; background: var(--app-card) !important; }
        }
      `}</style>
      <div
        className={grid ? 'bento-grid' : undefined}
        role="status"
        aria-busy="true"
        aria-label={label}
        style={
          grid
            ? undefined
            : { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }
        }
      >
        {items.map((i) => (
          <div
            key={i}
            className="yx-skeleton-card"
            style={{ ...shimmer, height }}
            aria-hidden="true"
          />
        ))}
      </div>
    </>
  );
}
