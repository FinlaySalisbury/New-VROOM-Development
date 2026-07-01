/**
 * The floating dispatch ribbon — a single top-centre control that merges
 * navigation and live stats, replacing the old top-left stat card and the
 * legacy raw day/engineer dropdowns.
 *
 *  - Day axis: a row of day chips (≤7 days) or a dropdown (longer ranges),
 *    each carrying its job count. Hidden for single-day dispatches.
 *  - Engineer axis: a dropdown of all engineers.
 *  - The two are mutually-exclusive entry axes (picking one resets the other),
 *    so the scope is never an opaque intersection.
 *  - Stats reflect the current scope: total jobs and total labour, split into
 *    drive vs work as a stacked bar; unassigned shows only at the top level.
 */

import type { EngineerGroup } from './engineerGroups';
import type { DayGroup } from './dayGroups';

export interface RibbonStats {
  jobs: number;
  travelS: number;
  serviceS: number;
  unassigned: number;
  scoped: boolean;
}

interface Props {
  testNumber?: number;
  strategy: string;
  staged: 'replay' | 'remix' | null;
  dayGroups: DayGroup[];
  groups: EngineerGroup[];
  dayFilter: string | 'all';
  onPickDay: (key: string | 'all') => void;
  engineerFilter: string | 'all';
  onPickEngineer: (key: string | 'all') => void;
  stats: RibbonStats;
}

function fmtHrs(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "Tue 1 Jul" -> "Tue 1" for the compact chip face. */
function chipLabel(label: string): string {
  const parts = label.split(' ');
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : label;
}

export function DispatchRibbon({
  testNumber,
  strategy,
  staged,
  dayGroups,
  groups,
  dayFilter,
  onPickDay,
  engineerFilter,
  onPickEngineer,
  stats,
}: Props) {
  const multiDay = dayGroups.length > 1;
  const useChips = multiDay && dayGroups.length <= 7;
  const labourS = stats.travelS + stats.serviceS;
  const drivePct = labourS > 0 ? Math.round((stats.travelS / labourS) * 100) : 0;

  return (
    <section className="map-ribbon" aria-label="Dispatch navigation and stats">
      <div className="map-ribbon-nav">
        <span className="map-ribbon-run">
          #{testNumber ?? '—'}
          <span className="yx-badge yx-badge-blue">{strategy.replace('_', ' ')}</span>
          {staged === 'replay' && <span className="yx-badge yx-badge-outline">Replayed</span>}
          {staged === 'remix' && <span className="yx-badge yx-badge-outline">Remix</span>}
        </span>

        {multiDay && (
          useChips ? (
            <div className="map-daychips" role="tablist" aria-label="Select a day">
              <button
                type="button"
                role="tab"
                aria-selected={dayFilter === 'all'}
                className={`map-daychip${dayFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => onPickDay('all')}
              >
                All days
              </button>
              {dayGroups.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  role="tab"
                  aria-selected={dayFilter === d.key}
                  className={`map-daychip${dayFilter === d.key ? ' is-active' : ''}`}
                  onClick={() => onPickDay(d.key)}
                  title={`${d.label} · ${d.totalJobs} jobs`}
                >
                  {chipLabel(d.label)}
                  <span className="map-daychip-count">{d.totalJobs}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="map-ribbon-field">
              <select
                aria-label="Select a day"
                className="form-input"
                value={dayFilter}
                onChange={(e) => onPickDay(e.target.value)}
              >
                <option value="all">All days ({dayGroups.length})</option>
                {dayGroups.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label} — {d.totalJobs} jobs
                  </option>
                ))}
              </select>
            </div>
          )
        )}

        {groups.length > 1 && (
          <div className="map-ribbon-field">
            <select
              aria-label="Select an engineer"
              className="form-input"
              value={engineerFilter}
              onChange={(e) => onPickEngineer(e.target.value)}
            >
              <option value="all">All engineers ({groups.length})</option>
              {groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.name} — {g.totalJobs} jobs
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="map-ribbon-stats">
        <span className="map-ribbon-stat">
          <strong>{stats.jobs}</strong> jobs
        </span>
        <span className="map-ribbon-stat">
          <strong>{fmtHrs(labourS)}</strong> labour
        </span>
        <span
          className="map-ribbon-bar"
          title={`${fmtHrs(stats.travelS)} drive · ${fmtHrs(stats.serviceS)} work`}
          aria-hidden="true"
        >
          <span className="map-ribbon-bar-drive" style={{ width: `${drivePct}%` }} />
          <span className="map-ribbon-bar-work" style={{ width: `${100 - drivePct}%` }} />
        </span>
        <span className="map-ribbon-split">
          {fmtHrs(stats.travelS)} drive · {fmtHrs(stats.serviceS)} work
        </span>
        {!stats.scoped && (
          <span className={`map-ribbon-stat${stats.unassigned ? ' is-danger' : ''}`}>
            <strong>{stats.unassigned}</strong> unassigned
          </span>
        )}
      </div>
    </section>
  );
}
