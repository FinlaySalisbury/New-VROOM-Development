import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { friendlyError } from '@/lib/errors';
import { getTestRun, listTestRuns } from '@/services/history';
import { useAppStore } from '@/store/appStore';
import type { TestRun, TestRunDetail } from '@/types';
import { historyRunToResult } from './replay';

// ── Formatting helpers (ported from legacy app.js) ────────────

const STRATEGY_LABELS: Record<string, string> = {
  naive: 'Naive',
  inhouse: 'In-House',
  tomtom_premium: 'TomTom',
  here_premium: 'HERE',
};

function formatStrategy(s: string): string {
  return STRATEGY_LABELS[s] ?? s;
}

function formatDuration(s?: number | null): string {
  if (s == null) return '--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDistance(m?: number | null): string {
  if (m == null) return '--';
  return `${(m / 1000).toFixed(1)} km`;
}

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function strategyBadgeColor(strategy: string): string {
  // On-brand: Royal Blue is the workhorse highlight; premium strategies get it.
  if (strategy === 'tomtom_premium' || strategy === 'here_premium') {
    return 'var(--yx-royal, #1E2ED9)';
  }
  return 'var(--app-fg, #000)';
}

// ── Per-engineer analytics (ported from renderEngineerStats) ──

interface EngineerLeg {
  duration_s?: number;
}

interface EngineerActivity {
  action?: string;
  duration_s?: number;
}

interface RouteData {
  vehicle_id?: number | string;
  vehicle_name?: string;
  vehicle_skills?: (number | string)[];
  num_jobs_assigned?: number;
  legs?: EngineerLeg[];
  activity_log?: EngineerActivity[];
  availability_start?: string;
  availability_end?: string;
}

interface EngineerStat {
  key: string;
  name: string;
  jobsAssigned: number;
  travelS: number;
  serviceS: number;
  availStart: string;
  availEnd: string;
  skills: string[];
}

/**
 * Aggregate the stored routes_data into one card per base engineer, mirroring
 * the legacy renderEngineerStats grouping by name (strips the _Day suffix and
 * sums legs/service across days).
 */
function buildEngineerStats(detail: TestRunDetail): EngineerStat[] {
  const routes = (detail.routes_data ?? []) as RouteData[];
  if (!routes.length) return [];

  const grouped = new Map<string, EngineerStat>();

  for (const rd of routes) {
    const baseName = String(rd.vehicle_name ?? '').split('_Day')[0] || 'Engineer';
    let agg = grouped.get(baseName);
    if (!agg) {
      agg = {
        key: baseName,
        name: baseName,
        jobsAssigned: 0,
        travelS: 0,
        serviceS: 0,
        availStart: rd.availability_start ?? '--',
        availEnd: rd.availability_end ?? '--',
        skills: (rd.vehicle_skills ?? [])
          .map((s) => String(s))
          .filter((s) => !s.startsWith('_remix')),
      };
      grouped.set(baseName, agg);
    }
    agg.jobsAssigned += rd.num_jobs_assigned ?? 0;
    agg.travelS += (rd.legs ?? []).reduce((sum, l) => sum + (l.duration_s ?? 0), 0);
    agg.serviceS += (rd.activity_log ?? [])
      .filter((a) => a.action === 'service')
      .reduce((sum, a) => sum + (a.duration_s ?? 0), 0);
  }

  return Array.from(grouped.values());
}

// ── List item ─────────────────────────────────────────────────

interface RunCardProps {
  run: TestRun;
  selected: boolean;
  onView: (run: TestRun) => void;
}

