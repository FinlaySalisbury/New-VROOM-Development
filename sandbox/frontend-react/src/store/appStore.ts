import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { SimulationResult } from '@/services/simulation';

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

  /**
   * A solve result staged for the map view from another section — either a
   * historical run rendered as-is ('replay') or a freshly re-solved comparison
   * ('remix'). MapView consumes and clears it on mount. One-shot handoff across
   * the History→Map navigation.
   */
  mapRun: StagedRun | null;

  setBoot: (b: BootState) => void;
  setSession: (s: Session | null) => void;
  setUserProfile: (p: UserProfile | null) => void;
  setProjects: (p: Project[]) => void;
  selectProject: (id: string | null, role: ProjectRole | null) => void;
  setMapRun: (r: StagedRun | null) => void;
  reset: () => void;
}

export interface StagedRun {
  result: SimulationResult;
  mode: 'replay' | 'remix';
}

const initial = {
  boot: 'pending' as BootState,
  session: null,
  userId: null,
  userProfile: null,
  projectId: null,
  projectRole: null,
  projects: [] as Project[],
  mapRun: null as StagedRun | null,
};

export const useAppStore = create<AppState>((set) => ({
  ...initial,

  setBoot: (boot) => set({ boot }),
  setSession: (session) =>
    set({ session, userId: session?.user?.id ?? null }),
  setUserProfile: (userProfile) => set({ userProfile }),
  setProjects: (projects) => set({ projects }),
  selectProject: (projectId, projectRole) => set({ projectId, projectRole }),
  setMapRun: (mapRun) => set({ mapRun }),
  reset: () => set({ ...initial, boot: 'ready' }),
}));
