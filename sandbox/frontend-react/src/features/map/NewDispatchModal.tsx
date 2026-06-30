import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { friendlyError } from '@/lib/errors';
import type { RoutingStrategy, SimulationRequest } from '@/services/simulation';
import type { Engineer, JobList } from '@/types';
import { listEngineers } from '@/services/engineers';
import { listJobLists } from '@/services/jobs';
import { getGlobalSettings } from '@/services/settings';
import {
  buildRealScenario,
  datesInRange,
  defaultDayShift,
  isoDate,
  isWeekday,
  utcMidnight,
  MAX_RANGE_DAYS,
  type DayShift,
  type EngineerRota,
} from './buildRealScenario';
import { RotaMatrix } from './RotaMatrix';

interface Props {
  open: boolean;
  running: boolean;
  projectId: string;
  onClose: () => void;
  onRun: (cfg: Omit<SimulationRequest, 'project_id'>) => void | Promise<void>;
}

type Mode = 'sample' | 'live';

const STRATEGIES: { value: RoutingStrategy; label: string; note: string; paid: boolean }[] = [
  { value: 'inhouse', label: 'In-house model', note: 'London traffic model · free · instant', paid: false },
  { value: 'naive', label: 'Naive (straight-line)', note: 'Distance ÷ 30 km/h · free · instant', paid: false },
  { value: 'tomtom_premium', label: 'TomTom Premium', note: 'Real road + predictive traffic · paid', paid: true },
  { value: 'here_premium', label: 'HERE Premium', note: 'HERE matrix routing · paid', paid: true },
];

/** Map every day-cell of every engineer's rota through `fn`. */
function mapRotaDays(
  rota: Record<string, EngineerRota>,
  fn: (day: DayShift, iso: string) => DayShift,
): Record<string, EngineerRota> {
  return Object.fromEntries(
    Object.entries(rota).map(([id, r]) => [
      id,
      { ...r, days: Object.fromEntries(Object.entries(r.days).map(([iso, d]) => [iso, fn(d, iso)])) },
    ]),
  );
}

