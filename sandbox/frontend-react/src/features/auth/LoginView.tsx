import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import './auth.css';

type Mode = 'signin' | 'signup';

/**
 * Login / sign-up + onboarding handoff. Ported from the legacy auth overlay,
 * reusing the design-system classes (.auth-overlay/.login-card/.form-*) with
 * accessibility upgrades: associated labels, autocomplete, aria-live status,
 * real <button> controls.
 */
export function LoginView() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isSignup = mode === 'signup';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess('Account created. Check your email to verify, then sign in.');
        setMode('signin');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // AuthProvider's onAuthStateChange will pick up the session.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setError('');
    setSuccess('');
    if (!email) {
      setError('Enter your email above first, then click “Forgot password”.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) setError(error.message);
    else setSuccess('Password reset link sent — check your inbox.');
  }

  return (
    <div className="auth-overlay">
      <div className="login-card glass-panel">
        <div className="login-header">
          <img src="/assets/yuroute-stacked@2x.png" alt="YuRoute" className="login-logo" />
          <h1 id="auth-title">{isSignup ? 'Create your account' : 'VROOM Intelligence'}</h1>
          <p id="auth-subtitle">
            {isSignup
              ? 'Set up access to the dispatch platform.'
              : 'Sign in to access the dispatch platform.'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Email
            </label>
            <input
              type="email"
              id="login-email"
              className="form-input"
              required
              autoComplete="email"
              placeholder="name@yunextraffic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <input
              type="password"
              id="login-password"
              className="form-input"
              required
              minLength={6}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="status-text error-text" role="alert" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}
          {success && (
            <div className="auth-success-text" role="status" aria-live="polite">
              {success}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={busy}
          >
            {busy ? 'Please wait…' : isSignup ? 'Create account →' : 'Sign in →'}
          </button>

          <div className="auth-link-row">
            <button type="button" className="auth-link-btn is-muted" onClick={handleForgotPassword}>
              Forgot password?
            </button>
            <button
              type="button"
              className="auth-link-btn is-underline"
              onClick={() => {
                setMode(isSignup ? 'signin' : 'signup');
                setError('');
                setSuccess('');
              }}
            >
              {isSignup ? 'Have an account? Sign in' : 'Create an account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
