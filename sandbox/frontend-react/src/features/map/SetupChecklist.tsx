/**
 * Guided setup for a project that has nothing to dispatch yet.
 *
 * The map's empty state used to just say "run a dispatch" — useless on a fresh
 * project with no engineers and no jobs, where the dispatch modal would open
 * onto nothing. This walks the operator through the real order of work:
 * engineers → jobs → first dispatch, showing which steps are already done.
 */

import { useNavigate } from 'react-router-dom';

export interface SetupStep {
  key: 'engineers' | 'jobs' | 'dispatch';
  label: string;
  hint: string;
  done: boolean;
  count?: number;
}

interface Props {
  projectId: string;
  engineerCount: number;
  jobListCount: number;
  canRun: boolean;
  onRunDispatch: () => void;
}

const CheckIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function SetupChecklist({ projectId, engineerCount, jobListCount, canRun, onRunDispatch }: Props) {
  const navigate = useNavigate();

  const steps: SetupStep[] = [
    {
      key: 'engineers',
      label: 'Add your engineers',
      hint: 'Skills, shift windows and home or depot locations.',
      done: engineerCount > 0,
      count: engineerCount,
    },
    {
      key: 'jobs',
      label: 'Import a job list',
      hint: 'Upload a CSV — jobs are matched to skills and site coordinates.',
      done: jobListCount > 0,
      count: jobListCount,
    },
    {
      key: 'dispatch',
      label: 'Run your first dispatch',
      hint: 'Pick a date range and strategy, then optimise the routes.',
      done: false,
    },
  ];

  // The first incomplete step is the one we actively prompt for.
  const activeIdx = steps.findIndex((s) => !s.done);

  return (
    <div className="map-setup" role="region" aria-label="Project setup">
      <h1 className="map-setup-title">Set up this project</h1>
      <p className="map-setup-text">
        Three steps to your first optimised set of routes.
      </p>

      <ol className="map-setup-steps">
        {steps.map((step, i) => {
          const isActive = i === activeIdx;
          const go = () => {
            if (step.key === 'dispatch') onRunDispatch();
            else navigate(`/projects/${projectId}/${step.key}`);
          };
          const disabled = step.key === 'dispatch' && (!canRun || activeIdx !== 2);
          return (
            <li
              key={step.key}
              className={`map-setup-step${step.done ? ' is-done' : ''}${isActive ? ' is-active' : ''}`}
            >
              <span className="map-setup-marker" aria-hidden="true">
                {step.done ? CheckIcon : i + 1}
              </span>
              <span className="map-setup-body">
                <span className="map-setup-label">
                  {step.label}
                  {step.done && step.count != null && (
                    <span className="map-setup-count">{step.count}</span>
                  )}
                </span>
                <span className="map-setup-hint">{step.hint}</span>
              </span>
              <button
                type="button"
                className={`map-setup-cta${isActive ? ' is-primary' : ''}`}
                onClick={go}
                disabled={disabled}
              >
                {step.done ? 'Review' : step.key === 'dispatch' ? 'Run dispatch' : 'Set up'}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
