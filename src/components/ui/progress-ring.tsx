const RADIUS = 15.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type ProgressRingProps = {
  /** 0..1 fraction of the ring to fill. */
  value: number;
  /** Center label, e.g. "5/8". */
  label: string;
};

export function ProgressRing({ label, value }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value));

  return (
    <div aria-label={label} className="progress-ring" data-testid="today-progress-ring" role="img">
      <svg viewBox="0 0 40 40">
        <circle className="progress-ring-track" cx="20" cy="20" fill="none" r={RADIUS} />
        <circle
          className="progress-ring-value"
          cx="20"
          cy="20"
          fill="none"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          strokeLinecap="round"
          transform="rotate(-90 20 20)"
        />
      </svg>
      <span className="progress-ring-label">{label}</span>
    </div>
  );
}
