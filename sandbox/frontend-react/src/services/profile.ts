/**
 * User profile service. Reads/writes the authenticated user's profile via the
 * FastAPI `/api/profile` endpoints (which use a service-role client to bypass
 * RLS), mirroring the legacy saveProfile() flow.
 */

import { apiFetch } from '@/lib/api';
import type { UserProfile } from '@/store/appStore';

/** Fetch the current user's profile. */
export async function getProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/profile', { method: 'GET' });
}

export interface ProfilePatch {
  first_name: string;
  last_name: string;
  department?: string;
}

/** Update the current user's profile. Returns the saved profile. */
export async function updateProfile(patch: ProfilePatch): Promise<UserProfile> {
  return apiFetch<UserProfile>('/profile', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}
