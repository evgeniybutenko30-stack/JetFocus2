import { useMemo } from 'react';
import { SPHERES } from '@/lib/constants';

interface Props {
  values: Record<string, number>; // sphere id -> 0-10
  size?: number;
}

const WHEEL_SPHERES = SPHERES.slice(0, 8);

export function LifeBalanceWheel({ values, size = 260 }: Props) {
  const center = size / 2;
  const maxR = size / 2 - 30;
  const spheres = WHEEL_SPHERES;

  const points = useMemo(() => {
    const c = size / 2;
    const r0 = size / 2 - 30;
    return WHEEL_SPHERES.map((s, i) => {
      const angle = (2 * Math.PI * i) / WHEEL_SPHERES.length - Math.PI / 2;
      const raw = Number(values[s.id] ?? 0);
      const val = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 10) : 0;
      const r = (val / 10) * r0;
      return {
        x: c + r * Math.cos(angle),
        y: c + r * Math.sin(angle),
        labelX: c + (r0 + 18) * Math.cos(angle),
        labelY: c + (r0 + 18) * Math.sin(angle),
        sphere: s,
        val,
      };
    });
  }, [values, size]);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <div className="flex justify-center">
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="h-auto" style={{ maxWidth: size }}>
        {/* Grid circles */}
        {gridLines.map(g => (
          <circle key={g} cx={center} cy={center} r={maxR * g} fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} opacity={0.5} />
        ))}
        {/* Grid lines */}
        {spheres.map((_, i) => {
          const angle = (2 * Math.PI * i) / spheres.length - Math.PI / 2;
          return (
            <line key={i} x1={center} y1={center}
              x2={center + maxR * Math.cos(angle)} y2={center + maxR * Math.sin(angle)}
              stroke="hsl(var(--border))" strokeWidth={0.5} opacity={0.5} />
          );
        })}
        {/* Filled area */}
        <path d={pathD} fill="hsl(var(--primary))" fillOpacity={0.15} stroke="hsl(var(--primary))" strokeWidth={2} />
        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill="hsl(var(--primary))" />
        ))}
        {/* Labels */}
        {points.map((p, i) => (
          <text key={i} x={p.labelX} y={p.labelY} textAnchor="middle" dominantBaseline="middle"
            className="fill-muted-foreground" fontSize={10}>
            {p.sphere.icon}
          </text>
        ))}
      </svg>
    </div>
  );
}
