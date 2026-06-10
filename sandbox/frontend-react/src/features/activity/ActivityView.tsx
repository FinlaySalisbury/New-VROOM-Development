import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import { listActivity } from '@/services/activity';
import { listMembers } from '@/services/projects';
import type { ActivityCategory, ActivityEntry, Member } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { friendlyError } from '@/lib/errors';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { describeAction, timeAgo } from './actionDescriptions';

const PAGE_SIZE = 30;

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const CATEGORY_CHIPS: { value: ActivityCategory; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'team', label: 'Team' },
  { value: 'dispatch', label: 'Dispatch' },
  { value: 'data', label: 'Data' },
  { value: 'project', label: 'Project' },
];

const DATE_OPTIONS: { value: string; label: string }[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '', label: 'All time' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function actorName(entry: ActivityEntry): string {
  return (
    entry.actor_display_name ||
    entry.actor_email?.split('@')[0] ||
    'Unknown'
  );
}

function memberLabel(m: Member): string {
  return m.display_name || m.email || m.user_id.substring(0, 8);
}

/**
 * Activity Log view — ported from the legacy loadActivityLog / filterActivity /
 * loadMoreActivity / populateActivityUserFilter flow. Renders inside AppLayout
 * as the 'activity' section. Timeline of project actions with category, user
 * and date filters plus "load more" pagination.
 */
export function ActivityView() {
  const params = useParams<{ id: string }>();
  const storeProjectId = useAppStore((s) => s.projectId);
  const projectId = params.id ?? storeProjectId ?? null;

  const [category, setCategory] = useState<ActivityCategory>('all');
  const [userFilter, setUserFilter] = useState('');
  const [sinceDays, setSinceDays] = useState('30');

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>(
    'loading',
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const offsetRef = useRef(0);
  const userFilterId = useId();
  const dateFilterId = useId();

  // Member list for the user filter dropdown (legacy populateActivityUserFilter).
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    listMembers(projectId)
      .then((m) => {
        if (!cancelled) setMembers(m);
      })
      .catch(() => {
        // Non-fatal: the user filter simply stays at "All members".
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const load = useCallback(
    async (append: boolean) => {
      if (!projectId) return;
      if (append) {
        setLoadingMore(true);
      } else {
        offsetRef.current = 0;
        setStatus('loading');
      }

      try {
        const batch = await listActivity(projectId, {
          category,
          userId: userFilter || undefined,
          sinceDays: sinceDays ? Number(sinceDays) : undefined,
          offset: offsetRef.current,
          pageSize: PAGE_SIZE,
        });

        setEntries((prev) => (append ? [...prev, ...batch] : batch));
        offsetRef.current += batch.length;
        setHasMore(batch.length >= PAGE_SIZE);
        setStatus('ready');
      } catch (e) {
        if (append) {
          setHasMore(false);
        } else {
          setErrorMsg(friendlyError(e, 'Could not load activity. Please try again.'));
          setStatus('error');
        }
      } finally {
        setLoadingMore(false);
      }
    },
    [projectId, category, userFilter, sinceDays],
  );

  // Reload whenever a filter changes (or on mount).
  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="view-container" style={{ maxWidth: '900px' }}>
      <PageHeader
        title="Activity Log"
        subtitle="Chronological record of all project actions."
      />

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div
          role="group"
          aria-label="Filter by category"
          style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}
        >
          {CATEGORY_CHIPS.map((chip) => {
            const active = category === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                className={active ? 'activity-chip active' : 'activity-chip'}
                aria-pressed={active}
                onClick={() => setCategory(chip.value)}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="yx-field" style={{ margin: 0 }}>
          <label htmlFor={userFilterId} style={visuallyHidden}>
            Filter by member
          </label>
          <select
            id={userFilterId}
            className="form-input"
            style={{ width: '180px', height: '36px', fontSize: '12px' }}
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          >
            <option value="">All members</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
        </div>

        <div className="yx-field" style={{ margin: 0 }}>
          <label htmlFor={dateFilterId} style={visuallyHidden}>
            Filter by date range
          </label>
          <select
            id={dateFilterId}
            className="form-input"
            style={{ width: '140px', height: '36px', fontSize: '12px' }}
            value={sinceDays}
            onChange={(e) => setSinceDays(e.target.value)}
          >
            {DATE_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status === 'loading' && (
        <LoadingSkeleton count={5} height="56px" grid={false} label="Loading activity" />
      )}

      {status === 'error' && (
        <ErrorState
          title="Could not load activity"
          message={errorMsg}
          onRetry={() => void load(false)}
        />
      )}

      {status === 'ready' && entries.length === 0 && (
        <EmptyState
          title="No activity yet"
          description="As your team runs dispatches, edits data, and manages members, those actions will appear here. Try widening the date range or clearing the filters."
        />
      )}

      {status === 'ready' && entries.length > 0 && (
        <>
          <ul
            aria-label="Activity timeline"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {entries.map((entry) => {
              const comment = entry.details?.comment;
              return (
                <li key={entry.id} className="activity-item">
                  <span
                    className="activity-dot"
                    data-category={entry.category}
                    aria-hidden="true"
                  />
                  <div className="activity-body">
                    <div className="activity-text">
                      <strong>{actorName(entry)}</strong>{' '}
                      {describeAction(entry.action, entry.details)}
                    </div>
                    <div className="activity-meta">
                      {formatDate(entry.created_at)} · {timeAgo(entry.created_at)}
                    </div>
                    {typeof comment === 'string' && comment && (
                      <div className="activity-detail">&quot;{comment}&quot;</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 'var(--space-5)' }}>
              <Button
                variant="secondary"
                size="sm"
                loading={loadingMore}
                onClick={() => void load(true)}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ActivityView;
