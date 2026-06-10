import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

export type ProjectRole = 'viewer' | 'user' | 'admin' | 'owner';

export interface UserProfile {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  department?: string;
  email?: string;
  onboarding_complete?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  role?: ProjectRole;
}

/** Boot gate — mirrors the legacy `AppState.boot` ('pending' | 'ready'). */
export type BootState = 'pending' | 'ready';

interface AppState {
  boot: BootState;
  session: Session | null;
  userId: string | null;
  userProfile: UserProfile | null;
  projectId: string | null;
  projectRole: ProjectRole | null;
  projects: Project[];

  setBoot: (b: BootState) => void;
  setSession: (s: Session | null) => void;
  setUserProfile: (p: UserProfile | null) => void;
  setProjects: (p: Project[]) => void;
  selectProject: (id: string | null, role: ProjectRole | null) => void;
  reset: () => void;
}

const initial = {
  boot: 'pending' as BootState,
  session: null,
  userId: null,
  userProfile: null,
  projectId: null,
  projectRole: null,
  projects: [] as Project[],
};

export const useAppStore = create<AppState>((set) => ({
  ...initial,

  setBoot: (boot) => set({ boot }),
  setSession: (session) =>
    set({ session, userId: session?.user?.id ?? null }),
  setUserProfile: (userProfile) => set({ userProfile }),
  setProjects: (projects) => set({ projects }),
  selectProject: (projectId, projectRole) => set({ projectId, projectRole }),
  reset: () => set({ ...initial, boot: 'ready' }),
}));