function RunCard({ run, selected, onView }: RunCardProps) {
  return (
    <article
      className="data-card"
      aria-current={selected ? 'true' : undefined}
      style={{
        borderColor: selected ? 'var(--yx-royal, #1E2ED9)' : undefined,
        boxShadow: selected ? 'var(--shadow-glow)' : undefined,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-h5, 1.1rem)',
            fontWeight: 700,
          }}
        >
          {run.name?.trim() || `Dispatch #${run.test_number ?? '?'}`}
        </h3>
        <span
          className="yx-tag"
          style={{
            color: '#fff',
            background: strategyBadgeColor(run.strategy),
            borderRadius: 'var(--radius-pill)',
            padding: '2px 10px',
          }}
        >
          {formatStrategy(run.strategy)}
        </span>
      </div>

      <p
        style={{
          margin: 'var(--space-2) 0 0',
          color: 'var(--app-muted, #555)',
          fontSize: 'var(--fs-sm, 0.875rem)',
        }}
      >
        {formatTime(run.created_at)}
      </p>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--space-2) var(--space-4)',
          margin: 'var(--space-3) 0 0',
        }}
      >
        <Stat label="Engineers" value={String(run.num_engineers)} />
        <Stat label="Jobs" value={String(run.num_jobs)} />
        <Stat label="Total time" value={formatDuration(run.total_duration_s)} />
        <Stat label="Distance" value={formatDistance(run.total_distance_m)} />
        {run.unassigned_jobs != null && (
          <Stat label="Unassigned" value={String(run.unassigned_jobs)} />
        )}
      </dl>

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onView(run)}
          aria-label={`View analytics for ${run.name?.trim() || `dispatch ${run.test_number ?? ''}`}`}
        >
          View analytics
        </Button>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt
        style={{
          fontSize: 'var(--fs-xs, 0.75rem)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-caps, 0.08em)',
          color: 'var(--app-muted, #555)',
          margin: 0,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </dd>
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────

interface RunDetailProps {
  open: boolean;
  summary: TestRun | null;
  detail: TestRunDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onReplay: () => void;
}

function RunDetailModal({
  open,
  summary,
  detail,
  loading,
  error,
  onClose,
  onRetry,
  onReplay,
}: RunDetailProps) {
  const title = summary
    ? summary.name?.trim() || `Dispatch #${summary.test_number ?? '?'}`
    : 'Run details';

  const engineers = detail ? buildEngineerStats(detail) : [];

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="lg"
      footer={
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            onClick={onReplay}
            disabled={loading || !detail}
            title="Render this run on the map and animate the routes"
            aria-label="Replay on map"
          >
            Replay on map
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {loading && <LoadingSkeleton count={3} grid={false} label="Loading run details" />}

      {!loading && error && (
        <ErrorState
          title="Could not load run"
          message={error}
          onRetry={onRetry}
        />
      )}

      {!loading && !error && detail && (
        <div>
          <section aria-label="Run summary">
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 'var(--space-4)',
                margin: '0 0 var(--space-5)',
              }}
            >
              <Stat label="Strategy" value={formatStrategy(detail.strategy)} />
              <Stat label="Engineers" value={String(detail.num_engineers)} />
              <Stat label="Jobs" value={String(detail.num_jobs)} />
              <Stat label="Total time" value={formatDuration(detail.total_duration_s)} />
              <Stat label="Distance" value={formatDistance(detail.total_distance_m)} />
              <Stat
                label="Unassigned"
                value={detail.unassigned_jobs != null ? String(detail.unassigned_jobs) : '--'}
              />
              {detail.api_cost_estimate != null && (
                <Stat
                  label="API cost"
                  value={`$${detail.api_cost_estimate.toFixed(2)}`}
                />
              )}
            </dl>
          </section>

          <section aria-label="Per-engineer analytics">
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-h5, 1.1rem)',
                fontWeight: 700,
                margin: '0 0 var(--space-3)',
              }}
            >
              Engineer breakdown
            </h3>

            {engineers.length === 0 ? (
              <p style={{ color: 'var(--app-muted, #555)', margin: 0 }}>
                No per-engineer analytics were stored for this run.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'grid',
                  gap: 'var(--space-3)',
                }}
              >
                {engineers.map((eng) => (
                  <li key={eng.key} className="data-card">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 'var(--space-3)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong>{eng.name}</strong>
                      <span style={{ color: 'var(--app-muted, #555)' }}>
                        {eng.jobsAssigned} jobs
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--space-4)',
                        flexWrap: 'wrap',
                        marginTop: 'var(--space-2)',
                        fontSize: 'var(--fs-sm, 0.875rem)',
                        color: 'var(--app-muted, #555)',
                      }}
                    >
                      <span>Available: {eng.availStart} — {eng.availEnd}</span>
                      <span>Travel: {formatDuration(eng.travelS)}</span>
                      <span>Service: {formatDuration(eng.serviceS)}</span>
                    </div>
                    {eng.skills.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          gap: 'var(--space-2)',
                          flexWrap: 'wrap',
                          marginTop: 'var(--space-2)',
                        }}
                      >
                        {eng.skills.map((s) => (
                          <span key={s} className="yx-tag">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

// ── Main view ─────────────────────────────────────────────────

const HISTORY_ICON = (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

export function HistoryView() {
  const params = useParams<{ id: string }>();
  const storeProjectId = useAppStore((s) => s.projectId);
  const setMapRun = useAppStore((s) => s.setMapRun);
  const projectId = params.id ?? storeProjectId ?? null;
  const navigate = useNavigate();

  const [runs, setRuns] = useState<TestRun[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState<string>('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeSummary, setActiveSummary] = useState<TestRun | null>(null);
  const [detail, setDetail] = useState<TestRunDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detailError, setDetailError] = useState<string>('');

  const loadRuns = useCallback(async () => {
    if (!projectId) {
      setStatus('error');
      setListError('No project selected.');
      return;
    }
    setStatus('loading');
    setListError('');
    try {
      const data = await listTestRuns(projectId, { limit: 50 });
      setRuns(data);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setListError(friendlyError(err, 'Could not load run history. Please try again.'));
    }
  }, [projectId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const loadDetail = useCallback(
    async (run: TestRun) => {
      if (!projectId) return;
      setDetailStatus('loading');
      setDetailError('');
      try {
        const d = await getTestRun(projectId, run.id);
        setDetail(d);
        setDetailStatus('ready');
      } catch (err) {
        setDetailStatus('error');
        setDetailError(friendlyError(err, 'Could not load this run. Please try again.'));
      }
    },
    [projectId],
  );

  const handleView = useCallback(
    (run: TestRun) => {
      setActiveSummary(run);
      setDetail(null);
      setDetailOpen(true);
      void loadDetail(run);
    },
    [loadDetail],
  );

  const handleReplay = useCallback(() => {
    if (!detail || !projectId) return;
    // Stage the stored run for the map view and navigate there — no re-solve,
    // matching the legacy viewHistoryRun (free, instant render + animation).
    setMapRun(historyRunToResult(detail));
    setDetailOpen(false);
    navigate(`/projects/${projectId}/map`);
  }, [detail, projectId, setMapRun, navigate]);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
  }, []);

  return (
    <div className="view-container">
      <PageHeader
        title="Dispatch history and analytics"
        subtitle="Review previous simulation runs and their stored analytics."
      />

      {status === 'loading' && (
        <LoadingSkeleton count={4} grid label="Loading dispatch history" />
      )}

      {status === 'error' && (
        <ErrorState
          title="Could not load history"
          message={listError}
          onRetry={() => void loadRuns()}
        />
      )}

      {status === 'ready' && runs.length === 0 && (
        <EmptyState
          icon={HISTORY_ICON}
          title="No dispatches yet"
          description="Run a simulation from the map view to record your first dispatch. Completed runs appear here with their analytics."
        />
      )}

      {status === 'ready' && runs.length > 0 && (
        <div className="bento-grid">
          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              selected={detailOpen && activeSummary?.id === run.id}
              onView={handleView}
            />
          ))}
        </div>
      )}

      <RunDetailModal
        open={detailOpen}
        summary={activeSummary}
        detail={detail}
        loading={detailStatus === 'loading'}
        error={detailStatus === 'error' ? detailError : null}
        onClose={closeDetail}
        onRetry={() => activeSummary && void loadDetail(activeSummary)}
        onReplay={handleReplay}
      />
    </div>
  );
}

export default HistoryView;
