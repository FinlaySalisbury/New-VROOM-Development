/**
 * Floating playback control bar for route animation: play/pause, a scrub
 * timeline, speed selection and a live clock. Purely presentational — all
 * playback state is owned by MapView.
 */

import { formatClock } from './routeAnimation';

export const ANIM_SPEEDS = [60, 120, 300, 600] as const;

interface AnimationControlsProps {
  playing: boolean;
  currentUnix: number;
  startUnix: number;
  endUnix: number;
  speed: number;
  onTogglePlay: () => void;
  onScrub: (unix: number) => void;
  onSpeedChange: (speed: number) => void;
}

export function AnimationControls({
  playing,
  currentUnix,
  startUnix,
  endUnix,
  speed,
  onTogglePlay,
  onScrub,
  onSpeedChange,
}: AnimationControlsProps) {
  const span = endUnix - startUnix;
  const progress = span > 0 ? ((currentUnix - startUnix) / span) * 1000 : 0;

  return (
    <section className="map-panel anim-bar" aria-label="Route playback">
      <button
        type="button"
        className="anim-play"
        onClick={onTogglePlay}
        aria-label={playing ? 'Pause playback' : 'Play playback'}
        aria-pressed={playing}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <time className="anim-clock" aria-live="off">
        {formatClock(currentUnix)}
      </time>

      <input
        type="range"
        className="anim-progress"
        min={0}
        max={1000}
        step={1}
        value={Math.min(1000, Math.max(0, progress))}
        onChange={(e) => {
          const pct = Number(e.target.value) / 1000;
          onScrub(startUnix + pct * span);
        }}
        aria-label="Scrub timeline"
      />

      <div className="anim-speeds" role="group" aria-label="Playback speed">
        {ANIM_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`anim-speed${speed === s ? ' is-active' : ''}`}
            onClick={() => onSpeedChange(s)}
            aria-pressed={speed === s}
          >
            {s}×
          </button>
        ))}
      </div>
    </section>
  );
}
