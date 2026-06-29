import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'grad' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean;
  /** Optional leading icon (decorative — give the button accessible text or aria-label). */
  icon?: ReactNode;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'yx-btn-primary',
  secondary: 'yx-btn-secondary',
  ghost: 'yx-btn-ghost',
  grad: 'yx-btn-grad',
  link: 'yx-btn-link',
};

const SIZE_CLASS: Partial<Record<ButtonSize, string>> = {
  sm: 'yx-btn-sm',
  lg: 'yx-btn-lg',
};

/**
 * Thin, brand-tokened wrapper around the .yx-btn* primitives so every view
 * renders consistent buttons. Always a real <button>.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'yx-btn',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          style={{
            width: '1em',
            height: '1em',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'yx-btn-spin 0.7s linear infinite',
          }}
        />
      ) : (
        icon && <span aria-hidden="true">{icon}</span>
      )}
      {children}
      {loading && (
        <style>{`@keyframes yx-btn-spin { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) { [style*="yx-btn-spin"] { animation-duration: 1.5s; } }`}</style>
      )}
    </button>
  );
}
