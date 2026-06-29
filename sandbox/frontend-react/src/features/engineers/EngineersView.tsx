import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { friendlyError } from '@/lib/errors';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { useAppStore } from '@/store/appStore';
import type { ProjectRole } from '@/store/appStore';
import type { Engineer } from '@/types';
import {
  listEngineers,
  saveEngineer,
  deleteEngineer,
} from '@/services/engineers';
import { logActivity } from '@/services/activity';
import { skillLabel } from './skills';
import { EngineerFormModal } from './EngineerFormModal';

type LoadState = 'loading' | 'ready' | 'error';

const ROLE_LEVEL: Record<ProjectRole, number> = {
  viewer: 0,
  user: 1,
  admin: 2,
  owner: 3,
};

/** Mirrors legacy canPerform('edit_engineers'): admin+ only. */
function canEditEngineers(role: ProjectRole | null): boolean {
  return role != null && ROLE_LEVEL[role] >= 2;
}

const EngineerIcon = (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/**
 * Engineers section (renders inside AppLayout at /projects/:id/engineers).
 * Ports legacy renderEngineerList / showEngineerForm / saveEngineer /
 * editEngineer / deleteEngineer with accessible loading/empty/error states.
 */
export function EngineersView() {
  const { id: routeId } = useParams<{ id: string }>();
  const storeProjectId = useAppStore((s) => s.projectId);
  const projectRole = useAppStore((s) => s.projectRole);
  const projectId = routeId ?? storeProjectId ?? null;
  const editable = canEditEngineers(projectRole);

  const { toast } = useToast();
  const confirm = useConfirm();

  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Engineer | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setState('loading');
    try {
      const rows = await listEngineers(projectId);
      setEngineers(rows);
      setState('ready');
    } catch (err) {
      setErrorMsg(friendlyError(err, 'Could not load engineers. Please try again.'));
      setState('error');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (eng: Engineer) => {
    if (!editable) return;
    setEditing(eng);
    setModalOpen(true);
  };

  const handleSave = async (eng: Engineer) => {
    if (!projectId) return;
    setSaving(true);
    try {
      await saveEngineer(projectId, eng);
      setEngineers((prev) => {
        const idx = prev.findIndex((e) => e.id === eng.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = eng;
          return next;
        }
        return [...prev, eng];
      });
      void logActivity({
        projectId,
        action: editing ? 'engineer.updated' : 'engineer.created',
        category: 'data',
        details: { engineerId: eng.id, name: eng.name },
      });
      toast(
        editing ? 'Engineer profile updated.' : 'Engineer profile created.',
        { variant: 'success' },
      );
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Could not save engineer.',
        { variant: 'error' },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eng: Engineer) => {
    if (!projectId || !editable) return;
    const ok = await confirm({
      title: 'Delete engineer',
      message: `Delete ${eng.name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteEngineer(projectId, eng.id);
      setEngineers((prev) => prev.filter((e) => e.id !== eng.id));
      void logActivity({
        projectId,
        action: 'engineer.deleted',
        category: 'data',
        details: { engineerId: eng.id, name: eng.name },
      });
      toast('Engineer deleted.', { variant: 'success' });
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Could not delete engineer.',
        { variant: 'error' },
      );
    }
  };

  return (
    <div className="view-container">
      <PageHeader
        title="Engineer profiles"
        subtitle="Manage your field workforce capacity and constraints."
        actions={
          editable ? (
            <Button variant="primary" onClick={openCreate}>
              Add engineer
            </Button>
          ) : undefined
        }
      />

      {state === 'loading' && <LoadingSkeleton count={6} label="Loading engineers" />}

      {state === 'error' && (
        <ErrorState
          title="Could not load engineers"
          message={errorMsg}
          onRetry={() => void load()}
        />
      )}

      {state === 'ready' && engineers.length === 0 && (
        <EmptyState
          icon={EngineerIcon}
          title="No engineers yet"
          description={
            editable
              ? 'Add your first field engineer to start building schedules.'
              : 'No engineers have been added to this project yet.'
          }
          action={
            editable ? (
              <Button variant="primary" onClick={openCreate}>
                Add engineer
              </Button>
            ) : undefined
          }
        />
      )}

      {state === 'ready' && engineers.length > 0 && (
        <ul
          className="bento-grid"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {engineers.map((eng) => (
            <li key={eng.id}>
              <EngineerCard
                engineer={eng}
                editable={editable}
                onEdit={() => openEdit(eng)}
                onDelete={() => void handleDelete(eng)}
              />
            </li>
          ))}
        </ul>
      )}

      <EngineerFormModal
        open={modalOpen}
        engineer={editing}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setModalOpen(false);
            setEditing(null);
          }
        }}
        onSave={(eng) => void handleSave(eng)}
      />
    </div>
  );
}

interface EngineerCardProps {
  engineer: Engineer;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function EngineerCard({ engineer, editable, onEdit, onDelete }: EngineerCardProps) {
  const e = engineer;
  const title = `${e.number ? `#${e.number} – ` : ''}${e.name}`;

  return (
    <div className="data-card">
      <div className="data-card-header">
        {editable ? (
          <button
            type="button"
            className="yx-btn yx-btn-link"
            onClick={onEdit}
            style={{
              padding: 0,
              font: 'inherit',
              fontWeight: 700,
              textAlign: 'left',
            }}
          >
            <span className="data-card-title">{title}</span>
          </button>
        ) : (
          <span className="data-card-title">{title}</span>
        )}
        {editable && (
          <button
            type="button"
            className="yx-btn yx-btn-secondary yx-btn-sm"
            onClick={onDelete}
            aria-label={`Delete ${e.name}`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <div className="data-card-meta">
        <div>
          {(e.skills ?? []).length > 0 ? (
            (e.skills ?? []).map((s) => (
              <span key={s} className="data-tag">
                {skillLabel(s)}
              </span>
            ))
          ) : (
            <span className="data-tag">No skills set</span>
          )}
        </div>
        <div>
          {e.location.lat}, {e.location.lon}
        </div>
        <div>
          {e.defaultShiftStart || '08:00'} — {e.defaultShiftEnd || '18:00'}
        </div>
        {e.capacity != null && <div>Capacity: {e.capacity} tasks</div>}
        {e.breakDuration != null && (
          <div>
            Break: {e.breakDuration}m ({e.breakStart} – {e.breakEnd})
          </div>
        )}
      </div>
    </div>
  );
}

export default EngineersView;
