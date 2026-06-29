import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ToastProvider } from '@/components/Toast';
import { ConfirmDialogProvider } from '@/components/ConfirmDialog';
import { LoginView } from '@/features/auth/LoginView';
import { ProjectsView } from '@/features/projects/ProjectsView';
import { ProfileView } from '@/features/profile/ProfileView';
import { AppLayout } from '@/layout/AppLayout';
import { EngineersView } from '@/features/engineers/EngineersView';
import { JobsView } from '@/features/jobs/JobsView';
import { HistoryView } from '@/features/history/HistoryView';
import { ActivityView } from '@/features/activity/ActivityView';
import { MapView } from '@/features/map/MapView';
import { useAppStore } from '@/store/appStore';
import type { ReactNode } from 'react';

/** Boot splash while the Supabase session resolves (mirrors the legacy boot gate). */
function Splash() {
  return (
    <div
      className="auth-overlay"
      style={{ display: 'grid', placeItems: 'center' }}
      aria-busy="true"
      aria-label="Loading"
    >
      <img src="/assets/yuroute-icon@2x.png" alt="YuRoute" width={48} height={48} />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const session = useAppStore((s) => s.session);
  return session ? <>{children}</> : <Navigate to="/login" replace />;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const session = useAppStore((s) => s.session);
  return session ? <Navigate to="/projects" replace /> : <>{children}</>;
}

function Router() {
  const boot = useAppStore((s) => s.boot);
  if (boot === 'pending') return <Splash />;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginView />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/projects"
        element={
          <RequireAuth>
            <ProjectsView />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfileView />
          </RequireAuth>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="map" replace />} />
        <Route path="map" element={<MapView />} />
        <Route path="engineers" element={<EngineersView />} />
        <Route path="jobs" element={<JobsView />} />
        <Route path="history" element={<HistoryView />} />
        <Route path="activity" element={<ActivityView />} />
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmDialogProvider>
        <AuthProvider>
          <BrowserRouter>
            <Router />
          </BrowserRouter>
        </AuthProvider>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
}