export function NewDispatchModal({ open, running, projectId, onClose, onRun }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('sample');

  // Sample mode
  const [numEngineers, setNumEngineers] = useState(5);
  const [numJobs, setNumJobs] = useState(20);

  // Live mode
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [jobLists, setJobLists] = useState<JobList[]>([]);
  const [depot, setDepot] = useState<[number, number]>([-0.1278, 51.5074]);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');
  const loadingRef = useRef(false);
  const [jobListId, setJobListId] = useState('');
  const [rangeStart, setRangeStart] = useState<string>(() => isoDate(new Date()));
  const [rangeEnd, setRangeEnd] = useState<string>(() => isoDate(new Date(Date.now() + 6 * 86400000)));
  const [rota, setRota] = useState<Record<string, EngineerRota>>({});
  const [globalStart, setGlobalStart] = useState('08:00');
  const [globalEnd, setGlobalEnd] = useState('18:00');

  const dates = useMemo(() => datesInRange(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  // Shared
  const [strategy, setStrategy] = useState<RoutingStrategy>('inhouse');
  const [name, setName] = useState('');

  const selected = STRATEGIES.find((s) => s.value === strategy);
  const waypoints = numEngineers + numJobs;
  const tomtomCost = (waypoints * waypoints * 0.0004).toFixed(2);

  // Lazy-load the project's real data the first time Live mode is opened.
  // NB: `liveLoading` is deliberately NOT a dependency and the in-flight guard
  // is a ref — setting loading state inside the effect must not retrigger it,
  // or the cleanup would cancel the very fetch we're awaiting.
  useEffect(() => {
    if (!open || mode !== 'live' || liveLoaded || loadingRef.current) return;
    loadingRef.current = true;
    let cancelled = false;
    setLiveLoading(true);
    setLiveError('');
    (async () => {
      try {
        const [engs, lists, settings] = await Promise.all([
          listEngineers(projectId),
          listJobLists(projectId),
          getGlobalSettings(projectId),
        ]);
        if (cancelled) return;
        setEngineers(engs);
        setJobLists(lists);
        setDepot(settings.mainDepot);
        setJobListId(lists[0]?.id ?? '');
        setLiveLoaded(true);
      } catch (err) {
        if (!cancelled) setLiveError(friendlyError(err, 'Could not load engineers and job lists.'));
      } finally {
        if (!cancelled) setLiveLoading(false);
        loadingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, projectId, liveLoaded]);

  // Materialise the rota to cover exactly the range's dates, preserving any
  // existing per-date selections and defaulting new dates (weekdays on).
  useEffect(() => {
    if (engineers.length === 0 || dates.length === 0) return;
    setRota((prev) =>
      Object.fromEntries(
        engineers.map((e) => {
          const existing = prev[e.id];
          const days: Record<string, DayShift> = {};
          for (const d of dates) {
            const iso = isoDate(d);
            days[iso] = existing?.days?.[iso] ?? defaultDayShift(e, d);
          }
          return [e.id, { locationMode: existing?.locationMode ?? 'home', days }];
        }),
      ),
    );
  }, [engineers, dates]);

  const activeJobList = jobLists.find((l) => l.id === jobListId) ?? null;
  const engineerDays = Object.values(rota).reduce(
    (n, r) => n + Object.values(r.days).filter((d) => d.enabled).length,
    0,
  );
  const rangeInvalid = dates.length === 0;
  const rangeClamped = dates.length >= MAX_RANGE_DAYS;
  const liveReady =
    liveLoaded && !rangeInvalid && engineerDays > 0 && !!activeJobList && (activeJobList.jobs?.length ?? 0) > 0;

  const updateEngineerRota = (id: string, next: EngineerRota) =>
    setRota((prev) => ({ ...prev, [id]: next }));
  const applyGlobalTimes = () =>
    setRota((prev) => mapRotaDays(prev, (d) => ({ ...d, start: globalStart, end: globalEnd })));
  const setAllDays = (enabled: boolean) => setRota((prev) => mapRotaDays(prev, (d) => ({ ...d, enabled })));
  const setWeekdaysOnly = () =>
    setRota((prev) => mapRotaDays(prev, (d, iso) => ({ ...d, enabled: isWeekday(utcMidnight(iso)) })));

  function submitSample() {
    void onRun({
      num_engineers: Math.max(1, Math.min(500, numEngineers)),
      num_jobs: Math.max(1, Math.min(5000, numJobs)),
      strategy,
      name: name.trim() || undefined,
    });
  }

  function submitLive() {
    if (!activeJobList) return;
    try {
      const { scenario, warnings, vehicleDays } = buildRealScenario({
        engineers,
        jobs: activeJobList.jobs,
        depot,
        dates,
        rota,
      });
      if (warnings.length) toast(warnings.join(' '), { variant: 'info' });
      void onRun({
        num_engineers: vehicleDays,
        num_jobs: scenario.jobs.length,
        strategy,
        name: name.trim() || `Rota dispatch — ${activeJobList.name}`,
        replay_scenario: scenario as unknown as Record<string, unknown>,
      });
    } catch (err) {
      toast(friendlyError(err, 'Could not build the dispatch from your engineers.'), { variant: 'error' });
    }
  }

  const runDisabled = running || (mode === 'live' && !liveReady);

  return (
    <Modal
      open={open}
      title="New dispatch run"
      onClose={onClose}
      size={mode === 'live' ? 'xl' : 'md'}
      disableBackdropClose={running}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={mode === 'sample' ? submitSample : submitLive}
            loading={running}
            disabled={runDisabled}
          >
            Run dispatch →
          </Button>
        </>
      }
    >
      {/* Mode toggle */}
      <div className="dispatch-mode" role="tablist" aria-label="Dispatch source">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'sample'}
          className={`dispatch-mode-tab${mode === 'sample' ? ' is-active' : ''}`}
          onClick={() => setMode('sample')}
          disabled={running}
        >
          Sample scenario
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'live'}
          className={`dispatch-mode-tab${mode === 'live' ? ' is-active' : ''}`}
          onClick={() => setMode('live')}
          disabled={running}
        >
          My engineers &amp; jobs
        </button>
      </div>

      {mode === 'sample' ? (
        <>
          <p style={{ marginTop: 0, color: 'var(--app-fg-muted)' }}>
            Generate a randomised London scenario and solve optimised routes.
          </p>

          <div className="yx-field" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="dispatch-engineers">Engineers</label>
            <input
              id="dispatch-engineers"
              type="number"
              min={1}
              max={50}
              value={numEngineers}
              onChange={(e) => setNumEngineers(Number(e.target.value))}
            />
          </div>

          <div className="yx-field" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="dispatch-jobs">Jobs</label>
            <input
              id="dispatch-jobs"
              type="number"
              min={1}
              max={200}
              value={numJobs}
              onChange={(e) => setNumJobs(Number(e.target.value))}
            />
          </div>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0, color: 'var(--app-fg-muted)' }}>
            Dispatch this project&apos;s real engineers against a saved job list over a date range. Tick
            which days each engineer works and set their shift times — every ticked day is scheduled.
          </p>

          {liveLoading && <p style={{ color: 'var(--app-fg-muted)' }}>Loading engineers and job lists…</p>}
          {liveError && (
            <p className="yx-badge yx-badge-danger" style={{ marginBottom: 'var(--space-4)' }}>
              {liveError}
            </p>
          )}

          {liveLoaded && (
            <>
              {engineers.length === 0 && (
                <p className="yx-badge yx-badge-warn" style={{ marginBottom: 'var(--space-4)' }}>
                  No engineers in this project yet — add some on the Engineers page first.
                </p>
              )}
              {jobLists.length === 0 && (
                <p className="yx-badge yx-badge-warn" style={{ marginBottom: 'var(--space-4)' }}>
                  No job lists yet — import one on the Jobs page first.
                </p>
              )}

              {jobLists.length > 0 && (
                <>
                  <div className="yx-field" style={{ marginBottom: 'var(--space-4)' }}>
                    <label htmlFor="dispatch-joblist">Job list</label>
                    <select
                      id="dispatch-joblist"
                      value={jobListId}
                      onChange={(e) => setJobListId(e.target.value)}
                    >
                      {jobLists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.jobs?.length ?? l.jobCount ?? 0} jobs)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid-2" style={{ marginBottom: 'var(--space-4)' }}>
                    <div className="yx-field">
                      <label htmlFor="dispatch-from">From</label>
                      <input
                        id="dispatch-from"
                        type="date"
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                      />
                    </div>
                    <div className="yx-field">
                      <label htmlFor="dispatch-to">To</label>
                      <input
                        id="dispatch-to"
                        type="date"
                        value={rangeEnd}
                        min={rangeStart}
                        onChange={(e) => setRangeEnd(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {rangeInvalid && (
                <p className="yx-badge yx-badge-danger" style={{ marginBottom: 'var(--space-4)' }}>
                  The “To” date must be on or after the “From” date.
                </p>
              )}
              {rangeClamped && (
                <p className="yx-badge yx-badge-warn" style={{ marginBottom: 'var(--space-4)' }}>
                  Range limited to {MAX_RANGE_DAYS} days.
                </p>
              )}

              {engineers.length > 0 && (
                <>
                  <div className="rota-toolbar">
                    <span className="rota-toolbar-label">Set all shifts</span>
                    <input
                      type="time"
                      className="rota-time"
                      value={globalStart}
                      onChange={(e) => setGlobalStart(e.target.value)}
                      aria-label="Shift start for all"
                    />
                    <input
                      type="time"
                      className="rota-time"
                      value={globalEnd}
                      onChange={(e) => setGlobalEnd(e.target.value)}
                      aria-label="Shift end for all"
                    />
                    <Button variant="secondary" size="sm" onClick={applyGlobalTimes}>
                      Apply
                    </Button>
                    <span style={{ flex: 1 }} />
                    <Button variant="ghost" size="sm" onClick={setWeekdaysOnly}>
                      Weekdays
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setAllDays(true)}>
                      All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setAllDays(false)}>
                      Clear
                    </Button>
                  </div>

                  <RotaMatrix engineers={engineers} dates={dates} rota={rota} onChange={updateEngineerRota} />

                  <p
                    style={{
                      color: 'var(--app-fg-muted)',
                      fontSize: 'var(--fs-small)',
                      margin: 'var(--space-3) 0 0',
                    }}
                  >
                    {dates.length} day{dates.length === 1 ? '' : 's'} · {engineerDays} engineer-day
                    {engineerDays === 1 ? '' : 's'} selected
                    {activeJobList ? ` · ${activeJobList.jobs?.length ?? 0} jobs` : ''}.
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}

      <fieldset style={{ border: 0, margin: 0, padding: 0, marginBottom: 'var(--space-4)' }}>
        <legend
          style={{
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--app-fg-muted)',
            fontWeight: 500,
            marginBottom: 'var(--space-2)',
          }}
        >
          Routing strategy
        </legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {STRATEGIES.map((s) => (
            <label
              key={s.value}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                padding: 'var(--space-3)',
                border: '1px solid var(--app-border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                background: strategy === s.value ? 'var(--app-bg-subtle)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="dispatch-strategy"
                value={s.value}
                checked={strategy === s.value}
                onChange={() => setStrategy(s.value)}
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ fontWeight: 600 }}>{s.label}</span>
                <br />
                <span style={{ fontSize: 'var(--fs-small)', color: 'var(--app-fg-muted)' }}>{s.note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {selected?.paid && mode === 'sample' && (
        <p className="yx-badge yx-badge-warn" style={{ marginBottom: 'var(--space-4)' }} aria-live="polite">
          Est. cost ~£{tomtomCost} · {waypoints} waypoints
        </p>
      )}

      <div className="yx-field">
        <label htmlFor="dispatch-name">Run name (optional)</label>
        <input
          id="dispatch-name"
          type="text"
          value={name}
          maxLength={80}
          placeholder="e.g. Tuesday AM peak"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
    </Modal>
  );
}
