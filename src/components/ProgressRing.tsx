interface ProgressRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  onClick?: () => void;
}

export function ProgressRing({ score, size = 56, strokeWidth = 4, onClick }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Never render NaN / overflowing arcs from bad input.
  const safeScore = Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0;
  const offset = circumference - (safeScore / 100) * circumference;

  return (
    <button onClick={onClick} className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="hsl(var(--accent))" strokeWidth={strokeWidth} />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-sm font-bold text-primary">{safeScore}</span>
    </button>
  );
}
