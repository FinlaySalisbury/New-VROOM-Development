import { useId, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { createProject } from '@/services/projects';
import type { Project } from '@/types';

export interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a project is created so the picker can refresh. */
  onCreated: (project: Project) => void;
}

/**
 * Create-project modal, ported from the legacy #create-project-modal +
 * createProject() in app.js. Adds a labelled, validated form and inline error.
 */
export function CreateProjectModal({
  open,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const { toast } = useToast();
  const nameId = useId();
  const descId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setDescription('');
    setError(null);
    setSaving(false);
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Project name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const project = await createProject(trimmed, description.trim());
      toast('Project created.', { variant: 'success' });
      reset();
      onCreated(project);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create project.';
      setError(message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Create new project"
      onClose={handleClose}
      footer={
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginLeft: 'auto' }}>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-project-form"
            loading={saving}
          >
            Create project
          </Button>
        </div>
      }
    >
      <form id="create-project-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <p
            role="alert"
            style={{
              margin: '0 0 var(--space-4)',
              color: 'var(--yx-royal-blue)',
              fontSize: 'var(--fs-small)',
            }}
          >
            {error}
          </p>
        )}
        <div className="form-group">
          <label className="form-label" htmlFor={nameId}>
            Project name
          </label>
          <input
            id={nameId}
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. London Dispatch Team"
            autoComplete="off"
            autoFocus
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={descId}>
            Description (optional)
          </label>
          <input
            id={descId}
            type="text"
            className="form-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief details about this project"
            autoComplete="off"
          />
        </div>
      </form>
    </Modal>
  );
}
