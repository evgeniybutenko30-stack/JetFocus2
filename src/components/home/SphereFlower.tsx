import { useMemo, useEffect, useState } from 'react';
import { SPHERES } from '@/lib/constants';

const SPHERE_COLORS: Record<string, { normal: string; pastel: string; neon: string }> = {
  health:        { normal: '#10b981', pastel: '#6ee7b7', neon: '#00ffaa' },
  development:   { normal: '#06b6d4', pastel: '#67e8f9', neon: '#00e5ff' },
  spirituality:  { normal: '#a855f7', pastel: '#c4b5fd', neon: '#bf00ff' },
  leisure:       { normal: '#84cc16', pastel: '#bef264', neon: '#aaff00' },
  career:        { normal: '#3b82f6', pastel: '#93c5fd', neon: '#0066ff' },
  finance:       { normal: '#f59e0b', pastel: '#fcd34d', neon: '#ffaa00' },
  family:        { normal: '#8b5cf6', pastel: '#a78bfa', neon: '#7700ff' },
  relationships: { normal: '#ec4899', pastel: '#f9a8d4', neon: '#ff0088' },
};

type ColorMode = 'normal' | 'pastel' | 'neon';

const FLOWER_SPHERES = SPHERES.slice(0, 8);
const SIZE = 300;
const CENTER = SIZE / 2;
const OUTER_R = 120;
const INNER_R = 38;
/** Sphere labels sit outside the 300×300 box: pad the viewBox so they are not clipped. */
const LABEL_PAD_X = 44;
const LABEL_PAD_Y = 8;

interface Props {
  values: Record<string, number>;
  onSphereClick?: (id: string) => void;
}

