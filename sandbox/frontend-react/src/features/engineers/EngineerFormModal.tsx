import { useEffect, useId, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import type { Engineer } from '@/types';
import { SKILL_CATEGORIES, skillLabel, isKnownSkill } from './skills';

interface EngineerFormModalProps {
  open: boolean;
  /** The engineer being edited, or null to create a new one. */
  engineer: Engineer | null;
  saving: boolean;
  onClose: () => void;
  onSave: (engineer: Engineer) => void;
}

interface FormState {
  name: string;
  number: string;
  skills: number[];
  lat: string;
  lon: string;
  shiftStart: string;
  shiftEnd: string;
  capacity: string;
  breakDuration: string;
  breakStart: string;
  breakEnd: string;
}

function toFormState(eng: Engineer | null): FormState {
  return {
    name: eng?.name ?? '',
    number: eng?.number != null ? String(eng.number) : '',
    skills: eng?.skills ?? [],
    lat: eng != null ? String(eng.location.lat) : '51.5074',
    lon: eng != null ? String(eng.location.lon) : '-0.1278',
    shiftStart: eng?.defaultShiftStart ?? '08:00',
    shiftEnd: eng?.defaultShiftEnd ?? '18:00',
    capacity: eng?.capacity != null ? String(eng.capacity) : '',
    breakDuration: eng?.breakDuration != null ? String(eng.breakDuration) : '',
    breakStart: eng?.breakStart ?? '12:00',
    breakEnd: eng?.breakEnd ?? '14:00',
  };
}

/**
 * Create/edit form for an engineer profile. Ports legacy showEngineerForm /
 * saveEngineer, replacing the raw JSON skills input with an accessible
 * checkbox multi-select over the six skill categories. Any non-category codes
 * already on the engineer are preserved.
 */
export function EngineerFormModal({
  open,
  engineer,
  saving,
  onClose,
  onSave,
}: EngineerFormModalProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(engineer));
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  // Reset the form whenever the modal opens for a (different) engineer.
  useEffect(() => {
    if (open) {
      setForm(toFormState(engineer));
      setError(null);
    }
  }, [open, engineer]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleSkill = (code: number, checked: boolean) =>
    setForm((prev) => ({
      ...prev,
      skills: checked
        ? [...prev.skills, code]
        : prev.skills.filter((c) => c !== code),
    }));

  // Codes that aren't one of the six categories — preserved read-only.
  const extraSkills = form.skills.filter((c) => !isKnownSkill(c));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    const numberVal = form.number.trim();
    if (!numberVal) {
      setError('Engineer number is required.');
      return;
    }
    const number = parseInt(numberVal, 10);
    if (Number.isNaN(number)) {
      setError('Engineer number must be a whole number.');
      return;
    }

    const lat = parseFloat(form.lat);
    const lon = parseFloat(form.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setError('Home latitude and longitude must be valid numbers.');
      return;
    }

    const capacity = form.capacity.trim()
      ? parseInt(form.capacity, 10)
      : null;
    const breakDuration = form.breakDuration.trim()
      ? parseInt(form.breakDuration, 10)
      : null;

    const result: Engineer = {
      id: engineer?.id ?? `eng_${Date.now()}`,
      name,
      number,
      skills: form.skills,
      location: { lat, lon },
      defaultShiftStart: form.shiftStart || '08:00',
      defaultShiftEnd: form.shiftEnd || '18:00',
      capacity,
      breakDuration,
      breakStart: form.breakStart || '12:00',
      breakEnd: form.breakEnd || '14:00',
      createdAt: engineer?.createdAt ?? new Date().toISOString(),
    };
    onSave(result);
  }

  return (
    <Modal
      open={open}
      title={engineer ? 'Edit engineer profile' : 'New engineer profile'}
      onClose={onClose}
      size="lg"
      footer={
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginLeft: 'auto' }}>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="engineer-form"
            loading={saving}
          >
            Save profile
          </Button>
        </div>
      }
    >
      <form id="engineer-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <p
            id={errorId}
            role="alert"
            style={{
              margin: '0 0 var(--space-4)',
              color: 'var(--yx-royal-blue)',
              fontWeight: 600,
            }}
          >
            {error}
          </p>
        )}

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="eng-name">
              Name *
            </label>
            <input
              id="eng-name"
              type="text"
              className="form-input"
              autoComplete="name"
              placeholder="e.g. Joe Watson"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="eng-number">
              Engineer number *
            </label>
            <input
              id="eng-number"
              type="number"
              className="form-input"
              inputMode="numeric"
              placeholder="e.g. 10"
              value={form.number}
              onChange={(e) => update('number', e.target.value)}
            />
          </div>
        </div>

        <fieldset
          className="form-group"
          style={{ border: 'none', padding: 0, margin: '0 0 var(--space-4)' }}
        >
          <legend className="form-label" style={{ padding: 0 }}>
            Skills
          </legend>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-2)',
            }}
          >
            {SKILL_CATEGORIES.map((skill) => {
              const checked = form.skills.includes(skill.code);
              return (
                <label
                  key={skill.code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    cursor: 'pointer',
                    minHeight: '44px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleSkill(skill.code, e.target.checked)}
                  />
                  <span>{skill.label}</span>
                </label>
              );
            })}
          </div>
          {extraSkills.length > 0 && (
            <p
              className="form-hint"
              style={{ marginTop: 'var(--space-2)' }}
            >
              Also carries: {extraSkills.map(skillLabel).join(', ')} (preserved
              from import).
            </p>
          )}
        </fieldset>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="eng-lat">
              Home latitude
            </label>
            <input
              id="eng-lat"
              type="number"
              step="any"
              className="form-input"
              value={form.lat}
              onChange={(e) => update('lat', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="eng-lon">
              Home longitude
            </label>
            <input
              id="eng-lon"
              type="number"
              step="any"
              className="form-input"
              value={form.lon}
              onChange={(e) => update('lon', e.target.value)}
            />
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="eng-start">
              Default shift start
            </label>
            <input
              id="eng-start"
              type="time"
              className="form-input"
              value={form.shiftStart}
              onChange={(e) => update('shiftStart', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="eng-end">
              Default shift end
            </label>
            <input
              id="eng-end"
              type="time"
              className="form-input"
              value={form.shiftEnd}
              onChange={(e) => update('shiftEnd', e.target.value)}
            />
          </div>
        </div>

        <hr className="divider" />
        <h3
          style={{
            margin: '0 0 var(--space-3)',
            fontSize: 'var(--fs-small, 13px)',
            color: 'var(--app-fg-soft)',
          }}
        >
          Optional constraints
        </h3>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="eng-capacity">
              Max capacity (tasks)
            </label>
            <input
              id="eng-capacity"
              type="number"
              min={1}
              className="form-input"
              placeholder="e.g. 5"
              value={form.capacity}
              onChange={(e) => update('capacity', e.target.value)}
            />
            <div className="form-hint">Leave blank for infinite.</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="eng-break-duration">
              Break duration (mins)
            </label>
            <input
              id="eng-break-duration"
              type="number"
              min={1}
              className="form-input"
              placeholder="e.g. 45"
              value={form.breakDuration}
              onChange={(e) => update('breakDuration', e.target.value)}
            />
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="eng-break-start">
              Break window start
            </label>
            <input
              id="eng-break-start"
              type="time"
              className="form-input"
              value={form.breakStart}
              onChange={(e) => update('breakStart', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="eng-break-end">
              Break window end
            </label>
            <input
              id="eng-break-end"
              type="time"
              className="form-input"
              value={form.breakEnd}
              onChange={(e) => update('breakEnd', e.target.value)}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
