import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';

import { useAppStore } from '@/store/appStore';
import { useToast } from '@/components/Toast';
import { friendlyError } from '@/lib/errors';
import {
  runSimulation,
  type SimulationResult,
  type SimulationRequest,
  type SimFeatureCollection,
} from '@/services/simulation';
import { legStyle, routeColor, URGENCY_COLORS } from './mapColors';
import { NewDispatchModal } from './NewDispatchModal';
import { AnimationLayer } from './AnimationLayer';
import { AnimationControls } from './AnimationControls';
import { buildAnimationModel } from './routeAnimation';
import { ChatPanel } from './ChatPanel';
import { listTestRuns, getTestRun } from '@/services/history';
import { historyRunToResult } from '@/features/history/replay';
import type { TestRun } from '@/types';
import { buildEngineerGroups, colorByVehicle } from './engineerGroups';

const LONDON: [number, number] = [51.505, -0.09];

/** GeoJSON [lon,lat] -> Leaflet [lat,lon]. */
const toLatLng = (c: number[]): [number, number] => [c[1], c[0]];

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Re-fit the map to the rendered features whenever the result changes. */
function FitBounds({ result }: { result: SimulationResult | null }) {
  const map = useMap();
  useMemo(() => {
    if (!result) return;
    const pts: [number, number][] = [];
    for (const f of result.routes_geojson?.features ?? []) {
      const coords = f.geometry?.coordinates as number[][];
      if (Array.isArray(coords)) for (const c of coords) if (Array.isArray(c)) pts.push(toLatLng(c));
    }
    for (const f of result.faults_geojson?.features ?? []) {
      const c = f.geometry?.coordinates as number[];
      if (Array.isArray(c) && typeof c[0] === 'number') pts.push(toLatLng(c));
    }
    if (pts.length) {
      map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 14 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  return null;
}

function RouteLayers({
  fc,
  selectedIds,
  colorOf,
}: {
  fc?: SimFeatureCollection;
  selectedIds: Set<number> | null;
  colorOf: (id: number) => string;
}) {
  if (!fc?.features) return null;
  return (
    <>
      {fc.features.map((f, i) => {
        const props = f.properties ?? {};
        const engId = Number(props.engineer_id ?? 0);
        if (selectedIds && !selectedIds.has(engId)) return null;
        const coords = f.geometry?.coordinates as number[][];
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const mult = Number(props.traffic_multiplier ?? 1);
        const { color, weight } = legStyle(colorOf(engId), mult);
        const positions = coords.filter((c) => Array.isArray(c)).map(toLatLng);
        return (
          <Polyline
            key={`route-${i}`}
            positions={positions}
            pathOptions={{ color, weight, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
          >
            <Popup>
              <strong>Engineer {engId}</strong>
              <br />
              Traffic: {mult.toFixed(2)}×{mult > 1.3 ? ' (delayed)' : ''}
              <br />
              Leg duration: {formatDuration(Number(props.duration_s))}
            </Popup>
          </Polyline>
        );
      })}
    </>
  );
}

function JobLayers({ fc, selectedIds }: { fc?: SimFeatureCollection; selectedIds: Set<number> | null }) {
  if (!fc?.features) return null;
  return (
    <>
      {fc.features.map((f, i) => {
        const props = f.properties ?? {};
        const c = f.geometry?.coordinates as number[];
        if (!Array.isArray(c) || typeof c[0] !== 'number') return null;
        const assignedTo = props.assigned_engineer_id != null ? Number(props.assigned_engineer_id) : null;
        const unassigned = (props.status ?? '') !== 'Assigned';
        if (selectedIds && !unassigned && (assignedTo == null || !selectedIds.has(assignedTo))) return null;
        const urgency = String(props.urgency_level ?? 'low');
        const fill = URGENCY_COLORS[urgency] ?? '#9DBBFF';
        return (
          <CircleMarker
            key={`job-${i}`}
            center={toLatLng(c)}
            radius={unassigned ? 8 : 6}
            pathOptions={{
              color: unassigned ? '#ef4444' : '#ffffff',
              weight: 2,
              fillColor: fill,
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <strong>Job #{String(props.job_id ?? '')}</strong>
              <br />
              {unassigned ? (
                <span style={{ color: '#ef4444' }}>Unassigned</span>
              ) : (
                <>Assigned to engineer {assignedTo}</>
              )}
              <br />
              Urgency: {urgency}
              {props.description ? (
                <>
                  <br />
                  {String(props.description)}
                </>
              ) : null}
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

function DepotLayers({
  result,
  selectedIds,
  colorOf,
}: {
  result: SimulationResult;
  selectedIds: Set<number> | null;
  colorOf: (id: number) => string;
}) {
  return (
    <>
      {(result.routes_data ?? []).map((v) => {
        if (!v.vehicle_start) return null;
        if (selectedIds && !selectedIds.has(v.vehicle_id)) return null;
        return (
          <CircleMarker
            key={`depot-${v.vehicle_id}`}
            center={toLatLng(v.vehicle_start)}
            radius={7}
            pathOptions={{ color: '#000', weight: 2, fillColor: colorOf(v.vehicle_id), fillOpacity: 1 }}
          >
            <Popup>
              <strong>{v.vehicle_name?.split('|')[0]?.trim() || `Engineer ${v.vehicle_id}`}</strong>
              <br />
              {v.num_jobs_assigned ?? 0} jobs · {v.availability_start ?? ''}–{v.availability_end ?? ''}
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

export function MapView() {
  const { id: projectId } = useParams();
  const projectRole = useAppStore((s) => s.projectRole);
  const mapRun = useAppStore((s) => s.mapRun);
  const setMapRun = useAppStore((s) => s.setMapRun);
  const { toast } = useToast();

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [staged, setStaged] = useState<'replay' | 'remix' | null>(null);
  const [running, setRunning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [engineerFilter, setEngineerFilter] = useState<string | 'all'>('all');
  const [expandedEngineer, setExpandedEngineer] = useState<string | null>(null);
  const [pastRuns, setPastRuns] = useState<TestRun[]>([]);

  // Group the solver's per-day vehicles back into one entry per engineer.
  const groups = useMemo(() => buildEngineerGroups(result), [result]);
  const colorOf = useMemo(() => {
    const m = colorByVehicle(groups);
    return (id: number) => m.get(id) ?? routeColor(id);
  }, [groups]);
  const selectedIds = useMemo<Set<number> | null>(() => {
    if (engineerFilter === 'all') return null;
    return groups.find((g) => g.key === engineerFilter)?.vehicleIds ?? null;
  }, [engineerFilter, groups]);

  const refreshHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      setPastRuns(await listTestRuns(projectId, { limit: 50 }));
    } catch {
      /* non-fatal — the history picker just stays empty */
    }
  }, [projectId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const loadPastRun = useCallback(
    async (runId: string) => {
      if (!projectId || !runId) return;
      try {
        const detail = await getTestRun(projectId, runId);
        setResult(historyRunToResult(detail));
        setStaged('replay');
        setEngineerFilter('all');
      } catch (err) {
        toast(friendlyError(err, 'Could not load that dispatch.'), { variant: 'error' });
      }
    },
    [projectId, toast],
  );

  // Consume a run staged from the History view (replay/remix) — one-shot.
  useEffect(() => {
    if (!mapRun) return;
    setResult(mapRun.result);
    setStaged(mapRun.mode);
    setEngineerFilter('all');
    setMapRun(null);
  }, [mapRun, setMapRun]);

  const canRun = projectRole === 'owner' || projectRole === 'admin' || projectRole === 'user';

  // ── Route playback ──────────────────────────────────────────
  const animation = useMemo(() => buildAnimationModel(result, colorOf), [result, colorOf]);
  const hasAnimation = animation.trajectories.length > 0 && animation.endUnix > animation.startUnix;

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(120);
  const [currentUnix, setCurrentUnix] = useState(0);
  const lastFrameRef = useRef(0);

  // Reset the timeline whenever a new solve loads.
  useEffect(() => {
    setPlaying(false);
    setCurrentUnix(animation.startUnix);
  }, [animation]);

  // rAF playback loop — advances sim-time by `speed` seconds per real second.
  useEffect(() => {
    if (!playing || !hasAnimation) return;
    let raf = 0;
    lastFrameRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      setCurrentUnix((prev) => {
        const next = prev + dt * speed;
        if (next >= animation.endUnix) {
          setPlaying(false);
          return animation.endUnix;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, hasAnimation, animation.endUnix]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && currentUnix >= animation.endUnix) setCurrentUnix(animation.startUnix);
      return !p;
    });
  }, [currentUnix, animation.endUnix, animation.startUnix]);

  const handleScrub = useCallback((unix: number) => {
    setPlaying(false);
    setCurrentUnix(unix);
  }, []);

  const exitView = useCallback(() => {
    setResult(null);
    setStaged(null);
    setEngineerFilter('all');
    setExpandedEngineer(null);
    setPlaying(false);
  }, []);

  const unassigned = useMemo(() => {
    if (!result) return 0;
    if (typeof result.vroom_summary?.unassigned === 'number') return result.vroom_summary.unassigned;
    return (result.faults_geojson?.features ?? []).filter((f) => (f.properties?.status ?? '') !== 'Assigned').length;
  }, [result]);

  const handleRun = useCallback(
    async (cfg: Omit<SimulationRequest, 'project_id'>) => {
      if (!projectId) return;
      setRunning(true);
      try {
        const res = await runSimulation({ project_id: projectId, ...cfg });
        setResult(res);
        setStaged(null);
        setEngineerFilter('all');
        setModalOpen(false);
        void refreshHistory();
        toast(`Dispatch #${res.test_number} solved — ${res.num_jobs} jobs.`, { variant: 'success' });
      } catch (err) {
        toast(friendlyError(err, 'The dispatch solve failed. Please try again.'), { variant: 'error' });
      } finally {
        setRunning(false);
      }
    },
    [projectId, toast, refreshHistory],
  );

  return (
    <div className="map-view">
      <MapContainer center={LONDON} zoom={11} className="map-canvas" zoomControl={false} scrollWheelZoom>
        <TileLayer
          // CARTO Positron — clean, minimal light basemap (no API key needed).
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {result && (
          <>
            <RouteLayers fc={result.routes_geojson} selectedIds={selectedIds} colorOf={colorOf} />
            <DepotLayers result={result} selectedIds={selectedIds} colorOf={colorOf} />
            <JobLayers fc={result.faults_geojson} selectedIds={selectedIds} />
            <FitBounds result={result} />
          </>
        )}
        {hasAnimation && (
          <AnimationLayer trajectories={animation.trajectories} currentUnix={currentUnix} />
        )}
      </MapContainer>

      {/* Results summary + history picker */}
      {(result || pastRuns.length > 0) && (
        <section className="map-panel map-summary" aria-label="Dispatch summary">
          {pastRuns.length > 0 && (
            <div className="map-field">
              <label htmlFor="map-history">Past dispatch</label>
              <select
                id="map-history"
                className="form-input"
                value={result?.id ?? ''}
                onChange={(e) => void loadPastRun(e.target.value)}
              >
                <option value="">Load a past run…</option>
                {pastRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.test_number ?? '?'} · {r.name?.trim() || r.strategy.replace('_', ' ')} ({r.num_jobs} jobs)
                  </option>
                ))}
              </select>
            </div>
          )}

          {result && (
          <>
          <div className="map-summary-grid">
            <div className="map-stat">
              <span className="map-stat-num">#{result.test_number}</span>
              <span className="map-stat-label">Run</span>
            </div>
            <div className="map-stat">
              <span className="map-stat-num">{result.num_jobs}</span>
              <span className="map-stat-label">Jobs</span>
            </div>
            <div className="map-stat">
              <span className="map-stat-num">{formatDuration(result.vroom_summary?.duration)}</span>
              <span className="map-stat-label">Total time</span>
            </div>
            <div className="map-stat">
              <span className="map-stat-num" style={{ color: unassigned ? '#ef4444' : undefined }}>
                {unassigned}
              </span>
              <span className="map-stat-label">Unassigned</span>
            </div>
          </div>
          <div className="map-field">
            <label htmlFor="map-eng-filter">Engineer</label>
            <select
              id="map-eng-filter"
              className="form-input"
              value={engineerFilter}
              onChange={(e) => setEngineerFilter(e.target.value)}
            >
              <option value="all">All engineers ({groups.length})</option>
              {groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.name} — {g.totalJobs} jobs
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="yx-badge yx-badge-blue">{result.strategy.replace('_', ' ')}</span>
            {staged === 'replay' && (
              <span className="yx-badge yx-badge-outline" title="Rendered from history — not re-solved">
                Replayed
              </span>
            )}
            {staged === 'remix' && (
              <span className="yx-badge yx-badge-outline" title="Same assignments re-solved under a new strategy">
                Remix
              </span>
            )}
            <button type="button" className="map-exit-btn" onClick={exitView}>
              Exit view
            </button>
          </div>
          </>
          )}
        </section>
      )}

      {/* Engineer breakdown — one row per engineer, expandable to per-day */}
      {result && groups.length > 0 && (
        <aside className="map-panel map-breakdown" aria-label="Engineer breakdown">
          <h2 className="map-breakdown-title">Engineer breakdown</h2>
          <ul className="map-breakdown-list">
            {groups.map((g) => {
              const multiDay = g.days.length > 1;
              const expanded = expandedEngineer === g.key;
              return (
                <li key={g.key}>
                  <div className={`map-breakdown-row${engineerFilter === g.key ? ' is-active' : ''}`}>
                    <button
                      type="button"
                      className="map-breakdown-main"
                      onClick={() => setEngineerFilter(engineerFilter === g.key ? 'all' : g.key)}
                      title="Highlight this engineer on the map"
                    >
                      <span className="map-dot" style={{ background: g.color }} aria-hidden="true" />
                      <span className="map-breakdown-name">{g.name}</span>
                      <span className="map-breakdown-jobs">{g.totalJobs}</span>
                    </button>
                    {multiDay && (
                      <button
                        type="button"
                        className="map-breakdown-toggle"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Hide' : 'Show'} the ${g.days.length} days for ${g.name}`}
                        onClick={() => setExpandedEngineer(expanded ? null : g.key)}
                      >
                        {g.days.length}d {expanded ? '▾' : '▸'}
                      </button>
                    )}
                  </div>
                  {multiDay && expanded && (
                    <ul className="map-breakdown-sub">
                      {g.days.map((d) => (
                        <li key={d.vehicleId} className="map-breakdown-subrow">
                          <span className="map-breakdown-subdate">{d.label}</span>
                          <span className="map-breakdown-subjobs">
                            {d.jobs} job{d.jobs === 1 ? '' : 's'} · {formatDuration(d.travelS + d.serviceS)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      {/* Empty state */}
      {!result && !running && (
        <div className="map-empty">
          <h1 className="map-empty-title">Dispatch map</h1>
          <p className="map-empty-text">
            Run a dispatch to generate optimised routes across London and visualise them here.
          </p>
        </div>
      )}

      {/* Running overlay */}
      {running && (
        <div className="map-loading" role="status" aria-live="polite">
          <div className="map-spinner" aria-hidden="true" />
          <p>Solving dispatch…</p>
        </div>
      )}

      {/* Route playback controls */}
      {hasAnimation && (
        <AnimationControls
          playing={playing}
          currentUnix={currentUnix}
          startUnix={animation.startUnix}
          endUnix={animation.endUnix}
          speed={speed}
          onTogglePlay={togglePlay}
          onScrub={handleScrub}
          onSpeedChange={setSpeed}
        />
      )}

      {/* New dispatch FAB */}
      {canRun && (
        <button type="button" className="map-fab" onClick={() => setModalOpen(true)} disabled={running}>
          + New dispatch run
        </button>
      )}

      {/* Route assistant toggle (only meaningful with a solved run) */}
      {result && (
        <button
          type="button"
          className={`map-chat-fab${chatOpen ? ' is-open' : ''}`}
          onClick={() => setChatOpen((o) => !o)}
          aria-expanded={chatOpen}
        >
          {chatOpen ? 'Close assistant' : 'Ask the route assistant'}
        </button>
      )}

      {result && projectId && (
        <ChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          projectId={projectId}
          runId={result.id}
        />
      )}

      {projectId && (
        <NewDispatchModal
          open={modalOpen}
          running={running}
          projectId={projectId}
          onClose={() => setModalOpen(false)}
          onRun={handleRun}
        />
      )}
    </div>
  );
}