export function SphereFlower({ values, onSphereClick }: Props) {
  const [colorMode, setColorMode] = useState<ColorMode>('normal');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let p = 0;
    const interval = setInterval(() => {
      p += 0.03;
      setProgress(Math.min(p, 1));
      if (p >= 1) clearInterval(interval);
    }, 16);
    return () => clearInterval(interval);
  }, []);

  const eased = 1 - Math.pow(1 - progress, 3);
  const spheres = FLOWER_SPHERES;
  const size = SIZE;
  const center = CENTER;
  const outerR = OUTER_R;
  const innerR = INNER_R;

  const totalScore = useMemo(() => {
    const sum = FLOWER_SPHERES.reduce((acc, s) => acc + (values[s.id] ?? 0), 0);
    return Math.round(sum / FLOWER_SPHERES.length * 10);
  }, [values]);

  // Build pie segments
  const segments = useMemo(() => {
    const angleStep = (2 * Math.PI) / FLOWER_SPHERES.length;
    return FLOWER_SPHERES.map((s, i) => {
      const startAngle = angleStep * i - Math.PI / 2;
      const endAngle = startAngle + angleStep;
      const val = (values[s.id] ?? 0) / 10;
      const segR = INNER_R + (OUTER_R - INNER_R) * val * eased;
      const color = SPHERE_COLORS[s.id]?.[colorMode] ?? '#6b7280';

      // Outer arc points
      const x1o = CENTER + segR * Math.cos(startAngle);
      const y1o = CENTER + segR * Math.sin(startAngle);
      const x2o = CENTER + segR * Math.cos(endAngle);
      const y2o = CENTER + segR * Math.sin(endAngle);

      // Inner arc points
      const x1i = CENTER + INNER_R * Math.cos(endAngle);
      const y1i = CENTER + INNER_R * Math.sin(endAngle);
      const x2i = CENTER + INNER_R * Math.cos(startAngle);
      const y2i = CENTER + INNER_R * Math.sin(startAngle);

      const largeArc = angleStep > Math.PI ? 1 : 0;

      const d = [
        `M ${x2i} ${y2i}`,
        `A ${INNER_R} ${INNER_R} 0 ${largeArc} 1 ${x1i} ${y1i}`,
        `L ${x2o} ${y2o}`,
        `A ${segR} ${segR} 0 ${largeArc} 0 ${x1o} ${y1o}`,
        'Z',
      ].join(' ');

      // Label position
      const midAngle = (startAngle + endAngle) / 2;
      const labelR = OUTER_R + 22;
      const labelX = CENTER + labelR * Math.cos(midAngle);
      const labelY = CENTER + labelR * Math.sin(midAngle);

      // Value bubble position
      const bubbleR = INNER_R + (segR - INNER_R) * 0.65;
      const bubbleX = CENTER + bubbleR * Math.cos(midAngle);
      const bubbleY = CENTER + bubbleR * Math.sin(midAngle);

      return {
        d, color, sphere: s, val: values[s.id] ?? 0,
        labelX, labelY, bubbleX, bubbleY, midAngle,
      };
    });
  }, [values, eased, colorMode]);

  const modes: { id: ColorMode; label: string }[] = [
    { id: 'normal', label: 'Обычная' },
    { id: 'pastel', label: 'Пастель' },
    { id: 'neon', label: 'Неон' },
  ];

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Title */}
      <p className="text-xs font-semibold text-muted-foreground tracking-wide">
        Баланс 8 сфер жизни
      </p>

      {/* Color mode tabs */}
      <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'hsl(var(--accent) / 0.5)' }}>
        {modes.map(m => (
          <button
            key={m.id}
            onClick={() => setColorMode(m.id)}
            className="px-3 py-1 rounded-md text-[10px] font-semibold transition-all"
            style={{
              background: colorMode === m.id ? 'hsl(var(--card))' : 'transparent',
              color: colorMode === m.id ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              boxShadow: colorMode === m.id ? '0 1px 4px hsl(0 0% 0% / 0.3)' : 'none',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Flower chart */}
      <svg
        width="100%"
        viewBox={`${-LABEL_PAD_X} ${-LABEL_PAD_Y} ${size + 2 * LABEL_PAD_X} ${size + 2 * LABEL_PAD_Y}`}
        className="h-auto"
        style={{ maxWidth: size + 2 * LABEL_PAD_X, overflow: 'visible' }}
      >
        <defs>
          {/* Segment separators */}
          {segments.map((_, i) => {
            const angle = (2 * Math.PI * i) / spheres.length - Math.PI / 2;
            return (
              <line
                key={`sep-${i}`}
                x1={center + innerR * Math.cos(angle)}
                y1={center + innerR * Math.sin(angle)}
                x2={center + outerR * Math.cos(angle)}
                y2={center + outerR * Math.sin(angle)}
                stroke="hsl(var(--background))"
                strokeWidth="2"
              />
            );
          })}
        </defs>

        {/* Background ring */}
        {spheres.map((_, i) => {
          const angleStep = (2 * Math.PI) / spheres.length;
          const startAngle = angleStep * i - Math.PI / 2;
          const endAngle = startAngle + angleStep;
          const x1o = center + outerR * Math.cos(startAngle);
          const y1o = center + outerR * Math.sin(startAngle);
          const x2o = center + outerR * Math.cos(endAngle);
          const y2o = center + outerR * Math.sin(endAngle);
          const x1i = center + innerR * Math.cos(endAngle);
          const y1i = center + innerR * Math.sin(endAngle);
          const x2i = center + innerR * Math.cos(startAngle);
          const y2i = center + innerR * Math.sin(startAngle);
          const d = [
            `M ${x2i} ${y2i}`,
            `A ${innerR} ${innerR} 0 0 1 ${x1i} ${y1i}`,
            `L ${x2o} ${y2o}`,
            `A ${outerR} ${outerR} 0 0 0 ${x1o} ${y1o}`,
            'Z',
          ].join(' ');
          return (
            <path key={`bg-${i}`} d={d} fill="hsl(var(--accent) / 0.4)" stroke="hsl(var(--background))" strokeWidth="2" />
          );
        })}

        {/* Colored segments */}
        {segments.map((seg, i) => (
          <path
            key={i}
            d={seg.d}
            fill={seg.color}
            fillOpacity={colorMode === 'neon' ? 0.7 : 0.55}
            stroke="hsl(var(--background))"
            strokeWidth="2"
            onClick={() => onSphereClick?.(seg.sphere.id)}
            className="cursor-pointer transition-all duration-300 hover:opacity-80"
            style={colorMode === 'neon' ? {
              filter: `drop-shadow(0 0 8px ${seg.color}60)`,
            } : {}}
          />
        ))}

        {/* Value bubbles on segments */}
        {segments.map((seg, i) => seg.val > 0 && (
          <g key={`bubble-${i}`}>
            <circle
              cx={seg.bubbleX} cy={seg.bubbleY} r={12}
              fill={seg.color}
              stroke="hsl(var(--background))"
              strokeWidth="2"
              style={colorMode === 'neon' ? { filter: `drop-shadow(0 0 6px ${seg.color})` } : {}}
            />
            <text
              x={seg.bubbleX} y={seg.bubbleY + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fontWeight="800"
              fill="white"
            >
              {seg.val}
            </text>
          </g>
        ))}

        {/* Center circle with total score */}
        <circle cx={center} cy={center} r={innerR} fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary) / 0.4)" strokeWidth="2" />
        <circle cx={center} cy={center} r={innerR - 4} fill="hsl(var(--primary) / 0.15)" />
        <text
          x={center} y={center + 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="22"
          fontWeight="900"
          fill="hsl(var(--primary))"
        >
          {totalScore}
        </text>

        {/* Labels */}
        {segments.map((seg, i) => {
          const isLeft = seg.labelX < center - 10;
          const isRight = seg.labelX > center + 10;
          const anchor = isLeft ? 'end' : isRight ? 'start' : 'middle';
          return (
            <text
              key={`label-${i}`}
              x={seg.labelX} y={seg.labelY + 1}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize="10"
              fontWeight="600"
              fill="hsl(var(--muted-foreground))"
              onClick={() => onSphereClick?.(seg.sphere.id)}
              className="cursor-pointer"
            >
              {seg.sphere.name}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
