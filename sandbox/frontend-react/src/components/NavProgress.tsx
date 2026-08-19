import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Thin top-of-shell progress bar shown while a section change settles.
 *
 * Client-side routing is instant, but the view that mounts then fetches its
 * data — this gives that gap a single, quiet "something is happening" signal
 * instead of leaving the shell looking frozen. Deliberately one element and
 * short-lived (the UX rules warn against animating everything); the global
 * prefers-reduced-motion guard collapses it.
 */
export function NavProgress() {
  const { pathname } = useLocation();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
    const t = setTimeout(() => setActive(false), 550);
    return () => clearTimeout(t);
  }, [pathname]);

  if (!active) return null;
  return <div className="nav-progress" role="presentation" aria-hidden="true" />;
}
