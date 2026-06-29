import { useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';

/**
 * Bootstraps the Supabase session into the app store and keeps it in sync.
 * Ports the legacy `initAuth` / `handleAuthChange` boot sequence:
 *   getSession() -> set boot 'ready' -> router evaluates.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const setSession = useAppStore((s) => s.setSession);
  const setBoot = useAppStore((s) => s.setBoot);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setBoot('ready');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setSession, setBoot]);

  return <>{children}</>;
}
