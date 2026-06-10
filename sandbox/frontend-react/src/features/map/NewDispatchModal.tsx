import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import type { RoutingStrategy, SimulationRequest } from '@/services/simulation';

interface Props {
  open: boolean;
  running: boolean;
  onClose: () => void;
  onRun: (cfg: Omit<SimulationRequest, 'project_id'>) => void | Promise<void>;
}

const STRATEGIES: { value: RoutingStrategy; label: string; note: string; paid: boolean }[] = [
  { value: 'inhouse', label: 'In-house model', note: 'London traffic model · free · instant', paid: false },
  { value: 'naive', label: 'Naive (straight-line)', note: 'Distance ÷ 30 km/h · free · instant', paid: false },
  { value: 'tomtom_premium', label: 'TomTom Premium', note: 'Real road + predictive traffic · paid', paid: true },
  { value: 'here_premium', label: 'HERE Premium', note: 'HERE matrix routing · paid', paid: true },
];

export function NewDispatchModal({ open, running, onClose, onRun }: Props) {
  const [numEngineers, setNumEngineers] = useState(5);
  const [numJobs, setNumJobs] = useState(20);
  const [strategy, setStrategy] = useState<RoutingStrategy>('inhouse');
  const [name, setName] = useState('');

  const selected = STRATEGIES.find((s) => s.value === strategy);
  const waypoints = numEngineers + numJobs;
  // Rough TomTom cost guide (matrix cells × £0.0004), matching the legacy.
  const tomtomCost = (waypoints * waypoints * 0.0004).toFixed(2);

  function submit() {
    void onRun({
      num_engineers: Math.max(1, Math.min(500, numEngineers)),
      num_jobs: Math.max(1, Math.min(5000, numJobs)),
      strategy,
      name: name.trim() || undefined,
    });
  }

  return (
    <Modal
      open={open}
      title="New dispatch run"
      onClose={onClose}
      disableBackdropClose={running}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={running}>
            Run dispatch →
          </Button>
        </>
      }
    >
      <p style={{ marginTop: 0, color: 'var(--app-fg-muted)' }}>
        Generate a randomised London scenario and solve optimised routes. Adjust the size and routing
        strategy below.
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

      {selected?.paid && (
        <p
          className="yx-badge yx-badge-warn"
          style={{ marginBottom: 'var(--space-4)' }}
          aria-live="polite"
        >
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
