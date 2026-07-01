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
import { useMediaQuery } from '@/lib/useMediaQuery';
import { buildEngineerGroups, colorByVehicle } from './engineerGroups';
import { buildDayGroups } from './dayGroups';
import { BreakdownPanel, type SelectedItem } from './BreakdownPanel';
import { DispatchRibbon, type RibbonStats } from './DispatchRibbon';
import { buildJobLookup } from './dayTimeline';

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

/**
 * Auto-frame the map to the current selection: the whole dispatch when nothing
 * is selected, an engineer's every vehicle-day when one is highlighted, or a
 * single day when drilled in. Re-fits whenever that scope changes.
 */
function FitToSelection({
  result,
  selectedIds,
}: {
  result: SimulationResult;
  selectedIds: Set<number> | null;
}) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    for (const f of result.routes_geojson?.features ?? []) {
      const engId = Number(f.properties?.engineer_id ?? 0);
      if (selectedIds && !selectedIds.has(engId)) continue;
      const coords = f.geometry?.coordinates as number[][];
      if (Array.isArray(coords)) for (const c of coords) if (Array.isArray(c)) pts.push(toLatLng(c));
    }
    for (const f of result.faults_geojson?.features ?? []) {
      const props = f.properties ?? {};
      const assignedTo = props.assigned_engineer_id != null ? Number(props.assigned_engineer_id) : null;
      // When an engineer/day is selected, only frame their assigned jobs.
      if (selectedIds && (assignedTo == null || !selectedIds.has(assignedTo))) continue;
      const c = f.geometry?.coordinates as number[];
      if (Array.isArray(c) && typeof c[0] === 'number') pts.push(toLatLng(c));
    }
    if (pts.length) {
      map.fitBounds(L.latLngBounds(pts), { padding: [56, 56], maxZoom: 15 });
    }
  }, [result, selectedIds, map]);
  return null;
}

/** Pan (not zoom) the map to the currently selected leg/job. */
function PanToSelection({
  result,
  selectedItem,
}: {
  result: SimulationResult;
  selectedItem: SelectedItem;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedItem) return;
    let center: [number, number] | null = null;
    if (selectedItem.kind === 'leg') {
      const f = result.routes_geojson?.features?.find(
        (ft) => String(ft.properties?.leg_id ?? '') === selectedItem.legId,
      );
      const coords = f?.geometry?.coordinates as number[][] | undefined;
      if (Array.isArray(coords) && coords.length) {
        const mid = coords[Math.floor(coords.length / 2)];
        if (Array.isArray(mid)) center = toLatLng(mid);
      }
    } else {
      const f = result.faults_geojson?.features?.find(
        (ft) => Number(ft.properties?.job_id) === selectedItem.jobId,
      );
      const c = f?.geometry?.coordinates as number[] | undefined;
      if (Array.isArray(c) && typeof c[0] === 'number') center = toLatLng(c);
    }
    if (center) map.panTo(center, { animate: true });
  }, [selectedItem, result, map]);
  return null;
}

