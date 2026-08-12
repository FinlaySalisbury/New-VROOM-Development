import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import type { UserProfile } from '@/store/appStore';
import { supabase } from '@/lib/supabase';
import { getProfile, updateProfile } from '@/services/profile';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { useToast } from '@/components/Toast';

type LoadState = 'loading' | 'ready' | 'error';

function initials(profile: UserProfile | null, email: string): string {
  const fn = profile?.first_name ?? '';
  const ln = profile?.last_name ?? '';
  const fromName = (fn.charAt(0) + ln.charAt(0)).trim().toUpperCase();
  if (fromName) return fromName;
  return email.substring(0, 2).toUpperCase();
}

/**
 * Profile view — standalone full-screen overlay at /profile (no nav rail).
 * Ports legacy loadProfilePage/fetchUserProfile/saveProfileChanges: shows the
 * deep-blue initials avatar, display name + email, and an editable form
 * (first_name, last_name, department) saved via services/profile.updateProfile.
 */
export function ProfileView() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const session = useAppStore((s) => s.session);
  const storeProfile = useAppStore((s) => s.userProfile);
  const setUserProfile = useAppStore((s) => s.setUserProfile);

  const email = session?.user?.email ?? storeProfile?.email ?? '';

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [profile, setProfile] = useState<UserProfile | null>(storeProfile);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [department, setDepartment] = useState('');
  const [saving, setSaving] = useState(false);

  function applyProfile(p: UserProfile) {
    setProfile(p);
    setFirstName(p.first_name ?? '');
    setLastName(p.last_name ?? '');
    setDepartment(p.department ?? '');
  }

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    getProfile()
      .then((p) => {
        if (cancelled) return;
        applyProfile(p);
        setUserProfile(p);
        setLoadState('ready');
      })
      .catch((err) => {
        console.error('Error fetching user profile:', err);
        if (cancelled) return;
        // Fall back to whatever the store already holds so the form is usable.
        if (storeProfile) {
          applyProfile(storeProfile);
          setLoadState('ready');
        } else {
          setLoadState('error');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fn = firstName.trim();
    const ln = lastName.trim();
    const dept = department.trim();

    if (!fn || !ln) {
      toast('First name and last name are required.', { variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const saved = await updateProfile({
        first_name: fn,
        last_name: ln,
        ...(dept ? { department: dept } : {}),
      });
      applyProfile(saved);
      setUserProfile(saved);
      toast('Profile updated.', { variant: 'success' });
    } catch (err) {
      console.error('Profile save error:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast(`Failed to save: ${message}`, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    navigate('/login');
  }

  const displayName =
    `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() ||
    'Your Profile';

  return (
    <div className="project-overlay">
      <div className="project-dashboard profile-dashboard">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-6)',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/projects')}
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            }
          >
            Back
          </Button>
          <Button variant="secondary" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>

        {loadState === 'error' ? (
          <ErrorState
            title="Could not load your profile"
            message="We couldn't reach the profile service. Check your connection and try again."
            onRetry={() => {
              setLoadState('loading');
              getProfile()
                .then((p) => {
                  applyProfile(p);
                  setUserProfile(p);
                  setLoadState('ready');
                })
                .catch((err) => {
                  console.error('Error fetching user profile:', err);
                  setLoadState('error');
                });
            }}
          />
        ) : (
          <>
            <div className="profile-hero">
              <div className="profile-avatar-lg" aria-hidden="true">
                {initials(profile, email)}
              </div>
              <div className="profile-hero-info">
                <h1 className="view-title" style={{ marginBottom: 4 }}>
                  {displayName}
                </h1>
                <p
                  className="yx-text-muted"
                  style={{ fontSize: 14, margin: 0 }}
                >
                  {email}
                </p>
              </div>
            </div>

            <form className="profile-form-section" onSubmit={handleSubmit} noValidate>
              <h2 style={{ marginBottom: 'var(--space-5)', fontSize: 16 }}>
                Personal Information
              </h2>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="profile-first-name">
                    First Name *
                  </label>
                  <input
                    type="text"
                    id="profile-first-name"
                    className="form-input"
                    required
                    autoComplete="given-name"
                    placeholder="First name"
                    value={firstName}
                    disabled={loadState === 'loading'}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="profile-last-name">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    id="profile-last-name"
                    className="form-input"
                    required
                    autoComplete="family-name"
                    placeholder="Last name"
                    value={lastName}
                    disabled={loadState === 'loading'}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="profile-department">
                  Department{' '}
                  <span style={{ color: 'var(--app-fg-muted)', fontWeight: 400 }}>
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  id="profile-department"
                  className="form-input"
                  autoComplete="organization-title"
                  placeholder="e.g. Field Services"
                  value={department}
                  disabled={loadState === 'loading'}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="profile-email-field">
                  Email
                </label>
                <input
                  type="email"
                  id="profile-email-field"
                  className="form-input"
                  autoComplete="email"
                  disabled
                  value={email}
                  readOnly
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 'var(--space-2)',
                }}
              >
                <Button
                  type="submit"
                  variant="primary"
                  loading={saving}
                  disabled={loadState === 'loading'}
                >
                  {saving ? 'Saving' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default ProfileView;
