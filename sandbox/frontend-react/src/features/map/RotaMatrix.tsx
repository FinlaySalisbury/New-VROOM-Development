/**
 * The rota matrix: one row per engineer, one column per weekday. Each cell is a
 * "works this day?" checkbox plus that day's shift window. Ported from the
 * legacy preflight rota table (app.js renderOptimiseMatrix) — every ticked cell
 * becomes a vehicle-day in the solve.
 */

import type { Engineer } from '@/types';
import type { EngineerRota, LocationMode } from './buildRealScenario';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  engineers: Engineer[];
  rota: Record<string, EngineerRota>;
  onChange: (engineerId: string, next: EngineerRota) => void;
}

export function RotaMatrix({ engineers, rota, onChange }: Props) {
  return (
    <div className="rota-scroll">
      <table className="rota-table">
        <thead>
          <tr>
            <th className="rota-th-name">Engineer</th>
            <th>Base</th>
            {DAYS.map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {engineers.map((eng) => {
            const r = rota[eng.id];
            if (!r) return null;
            const setDay = (di: number, patch: Partial<EngineerRota['days'][number]>) =>
              onChange(eng.id, {
                ...r,
                days: r.days.map((d, i) => (i === di ? { ...d, ...patch } : d)),
              });
            return (
              <tr key={eng.id}>
                <td className="rota-name" title={eng.name}>
                  {eng.number ? `#${eng.number} ` : ''}
                  {eng.name}
                </td>
                <td>
                  <select
                    className="form-input rota-loc"
                    value={r.locationMode}
                    onChange={(e) =>
                      onChange(eng.id, { ...r, locationMode: e.target.value as LocationMode })
                    }
                    aria-label={`${eng.name} base location`}
                  >
                    <option value="home">Home</option>
                    <option value="depot">Depot</option>
                  </select>
                </td>
                {r.days.map((d, di) => (
                  <td key={di} className="rota-cell">
                    <label className="rota-day-toggle">
                      <input
                        type="checkbox"
                        checked={d.enabled}
                        onChange={(e) => setDay(di, { enabled: e.target.checked })}
                        aria-label={`${eng.name} works ${DAYS[di]}`}
                      />
                    </label>
                    {d.enabled && (
                      <div className="rota-times">
                        <input
                          type="time"
                          className="rota-time"
                          value={d.start}
                          onChange={(e) => setDay(di, { start: e.target.value })}
                          aria-label={`${eng.name} ${DAYS[di]} start`}
                        />
                        <input
                          type="time"
                          className="rota-time"
                          value={d.end}
                          onChange={(e) => setDay(di, { end: e.target.value })}
                          aria-label={`${eng.name} ${DAYS[di]} end`}
                        />
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