function RouteLayers({
  fc,
  selectedIds,
  colorOf,
  selectedLegId,
  onSelectLeg,
}: {
  fc?: SimFeatureCollection;
  selectedIds: Set<number> | null;
  colorOf: (id: number) => string;
  selectedLegId: string | null;
  onSelectLeg: (legId: string) => void;
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
        const legId = props.leg_id != null ? String(props.leg_id) : null;
        const isSel = legId != null && legId === selectedLegId;
        const { color, weight } = legStyle(colorOf(engId), mult);
        const positions = coords.filter((c) => Array.isArray(c)).map(toLatLng);
        return (
          <Polyline
            key={`route-${i}`}
            positions={positions}
            pathOptions={{
              color: isSel ? '#1E2ED9' : color,
              weight: isSel ? weight + 4 : weight,
              opacity: isSel ? 1 : 0.85,
              lineCap: 'round',
              lineJoin: 'round',
            }}
            eventHandlers={legId ? { click: () => onSelectLeg(legId) } : undefined}
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

function JobLayers({
  fc,
  selectedIds,
  selectedJobId,
  onSelectJob,
}: {
  fc?: SimFeatureCollection;
  selectedIds: Set<number> | null;
  selectedJobId: number | null;
  onSelectJob: (jobId: number) => void;
}) {
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
        const jobId = props.job_id != null ? Number(props.job_id) : null;
        const isSel = jobId != null && jobId === selectedJobId;
        return (
          <CircleMarker
            key={`job-${i}`}
            center={toLatLng(c)}
            radius={isSel ? 11 : unassigned ? 8 : 6}
            pathOptions={{
              color: isSel ? '#1E2ED9' : unassigned ? '#ef4444' : '#ffffff',
              weight: isSel ? 3 : 2,
              fillColor: fill,
              fillOpacity: 0.95,
            }}
            eventHandlers={jobId != null ? { click: () => onSelectJob(jobId) } : undefined}
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
  const [dayFilter, setDayFilter] = useState<string | 'all'>('all');
  const [expandedEngineer, setExpandedEngineer] = useState<string | null>(null);
  const [dayVehicleId, setDayVehicleId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [pastRuns, setPastRuns] = useState<TestRun[]>([]);

  // Below ~1200px the floating panels can't sit side-by-side without colliding,
  // so they collapse into a bottom sheet (peek → expand).
  const compact = useMediaQuery('(max-width: 1200px)');
  const narrow = useMediaQuery('(max-width: 640px)');
  const [sheetExpanded, setSheetExpanded] = useState(false);

  // Group the solver's per-day vehicles back into one entry per engineer.
  const groups = useMemo(() => buildEngineerGroups(result), [result]);
  // …and the same vehicle-days re-bucketed by calendar date (the day axis).
  const dayGroups = useMemo(() => buildDayGroups(groups), [groups]);
  const colorOf = useMemo(() => {
    const m = colorByVehicle(groups);
    return (id: number) => m.get(id) ?? routeColor(id);
  }, [groups]);
  const jobLookup = useMemo(() => buildJobLookup(result), [result]);
  const routeByVehicle = useMemo(() => {
    const m = new Map<number, NonNullable<SimulationResult['routes_data']>[number]>();
    for (const rd of result?.routes_data ?? []) m.set(rd.vehicle_id, rd);
    return m;
  }, [result]);

  // The active map scope: one drilled vehicle-day, all engineers on one date,
  // one engineer's every day, or the whole dispatch.
  const selectedIds = useMemo<Set<number> | null>(() => {
    if (dayVehicleId != null) return new Set([dayVehicleId]);
    if (dayFilter !== 'all') return dayGroups.find((d) => d.key === dayFilter)?.vehicleIds ?? null;
    if (engineerFilter !== 'all') return groups.find((g) => g.key === engineerFilter)?.vehicleIds ?? null;
    return null;
  }, [dayVehicleId, dayFilter, engineerFilter, groups, dayGroups]);

  const selectedLegId = selectedItem?.kind === 'leg' ? selectedItem.legId : null;
  const selectedJobId = selectedItem?.kind === 'job' ? selectedItem.jobId : null;

  // Reset all navigation + selection whenever the displayed run changes.
  useEffect(() => {
    setDayFilter('all');
    setDayVehicleId(null);
    setSelectedItem(null);
    setSheetExpanded(false);
  }, [result]);

  // Day and engineer are mutually-exclusive entry axes — picking one resets the
  // other so the scope is never an opaque intersection.
  const pickDay = useCallback((key: string | 'all') => {
    setDayFilter(key);
    setEngineerFilter('all');
    setExpandedEngineer(null);
    setDayVehicleId(null);
    setSelectedItem(null);
  }, []);

  const pickEngineer = useCallback((key: string | 'all') => {
    setEngineerFilter(key);
    setDayFilter('all');
    setDayVehicleId(null);
    setSelectedItem(null);
  }, []);

  // Clear any leg/job highlight when the day scope changes.
  useEffect(() => {
    setSelectedItem(null);
  }, [dayVehicleId]);

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
    setDayFilter('all');
    setExpandedEngineer(null);
    setDayVehicleId(null);
    setSelectedItem(null);
    setPlaying(false);
  }, []);

  const unassigned = useMemo(() => {
    if (!result) return 0;
    if (typeof result.vroom_summary?.unassigned === 'number') return result.vroom_summary.unassigned;
    return (result.faults_geojson?.features ?? []).filter((f) => (f.properties?.status ?? '') !== 'Assigned').length;
  }, [result]);

  // Live ribbon stats for the current scope: jobs + labour split into drive/work.
  const ribbonStats = useMemo<RibbonStats>(() => {
    let jobs = 0;
    let travelS = 0;
    let serviceS = 0;
    for (const rd of result?.routes_data ?? []) {
      if (selectedIds && !selectedIds.has(rd.vehicle_id)) continue;
      jobs += rd.num_jobs_assigned ?? 0;
      travelS += (rd.legs ?? []).reduce((s, l) => s + (Number(l.duration_s) || 0), 0);
      serviceS += (rd.activity_log ?? [])
        .filter((a) => a.action === 'service')
        .reduce((s, a) => s + (Number(a.duration_s) || 0), 0);
    }
    return { jobs, travelS, serviceS, unassigned, scoped: selectedIds != null };
  }, [result, selectedIds, unassigned]);

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
    <div className={`map-view${result ? ' has-dispatch' : ''}`}>
      <MapContainer center={LONDON} zoom={11} className="map-canvas" zoomControl={false} scrollWheelZoom>
        <TileLayer
          // CARTO Positron — clean, minimal light basemap (no API key needed).
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {result && (
          <>
            <RouteLayers
              fc={result.routes_geojson}
              selectedIds={selectedIds}
              colorOf={colorOf}
              selectedLegId={selectedLegId}
              onSelectLeg={(legId) => setSelectedItem({ kind: 'leg', legId })}
            />
            <DepotLayers result={result} selectedIds={selectedIds} colorOf={colorOf} />
            <JobLayers
              fc={result.faults_geojson}
              selectedIds={selectedIds}
              selectedJobId={selectedJobId}
              onSelectJob={(jobId) => setSelectedItem({ kind: 'job', jobId })}
            />
            <FitToSelection result={result} selectedIds={selectedIds} />
            <PanToSelection result={result} selectedItem={selectedItem} />
          </>
        )}
        {hasAnimation && (
          <AnimationLayer trajectories={animation.trajectories} currentUnix={currentUnix} />
        )}
      </MapContainer>

      {/* Dispatch panels — floating on desktop, a bottom sheet when compact */}
      {(() => {
        const historyPicker =
          pastRuns.length > 0 ? (
            <section className="map-panel map-history-picker" aria-label="Load past dispatch">
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
            </section>
          ) : null;

        const ribbon = result ? (
          <DispatchRibbon
            testNumber={result.test_number}
            strategy={result.strategy}
            staged={staged}
            dayGroups={dayGroups}
            groups={groups}
            dayFilter={dayFilter}
            onPickDay={pickDay}
            engineerFilter={engineerFilter}
            onPickEngineer={pickEngineer}
            stats={ribbonStats}
          />
        ) : null;

        const breakdown = result ? (
          <BreakdownPanel
            groups={groups}
            dayGroups={dayGroups}
            jobLookup={jobLookup}
            routeByVehicle={routeByVehicle}
            engineerFilter={engineerFilter}
            setEngineerFilter={setEngineerFilter}
            dayFilter={dayFilter}
            onPickDay={pickDay}
            expandedEngineer={expandedEngineer}
            setExpandedEngineer={setExpandedEngineer}
            dayVehicleId={dayVehicleId}
            setDayVehicleId={setDayVehicleId}
            selectedItem={selectedItem}
            setSelectedItem={setSelectedItem}
          />
        ) : null;

        if (compact && result) {
          const peekSummary = `#${result.test_number} · ${ribbonStats.jobs} jobs · ${formatDuration(
            ribbonStats.travelS + ribbonStats.serviceS,
          )}`;
          return (
            <div className={`map-sheet${sheetExpanded ? ' is-expanded' : ''}`}>
              <button
                type="button"
                className="map-sheet-handle"
                aria-expanded={sheetExpanded}
                aria-label={sheetExpanded ? 'Collapse dispatch details' : 'Expand dispatch details'}
                onClick={() => setSheetExpanded((v) => !v)}
              >
                <span className="map-sheet-grip" aria-hidden="true" />
                <span className="map-sheet-peek">{peekSummary}</span>
                <span className="map-sheet-caret" aria-hidden="true">
                  {sheetExpanded ? '▾' : '▴'}
                </span>
              </button>
              <div className="map-sheet-body">
                {historyPicker}
                {ribbon}
                {breakdown}
              </div>
            </div>
          );
        }

        return (
          <>
            {historyPicker}
            {ribbon}
            {breakdown}
          </>
        );
      })()}

      {/* Floating close — leaves the dispatch and returns to the empty map */}
      {result && (
        <button type="button" className="map-close-fab" onClick={exitView} aria-label="Exit dispatch view" title="Exit dispatch view">
          ✕
        </button>
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

      {/* New dispatch FAB — icon-only on narrow screens */}
      {canRun && (
        <button
          type="button"
          className="map-fab"
          onClick={() => setModalOpen(true)}
          disabled={running}
          aria-label="New dispatch run"
        >
          {narrow ? (
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          ) : (
            '+ New dispatch run'
          )}
        </button>
      )}

      {/* Route assistant toggle (only meaningful with a solved run) */}
      {result && (
        <button
          type="button"
          className={`map-chat-fab${chatOpen ? ' is-open' : ''}`}
          onClick={() => setChatOpen((o) => !o)}
          aria-expanded={chatOpen}
          aria-label={chatOpen ? 'Close route assistant' : 'Ask the route assistant'}
        >
          {narrow ? (
            chatOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 5h16v11H9l-5 4V5z"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinejoin="round"
                />
              </svg>
            )
          ) : chatOpen ? (
            'Close assistant'
          ) : (
            'Ask the route assistant'
          )}
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
