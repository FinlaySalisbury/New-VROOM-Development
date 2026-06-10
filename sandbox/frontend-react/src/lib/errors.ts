/**
 * Convert a caught error into a user-facing message.
 * Always logs the raw error for debugging, but only surfaces clean,
 * human-readable messages — technical noise (JWT/network/Postgrest/HTTP
 * status/stack-ish strings) collapses to the provided fallback so users
 * never see internals like "Expected 3 parts in JWT; got 1".
 */
const TECHNICAL =
  /jwt|token|fetch|networkerror|failed to fetch|pgrst|supabase|<!doctype|\[object|typeerror|econn|\b[45]\d\d\b|undefined is not|cannot read prop/i;

export function friendlyError(err: unknown, fallback: string): string {
  if (err) console.error(err);
  const msg = err instanceof Error ? err.message.trim() : '';
  if (!msg || msg.length > 140 || TECHNICAL.test(msg)) return fallback;
  return msg;
}
