import type { ReactNode } from 'react';

/**
 * Human-readable phrasing for each activity_log `action`, ported from the
 * legacy ACTION_DESCRIPTIONS map in app.js. Returns a ReactNode (the legacy
 * version emitted raw HTML with <strong> emphasis on key values).
 */

type Details = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? '' : String(v));

const DESCRIPTIONS: Record<string, (d: Details) => ReactNode> = {
  'member.invited': (d) => (
    <>
      invited <strong>{str(d.email)}</strong> as {str(d.role)}
    </>
  ),
  'member.invite_requested': (d) => (
    <>
      requested to invite <strong>{str(d.email)}</strong> as {str(d.role)}
    </>
  ),
  'member.request_approved': (d) => (
    <>
      approved invite request for <strong>{str(d.email)}</strong> as{' '}
      {str(d.role)}
    </>
  ),
  'member.request_rejected': (d) => (
    <>
      rejected invite request for <strong>{str(d.email)}</strong>
      {d.reason ? `: "${str(d.reason)}"` : ''}
    </>
  ),
  'member.joined': (d) => <>joined the project as {str(d.role)}</>,
  'member.removed': () => <>removed a member from the project</>,
  'member.role_changed': (d) => (
    <>
      changed a member&apos;s role from {str(d.from)} to{' '}
      <strong>{str(d.to)}</strong>
    </>
  ),
  'member.left': () => <>left the project</>,
  'project.updated': (d) => <>updated project {str(d.field) || 'settings'}</>,
  'project.deleted': () => <>deleted the project</>,
  'dispatch.run': (d) => (
    <>
      ran dispatch #{str(d.test_number) || '?'} — {str(d.num_engineers)}{' '}
      engineers, {str(d.num_jobs)} jobs ({str(d.strategy)})
    </>
  ),
  'dispatch.remixed': (d) => <>remixed dispatch #{str(d.parent_number) || '?'}</>,
  'data.engineer_added': (d) => (
    <>
      added engineer <strong>{str(d.name)}</strong>
    </>
  ),
  'data.engineer_removed': (d) => (
    <>
      removed engineer <strong>{str(d.name)}</strong>
    </>
  ),
  'data.jobs_uploaded': (d) => <>uploaded {str(d.count) || '?'} jobs</>,
  'data.depot_changed': () => <>changed depot location</>,
};

/** Render the human phrasing for an action, falling back to the raw action. */
export function describeAction(action: string, details: Details): ReactNode {
  const fn = DESCRIPTIONS[action];
  return fn ? fn(details) : action;
}

/** Compact relative time, ported from app.js `_timeAgo`. */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
