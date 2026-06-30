/**
 * The rota matrix: one row per engineer, one column per date in the chosen
 * range. Each cell is a "works this day?" checkbox plus that day's shift window.
 * Ported from the legacy preflight rota table (app.js renderOptimiseMatrix) and
 * generalised to an arbitrary date range — every ticked cell becomes a
 * vehicle-day in the solve.
 */

import type { Engineer } from '@/types';
import { isoDate, type EngineerRota, type LocationMode } from './buildRealScenario';

interface Props {
  engineers: Engineer[];
  /** Ordered dates (UTC midnight) that form the matrix columns. */
  dates: Date[];
  rota: Record<string, EngineerRota>;
  onChange: (engineerId: string, next: EngineerRota) => void;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function colLabel(d: Date): { dow: string; day: string } {
  return { dow: WEEKDAY[d.getUTCDay()], day: `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}` };
}

export function RotaMatrix({ engineers, dates, rota, onChange }: Props) {
  return (
    <div className="rota-scroll">
      <table className="rota-table">
        <thead>
          <tr>
            <th className="rota-th-name">Engineer</th>
            <th>Base</th>
            {dates.map((d) => {
              const { dow, day } = colLabel(d);
              const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
              return (
                <th key={isoDate(d)} className={weekend ? 'rota-col-weekend' : undefined}>
                  <span className="rota-col-dow">{dow}</span>
                  <span className="rota-col-day">{day}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {engineers.map((eng) => {
            const r = rota[eng.id];
            if (!r) return null;
            const setDay = (iso: string, patch: Partial<{ enabled: boolean; start: string; end: string }>) =>
              onChange(eng.id, { ...r, days: { ...r.days, [iso]: { ...r.days[iso], ...patch } } });
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
                {dates.map((date) => {
                  const iso = isoDate(date);
                  const day = r.days[iso] ?? { enabled: false, start: '08:00', end: '18:00' };
                  return (
                    <td key={iso} className="rota-cell">
                      <label className="rota-day-toggle">
                        <input
                          type="checkbox"
                          checked={day.enabled}
                          onChange={(e) => setDay(iso, { enabled: e.target.checked })}
                          aria-label={`${eng.name} works ${iso}`}
                        />
                      </label>
                      {day.enabled && (
                        <div className="rota-times">
                          <input
                            type="time"
                            className="rota-time"
                            value={day.start}
                            onChange={(e) => setDay(iso, { start: e.target.value })}
                            aria-label={`${eng.name} ${iso} start`}
                          />
                          <input
                            type="time"
                            className="rota-time"
                            value={day.end}
                            onChange={(e) => setDay(iso, { end: e.target.value })}
                            aria-label={`${eng.name} ${iso} end`}
                          />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
