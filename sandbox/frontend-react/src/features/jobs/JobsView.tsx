import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { ErrorState } from '@/components/ErrorState';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

import { useAppStore } from '@/store/appStore';
import type { ProjectRole } from '@/store/appStore';
import type { JobList } from '@/types';
import { listJobLists, saveJobList, deleteJobList } from '@/services/jobs';
import { listSites, saveSites } from '@/services/sites';

import { parseCsvFile } from './csv';
import { buildImport, makeJobList, legacyClassify } from './importJobs';
import type { AiJobInput } from './importJobs';
import {
  classifyWithClaude,
  CLAUDE_CLASSIFIED_BY,
  type AiClassification,
} from './aiClassify';
import type { Job, Site } from '@/types';

const ROLE_LEVEL: Record<ProjectRole, number> = {
  viewer: 0,
  user: 1,
  admin: 2,
  owner: 3,
};

/** edit_jobs requires user+ (matches the legacy canPerform / Supabase RLS). */
function canEditJobs(role: ProjectRole | null): boolean {
  return role !== null && ROLE_LEVEL[role] >= 1;
}

interface ImportSummary {
  linked: number;
  unmatched: number;
  noSiteRef: number;
  dateFails: number;
  headers: string[];
}

const FolderIcon = (
  <svg
    width="36"
    height="36"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

type ClassifyMode = 'legacy' | 'ai';

/** Per-job state held during the AI review step (legacy showAiReview). */
interface ReviewRow {
  job: Job;
  classification: AiClassification;
  /** The override input text; validated as a JSON number array on accept. */
  override: string;
}

/** Pending AI review payload — jobs + per-row classifications awaiting accept. */
interface PendingReview {
  rows: ReviewRow[];
  meta: string;
  /** True when the rows came from the rule-based fallback, not Claude. */
  fallback: boolean;
}

/**
 * Jobs section — card grid of saved job batches + a CSV import modal. Ports the
 * legacy renderJobLists / importAndSaveJobList / parseCSV / legacyClassify, plus
 * the Claude AI skill-classification path (classifyWithClaude + the AI-review
 * modal with editable per-job skill overrides).
 */
export function JobsView() {
  const params = useParams();
  const storeProjectId = useAppStore((s) => s.projectId);
  const projectRole = useAppStore((s) => s.projectRole);
  const projectId = params.id ?? storeProjectId ?? null;
  const editable = canEditJobs(projectRole);

  const { toast } = useToast();
  const confirm = useConfirm();

  const [lists, setLists] = useState<JobList[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setStatus('loading');
    try {
      const data = await listJobLists(projectId);
      setLists(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Import modal state ──────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [jobsFile, setJobsFile] = useState<File | null>(null);
  const [sitesFile, setSitesFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [classifyMode, setClassifyMode] = useState<ClassifyMode>('legacy');

  // ── AI review state ─────────────────────────────────────────
  const [review, setReview] = useState<PendingReview | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  const [reviewErr, setReviewErr] = useState<string | null>(null);

  const nameId = useId();
  const notesId = useId();
  const jobsCsvId = useId();
  const sitesCsvId = useId();
  const reviewFieldId = useId();
  const jobsInputRef = useRef<HTMLInputElement>(null);
  const sitesInputRef = useRef<HTMLInputElement>(null);

  const resetImport = useCallback(() => {
    setName('');
    setNotes('');
    setJobsFile(null);
    setSitesFile(null);
    setImporting(false);
    setImportMsg(null);
    setImportErr(null);
    setClassifyMode('legacy');
    setReview(null);
    setSavingReview(false);
    setReviewErr(null);
    if (jobsInputRef.current) jobsInputRef.current.value = '';
    if (sitesInputRef.current) sitesInputRef.current.value = '';
  }, []);

  const openImport = useCallback(() => {
    resetImport();
    setImportOpen(true);
  }, [resetImport]);

  const closeImport = useCallback(() => {
    if (importing || savingReview) return;
    setImportOpen(false);
  }, [importing, savingReview]);

  /**
   * Persist a finished job list: upsert the site rows it references (merging
   * with the project's existing sites), then save the list. Shared by the
   * rule-based path and the AI-review accept handler.
   */
  const persistJobList = useCallback(
    async (jobList: JobList, sites: Site[]): Promise<void> => {
      if (!projectId) return;
      if (sites.length > 0) {
        const existing = await listSites(projectId);
        const byId = new Map(existing.map((s) => [s.id, s]));
        for (const s of sites) byId.set(s.id, s);
        await saveSites(projectId, Array.from(byId.values()));
      }
      await saveJobList(projectId, jobList);
    },
    [projectId],
  );

  /** Sites parsed in the current import, held for the AI-review accept step. */
  const pendingSitesRef = useRef<Site[]>([]);

  const runImport = useCallback(async () => {
    if (!projectId) return;
    setImportErr(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setImportErr('Enter a name for this job batch.');
      return;
    }
    if (!jobsFile || !sitesFile) {
      setImportErr('Upload both the jobs CSV and the sites CSV.');
      return;
    }

    setImporting(true);
    setImportMsg('Parsing CSV files…');
    try {
      const [jobsCsv, sitesCsv] = await Promise.all([
        parseCsvFile(jobsFile),
        parseCsvFile(sitesFile),
      ]);

      const result = buildImport(jobsCsv, sitesCsv);
      const summary: ImportSummary = {
        linked: result.jobs.length,
        unmatched: result.unmatchedRefs.length,
        noSiteRef: result.noSiteRef,
        dateFails: result.dateFails,
        headers: result.headers,
      };

      if (summary.linked === 0) {
        setImporting(false);
        setImportMsg(null);
        setImportErr(
          `Parsed 0 valid jobs. Headers: ${summary.headers.join(', ') || 'none'}. ` +
            `No Site Ref: ${summary.noSiteRef}, unmatched sites: ${summary.unmatched}, ` +
            `date-format fails: ${summary.dateFails}.`,
        );
        return;
      }

      // ── AI path: classify with Claude, then open the review modal. ──
      if (classifyMode === 'ai') {
        setImportMsg(`${summary.linked} jobs linked. Classifying skills with Claude…`);
        let classifications: AiClassification[];
        let meta: string;
        let fallback = false;
        try {
          const res = await classifyWithClaude(result.aiBatch);
          classifications = res.classifications;
          meta = res.usage
            ? `${res.usage.input_tokens ?? 0} in / ${res.usage.output_tokens ?? 0} out tokens`
            : 'AI classified';
        } catch (aiErr) {
          // Fall back to the rule-based classifier so import still works.
          fallback = true;
          classifications = result.aiBatch.map((b: AiJobInput) => ({
            skills: legacyClassify(b.site_description),
            manufacturer: 'Fallback',
            reasoning: 'AI unavailable — used rule-based matching',
          }));
          meta = 'Rule-based fallback';
          toast(friendlyError(aiErr, 'Claude classification failed — using rule-based.'), {
            variant: 'error',
          });
        }

        const rows: ReviewRow[] = result.jobs.map((job, i) => {
          const cl = classifications[i] ?? {
            skills: [1003],
            manufacturer: 'Unknown',
            reasoning: 'No classification returned',
          };
          return { job, classification: cl, override: JSON.stringify(cl.skills) };
        });

        pendingSitesRef.current = result.sites;
        setReviewErr(null);
        setReview({ rows, meta, fallback });
        setImporting(false);
        setImportMsg(null);
        return;
      }

      // ── Rule-based path: save directly. ──
      setImportMsg(
        `${summary.linked} jobs linked. Applying rule-based skill classification…`,
      );

      const jobList = makeJobList(trimmed, notes.trim(), result.jobs);
      await persistJobList(jobList, result.sites);

      setImporting(false);
      setImportOpen(false);
      toast(
        `Imported "${jobList.name}" — ${summary.linked} jobs` +
          (summary.unmatched > 0 ? ` (${summary.unmatched} unmatched)` : ''),
        { variant: 'success' },
      );
      await load();
    } catch (err) {
      setImporting(false);
      setImportMsg(null);
      setImportErr(friendlyError(err, 'Import failed. Check the file and try again.'));
    }
  }, [projectId, name, notes, jobsFile, sitesFile, classifyMode, toast, load, persistJobList]);

  /**
   * Apply the (possibly overridden) AI skills and save the job list with
   * classifiedBy = the Claude model id. Ports legacy aiReviewAcceptAll.
   */
  const acceptReview = useCallback(async () => {
    if (!projectId || !review) return;
    setReviewErr(null);

    // Validate every override is a JSON array of numbers before saving.
    const jobs: Job[] = [];
    for (const row of review.rows) {
      let skills: number[];
      try {
        const parsed: unknown = JSON.parse(row.override);
        if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === 'number')) {
          throw new Error('not a number array');
        }
        skills = parsed;
      } catch {
        setReviewErr(
          `Override for "${row.job.description}" must be a JSON array of skill codes, e.g. [1103, 1102].`,
        );
        return;
      }
      jobs.push({ ...row.job, skills });
    }

    setSavingReview(true);
    try {
      const jobList = makeJobList(
        name.trim() || 'AI Import',
        notes.trim(),
        jobs,
        CLAUDE_CLASSIFIED_BY,
      );
      await persistJobList(jobList, pendingSitesRef.current);

      setReview(null);
      setSavingReview(false);
      setImportOpen(false);
      toast(`Imported "${jobList.name}" — ${jobs.length} jobs`, { variant: 'success' });
      await load();
    } catch (err) {
      setSavingReview(false);
      setReviewErr(friendlyError(err, 'Could not save the classified job list.'));
    }
  }, [projectId, review, name, notes, toast, load, persistJobList]);

  /** Update one review row's override input. */
  const setOverride = useCallback((idx: number, value: string) => {
    setReview((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r, i) => (i === idx ? { ...r, override: value } : r));
      return { ...prev, rows };
    });
  }, []);

  // ── Delete ──────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (list: JobList) => {
      if (!projectId || !editable) return;
      const ok = await confirm({
        title: 'Delete job batch',
        message: `Delete "${list.name}" and its ${list.jobCount} jobs? This cannot be undone.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      setDeletingId(list.id);
      try {
        await deleteJobList(projectId, list.id);
        setLists((prev) => prev.filter((l) => l.id !== list.id));
        toast('Job batch deleted.', { variant: 'success' });
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not delete.', {
          variant: 'error',
        });
      } finally {
        setDeletingId(null);
      }
    },
    [projectId, editable, confirm, toast],
  );

  const importAction = editable ? (
    <Button variant="primary" onClick={openImport}>
      Import batch
    </Button>
  ) : undefined;

  return (
    <div className="view-container">
      <PageHeader
        title="Job batches"
        subtitle="Import and classify jobs for dispatch."
        actions={importAction}
      />

      {status === 'loading' && <LoadingSkeleton count={6} label="Loading job batches" />}

      {status === 'error' && (
        <ErrorState
          title="Could not load job batches"
          message="There was a problem reading this project's job lists."
          onRetry={() => void load()}
        />
      )}

      {status === 'ready' && lists.length === 0 && (
        <EmptyState
          icon={FolderIcon}
          title="No job batches yet"
          description={
            editable
              ? 'Import a jobs CSV and a sites CSV to create your first batch.'
              : 'No job batches have been imported for this project yet.'
          }
          action={
            editable ? (
              <Button variant="primary" onClick={openImport}>
                Import batch
              </Button>
            ) : undefined
          }
        />
      )}

      {status === 'ready' && lists.length > 0 && (
        <ul
          className="bento-grid"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {lists.map((jl) => {
            const aiClassified = !!jl.classifiedBy && jl.classifiedBy.includes('claude');
            return (
              <li key={jl.id}>
                <article className="data-card">
                  <div className="data-card-header">
                    <span className="data-card-title">{jl.name}</span>
                    {editable && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={deletingId === jl.id}
                        onClick={() => void handleDelete(jl)}
                        aria-label={`Delete job batch ${jl.name}`}
                        icon={
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        }
                      />
                    )}
                  </div>
                  <div className="data-card-meta">
                    <div>{jl.jobCount} jobs parsed</div>
                    {jl.notes && <div>{jl.notes}</div>}
                    <div>
                      <span className="data-tag">
                        {aiClassified ? 'AI classified' : 'Rule-based'}
                      </span>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={importOpen}
        title="Import job batch"
        onClose={closeImport}
        disableBackdropClose={importing}
        footer={
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginLeft: 'auto',
            }}
          >
            <Button variant="ghost" onClick={closeImport} disabled={importing}>
              Cancel
            </Button>
            <Button variant="primary" loading={importing} onClick={() => void runImport()}>
              {classifyMode === 'ai' ? 'Classify with AI' : 'Parse and import'}
            </Button>
          </div>
        }
      >
        <div className="form-group">
          <label className="form-label" htmlFor={nameId}>
            List name *
          </label>
          <input
            id={nameId}
            type="text"
            className="form-input"
            placeholder="e.g. Monday PI batch"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={importing}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor={notesId}>
            Notes (optional)
          </label>
          <input
            id={notesId}
            type="text"
            className="form-input"
            placeholder="Anything worth recording about this batch"
            autoComplete="off"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={importing}
          />
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor={jobsCsvId}>
              Jobs CSV *
            </label>
            <input
              id={jobsCsvId}
              ref={jobsInputRef}
              type="file"
              accept=".csv"
              className="form-input file-input"
              onChange={(e) => setJobsFile(e.target.files?.[0] ?? null)}
              disabled={importing}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={sitesCsvId}>
              Sites CSV *
            </label>
            <input
              id={sitesCsvId}
              ref={sitesInputRef}
              type="file"
              accept=".csv"
              className="form-input file-input"
              onChange={(e) => setSitesFile(e.target.files?.[0] ?? null)}
              disabled={importing}
            />
          </div>
        </div>

        <fieldset
          className="form-group"
          style={{ border: 'none', padding: 0, margin: 'var(--space-4) 0 0' }}
        >
          <legend className="form-label" style={{ padding: 0 }}>
            Skill classification engine
          </legend>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
              flexWrap: 'wrap',
            }}
          >
            <label
              className="data-card"
              style={{
                flex: '1 1 180px',
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'center',
                cursor: importing ? 'not-allowed' : 'pointer',
                padding: 'var(--space-4)',
              }}
            >
              <input
                type="radio"
                name="classify-mode"
                value="legacy"
                checked={classifyMode === 'legacy'}
                onChange={() => setClassifyMode('legacy')}
                disabled={importing}
              />
              <span>
                <strong style={{ display: 'block' }}>Rule-based</strong>
                <span style={{ color: 'var(--app-fg-soft)', fontSize: 'var(--fs-small)' }}>
                  Manufacturer string match
                </span>
              </span>
            </label>

            <label
              className="data-card"
              style={{
                flex: '1 1 180px',
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'center',
                cursor: importing ? 'not-allowed' : 'pointer',
                padding: 'var(--space-4)',
              }}
            >
              <input
                type="radio"
                name="classify-mode"
                value="ai"
                checked={classifyMode === 'ai'}
                onChange={() => setClassifyMode('ai')}
                disabled={importing}
              />
              <span>
                <strong style={{ display: 'block' }}>Claude AI</strong>
                <span style={{ color: 'var(--app-fg-soft)', fontSize: 'var(--fs-small)' }}>
                  Skill classification with review
                </span>
              </span>
            </label>
          </div>
          <p
            style={{
              margin: 'var(--space-2) 0 0',
              fontSize: 'var(--fs-small)',
              color: 'var(--app-fg-soft)',
            }}
          >
            {classifyMode === 'ai'
              ? 'Claude assigns skills from each site description — you review and edit before saving.'
              : 'Skills are matched from the site description by manufacturer name.'}
          </p>
        </fieldset>

        {importMsg && (
          <p
            role="status"
            aria-live="polite"
            style={{ marginTop: 'var(--space-4)', color: 'var(--app-fg-soft)' }}
          >
            {importMsg}
          </p>
        )}
        {importErr && (
          <p
            role="alert"
            style={{ marginTop: 'var(--space-4)', color: 'var(--yx-royal, #1E2ED9)' }}
          >
            {importErr}
          </p>
        )}
      </Modal>

      <Modal
        open={review !== null}
        title="Review AI classification"
        size="lg"
        onClose={() => {
          if (!savingReview) setReview(null);
        }}
        disableBackdropClose={savingReview}
        footer={
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginLeft: 'auto',
            }}
          >
            <Button
              variant="ghost"
              onClick={() => setReview(null)}
              disabled={savingReview}
            >
              Back
            </Button>
            <Button
              variant="primary"
              loading={savingReview}
              onClick={() => void acceptReview()}
            >
              Accept and save
            </Button>
          </div>
        }
      >
        {review && (
          <>
            <p
              style={{
                margin: '0 0 var(--space-4)',
                fontSize: 'var(--fs-small)',
                color: 'var(--app-fg-soft)',
              }}
            >
              {review.fallback
                ? 'Claude was unavailable — these are rule-based suggestions. '
                : 'Claude assigned the skills below. '}
              {review.rows.length} jobs · {review.meta}. Edit any skill set before saving
              (JSON array of skill codes, e.g. [1103, 1102]).
            </p>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {review.rows.map((row, i) => {
                const overrideId = `${reviewFieldId}-${i}`;
                return (
                  <li
                    key={row.job.id}
                    className="data-card"
                    style={{
                      padding: 'var(--space-4)',
                      marginBottom: 'var(--space-3)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong>{row.job.description}</strong>
                      <span className="data-tag">{row.classification.manufacturer}</span>
                    </div>
                    {row.classification.reasoning && (
                      <p
                        style={{
                          margin: 'var(--space-2) 0 0',
                          fontSize: 'var(--fs-small)',
                          color: 'var(--app-fg-soft)',
                        }}
                      >
                        {row.classification.reasoning}
                      </p>
                    )}
                    <div
                      className="form-group"
                      style={{ margin: 'var(--space-3) 0 0' }}
                    >
                      <label className="form-label" htmlFor={overrideId}>
                        Skills
                      </label>
                      <input
                        id={overrideId}
                        type="text"
                        className="form-input"
                        value={row.override}
                        placeholder="[1103, 1102]"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={savingReview}
                        onChange={(e) => setOverride(i, e.target.value)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {reviewErr && (
              <p
                role="alert"
                style={{ marginTop: 'var(--space-3)', color: 'var(--yx-royal, #1E2ED9)' }}
              >
                {reviewErr}
              </p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

export default JobsView;
