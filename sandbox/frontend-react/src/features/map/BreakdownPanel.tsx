/**
 * The right-hand breakdown panel. Two levels with breadcrumb navigation:
 *  - Engineers: one row per engineer (grouped vehicle-days), expandable to its
 *    days; clicking a day drills into the day view.
 *  - Day: a detailed timeline of that engineer-day — shift start, every travel
 *    leg (duration, distance, avg speed, traffic) and every job stop (arrival,
 *    service, urgency, skills), shift end. Selecting a row highlights the leg or
 *    job on the map (and vice-versa, driven by the shared selectedItem).
 */

import { useEffect, useRef } from 'react';
import type { SimVehicleRoute } from '@/services/simulation';
import { skillLabel } from '@/features/engineers/skills';
import type { EngineerGroup } from './engineerGroups';
import { buildDayTimeline, fmtMins, type JobMeta, type DayItem } from './dayTimeline';

export type SelectedItem =
  | { kind: 'leg'; legId: string }
  | { kind: 'job'; jobId: number }
  | null;

interface Props {
  groups: EngineerGroup[];
  jobLookup: Map<number, JobMeta>;
  routeByVehicle: Map<number, SimVehicleRoute>;
  engineerFilter: string | 'all';
  setEngineerFilter: (k: string | 'all') => void;
  expandedEngineer: string | null;
  setExpandedEngineer: (k: string | null) => void;
  dayVehicleId: number | null;
  setDayVehicleId: (id: number | null) => void;
  selectedItem: SelectedItem;
  setSelectedItem: (s: SelectedItem) => void;
}

export function BreakdownPanel(props: Props) {
  const { groups, dayVehicleId } = props;
  if (groups.length === 0) return null;

  return (
    <aside className="map-panel map-breakdown" aria-label="Dispatch breakdown">
      {dayVehicleId == null ? <EngineerLevel {...props} /> : <DayLevel {...props} />}
    </aside>
  );
}

// ── Engineer level ────────────────────────────────────────────

function EngineerLevel({
  groups,
  engineerFilter,
  setEngineerFilter,
  expandedEngineer,
  setExpandedEngineer,
  setDayVehicleId,
}: Props) {
  return (
    <>
      <h2 className="map-breakdown-title">Engineer breakdown</h2>
      <ul className="map-breakdown-list">
        {groups.map((g) => {
          const multiDay = g.days.length > 1;
          const expanded = expandedEngineer === g.key;
          // A single-day engineer drills straight into its one day.
          const onMain = () =>
            multiDay
              ? setEngineerFilter(engineerFilter === g.key ? 'all' : g.key)
              : setDayVehicleId(g.days[0].vehicleId);
          return (
            <li key={g.key}>
              <div className={`map-breakdown-row${engineerFilter === g.key ? ' is-active' : ''}`}>
                <button type="button" className="map-breakdown-main" onClick={onMain} title="Highlight on map">
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
                    <li key={d.vehicleId}>
                      <button
                        type="button"
                        className="map-breakdown-subrow map-breakdown-subbtn"
                        onClick={() => setDayVehicleId(d.vehicleId)}
                        title="Open this day"
                      >
                        <span className="map-breakdown-subdate">{d.label}</span>
                        <span className="map-breakdown-subjobs">
                          {d.jobs} job{d.jobs === 1 ? '' : 's'} · {fmtMins(d.travelS + d.serviceS)} ›
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ── Day level ─────────────────────────────────────────────────

function DayLevel({
  groups,
  jobLookup,
  routeByVehicle,
  dayVehicleId,
  setDayVehicleId,
  selectedItem,
  setSelectedItem,
}: Props) {
  const group = groups.find((g) => g.vehicleIds.has(dayVehicleId as number));
  const day = group?.days.find((d) => d.vehicleId === dayVehicleId);
  const rd = routeByVehicle.get(dayVehicleId as number);
  const items = buildDayTimeline(rd, jobLookup);

  return (
    <>
      <nav className="map-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="map-crumb-link" onClick={() => setDayVehicleId(null)}>
          Engineers
        </button>
        <span className="map-crumb-sep">›</span>
        <span className="map-crumb-current">
          {group?.name ?? 'Engineer'} · {day?.label ?? ''}
        </span>
      </nav>

      <div className="map-day-summary">
        <span className="map-dot" style={{ background: group?.color }} aria-hidden="true" />
        <span>
          {day?.jobs ?? 0} jobs · {fmtMins((day?.travelS ?? 0) + (day?.serviceS ?? 0))} ·{' '}
          {day?.availStart}–{day?.availEnd}
        </span>
      </div>

      <ol className="map-timeline">
        {items.map((item, i) => (
          <TimelineRow
            key={i}
            item={item}
            selected={isSelected(item, selectedItem)}
            onSelect={() => setSelectedItem(toSelection(item))}
          />
        ))}
      </ol>
    </>
  );
}

function isSelected(item: DayItem, sel: SelectedItem): boolean {
  if (!sel) return false;
  if (item.kind === 'leg') return sel.kind === 'leg' && sel.legId === item.legId;
  return sel.kind === 'job' && item.jobId != null && sel.jobId === item.jobId;
}

function toSelection(item: DayItem): SelectedItem {
  if (item.kind === 'leg') return item.legId ? { kind: 'leg', legId: item.legId } : null;
  return item.jobId != null ? { kind: 'job', jobId: item.jobId } : null;
}

function TimelineRow({ item, selected, onSelect }: { item: DayItem; selected: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  if (item.kind === 'leg') {
    const slow = item.trafficMult != null && item.trafficMult > 1.25;
    return (
      <li ref={ref} className={`map-tl-item map-tl-leg${selected ? ' is-selected' : ''}`}>
        <button type="button" className="map-tl-btn" onClick={onSelect}>
          <span className="map-tl-time">{item.departTime}</span>
          <span className="map-tl-body">
            <span className="map-tl-title">
              Drive{item.to ? ` to ${item.to}` : ''}
            </span>
            <span className="map-tl-meta">
              {fmtMins(item.durationS)}
              {item.distanceM != null ? ` · ${(item.distanceM / 1000).toFixed(1)} km` : ''}
              {item.speedKmh != null ? ` · ${Math.round(item.speedKmh)} km/h` : ''}
              {item.trafficMult != null ? (
                <span className={slow ? 'map-tl-traffic-slow' : 'map-tl-traffic'}>
                  {' · '}
                  {item.trafficMult.toFixed(2)}× traffic
                </span>
              ) : null}
            </span>
          </span>
        </button>
      </li>
    );
  }

  const isService = item.action === 'service';
  const icon = item.action === 'shift_start' ? '●' : item.action === 'shift_end' ? '■' : '◆';
  return (
    <li ref={ref} className={`map-tl-item map-tl-stop map-tl-${item.action}${selected ? ' is-selected' : ''}`}>
      <button type="button" className="map-tl-btn" onClick={onSelect} disabled={!isService}>
        <span className="map-tl-time">{item.time}</span>
        <span className="map-tl-body">
          <span className="map-tl-title">
            <span className="map-tl-icon" aria-hidden="true">
              {icon}
            </span>
            {item.title}
          </span>
          {isService && (
            <span className="map-tl-meta">
              Service {fmtMins(item.serviceS)}
              {item.urgency ? ` · ${item.urgency}` : ''}
              {item.skills && item.skills.length > 0 ? ` · ${item.skills.map(skillLabel).join(', ')}` : ''}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
