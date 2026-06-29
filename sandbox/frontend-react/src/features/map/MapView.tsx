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

const LONDON: [number, number] = [51.505, -0.09];

/** GeoJSON [lon,lat] -> Leaflet [lat,lon]. */
const toLatLng = (c: number[]): [number, number] => [c[1], c[0]];

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
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

function RouteLayers({ fc, engineerFilter }: { fc?: SimFeatureCollection; engineerFilter: number | 'all' }) {
  if (!fc?.features) return null;
  return (
    <>
      {fc.features.map((f, i) => {
        const props = f.properties ?? {};
        const engId = Number(props.engineer_id ?? 0);
        if (engineerFilter !== 'all' && engId !== engineerFilter) return null;
        const coords = f.geometry?.coordinates as number[][];
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const mult = Number(props.traffic_multiplier ?? 1);
        const { color, weight } = legStyle(engId, mult);
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

function JobLayers({ fc, engineerFilter }: { fc?: SimFeatureCollection; engineerFilter: number | 'all' }) {
  if (!fc?.features) return null;
  return (
    <>
      {fc.features.map((f, i) => {
        const props = f.properties ?? {};
        const c = f.geometry?.coordinates as number[];
        if (!Array.isArray(c) || typeof c[0] !== 'number') return null;
        const assignedTo = props.assigned_engineer_id != null ? Number(props.assigned_engineer_id) : null;
        const unassigned = (props.status ?? '') !== 'Assigned';
        if (engineerFilter !== 'all' && assignedTo !== engineerFilter && !unassigned) return null;
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

function DepotLayers({ result, engineerFilter }: { result: SimulationResult; engineerFilter: number | 'all' }) {
  return (
    <>
      {(result.routes_data ?? []).map((v) => {
        if (!v.vehicle_start) return null;
        if (engineerFilter !== 'all' && v.vehicle_id !== engineerFilter) return null;
        return (
          <CircleMarker
            key={`depot-${v.vehicle_id}`}
            center={toLatLng(v.vehicle_start)}
            radius={7}
            pathOptions={{ color: '#000', weight: 2, fillColor: routeColor(v.vehicle_id), fillOpacity: 1 }}
          >
            <Popup>
              <strong>Depot · engineer {v.vehicle_id}</strong>
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
  const { toast } = useToast();

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [engineerFilter, setEngineerFilter] = useState<number | 'all'>('all');

  const canRun = projectRole === 'owner' || projectRole === 'admin' || projectRole === 'user';

  // ── Route playback ──────────────────────────────────────────
  const animation = useMemo(() => buildAnimationModel(result), [result]);
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

  const engineers = useMemo(() => {
    return (result?.routes_data ?? []).map((v) => ({
      id: v.vehicle_id,
      name: v.vehicle_name?.split('|')[0] ?? `Engineer ${v.vehicle_id}`,
      jobs: v.num_jobs_assigned ?? 0,
    }));
  }, [result]);

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
        setEngineerFilter('all');
        setModalOpen(false);
        toast(`Dispatch #${res.test_number} solved — ${res.num_jobs} jobs.`, { variant: 'success' });
      } catch (err) {
        toast(friendlyError(err, 'The dispatch solve failed. Please try again.'), { variant: 'error' });
      } finally {
        setRunning(false);
      }
    },
    [projectId, toast],
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
            <RouteLayers fc={result.routes_geojson} engineerFilter={engineerFilter} />
            <DepotLayers result={result} engineerFilter={engineerFilter} />
            <JobLayers fc={result.faults_geojson} engineerFilter={engineerFilter} />
            <FitBounds result={result} />
          </>
        )}
        {hasAnimation && (
          <AnimationLayer trajectories={animation.trajectories} currentUnix={currentUnix} />
        )}
      </MapContainer>

      {/* Results summary */}
      {result && (
        <section className="map-panel map-summary" aria-label="Dispatch summary">
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
              onChange={(e) => setEngineerFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">All engineers ({engineers.length})</option>
              {engineers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {e.jobs} jobs
                </option>
              ))}
            </select>
          </div>
          <span className="yx-badge yx-badge-blue" style={{ alignSelf: 'flex-start' }}>
            {result.strategy.replace('_', ' ')}
          </span>
        </section>
      )}

      {/* Engineer breakdown */}
      {result && engineers.length > 0 && (
        <aside className="map-panel map-breakdown" aria-label="Engineer breakdown">
          <h2 className="map-breakdown-title">Engineer breakdown</h2>
          <ul className="map-breakdown-list">
            {engineers.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className={`map-breakdown-row${engineerFilter === e.id ? ' is-active' : ''}`}
                  onClick={() => setEngineerFilter(engineerFilter === e.id ? 'all' : e.id)}
                >
                  <span className="map-dot" style={{ background: routeColor(e.id) }} aria-hidden="true" />
                  <span className="map-breakdown-name">{e.name}</span>
                  <span className="map-breakdown-jobs">{e.jobs}</span>
                </button>
              </li>
            ))}
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

      <NewDispatchModal open={modalOpen} running={running} onClose={() => setModalOpen(false)} onRun={handleRun} />
    </div>
  );
}
