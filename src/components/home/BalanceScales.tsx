import { useMemo, useEffect, useState } from 'react';
import { SPHERES } from '@/lib/constants';

interface Props {
  values: Record<string, number>;
}

export function BalanceScales({ values }: Props) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 300); }, []);

  const { personalScore, socialScore, tiltDeg } = useMemo(() => {
    const personal = SPHERES.filter(s => s.category === 'personal');
    const social = SPHERES.filter(s => s.category === 'social');
    const avg = (arr: typeof SPHERES) => arr.reduce((s, sp) => s + (values[sp.id] ?? 0), 0) / arr.length;
    const p = avg(personal);
    const s = avg(social);
    const diff = p - s;
    const tilt = Math.min(Math.max(diff * 2.5, -18), 18);
    return {
      personalScore: Math.round(p * 10),
      socialScore: Math.round(s * 10),
      tiltDeg: tilt,
    };
  }, [values]);

  const tilt = animated ? tiltDeg : 0;

  return (
    <div className="flex flex-col items-center py-2">
      <svg width="300" height="180" viewBox="0 0 300 180" fill="none" style={{ overflow: 'visible' }}>
        <defs>
          {/* Metallic gradient for the stand */}
          <linearGradient id="standGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4a4a52" />
            <stop offset="30%" stopColor="#8a8a94" />
            <stop offset="50%" stopColor="#a0a0ac" />
            <stop offset="70%" stopColor="#8a8a94" />
            <stop offset="100%" stopColor="#4a4a52" />
          </linearGradient>
          {/* Stand base gradient */}
          <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a7a84" />
            <stop offset="100%" stopColor="#3a3a42" />
          </linearGradient>
          {/* Beam gradient */}
          <linearGradient id="beamGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a9aa4" />
            <stop offset="100%" stopColor="#5a5a64" />
          </linearGradient>
        </defs>

        {/* === STAND === */}
        {/* Base */}
        <ellipse cx="150" cy="170" rx="32" ry="8" fill="url(#baseGrad)" />
        <rect x="144" y="38" width="12" height="132" rx="3" fill="url(#standGrad)" />
        {/* Top ornament */}
        <circle cx="150" cy="36" r="6" fill="url(#baseGrad)" stroke="#6a6a74" strokeWidth="1" />
        <circle cx="150" cy="36" r="3" fill="#8a8a94" />

        {/* === BEAM (tilts) === */}
        <g
          transform={`rotate(${tilt}, 150, 42)`}
          style={{ transition: 'transform 1.2s cubic-bezier(0.34,1.56,0.64,1)' }}
        >
          {/* Beam bar */}
          <rect x="40" y="39" width="220" height="6" rx="3" fill="url(#beamGrad)" />

          {/* Left strings */}
          <line x1="58" y1="45" x2="48" y2="90" stroke="#7a7a84" strokeWidth="1.2" />
          <line x1="108" y1="45" x2="118" y2="90" stroke="#7a7a84" strokeWidth="1.2" />

          {/* Right strings */}
          <line x1="192" y1="45" x2="182" y2="90" stroke="#7a7a84" strokeWidth="1.2" />
          <line x1="242" y1="45" x2="252" y2="90" stroke="#7a7a84" strokeWidth="1.2" />

          {/* Left pan */}
          <ellipse cx="83" cy="92" rx="38" ry="10" fill="#2a2a34" stroke="#5a5a64" strokeWidth="1.5" />
          <ellipse cx="83" cy="90" rx="36" ry="8" fill="#3a3a44" />

          {/* Right pan */}
          <ellipse cx="217" cy="92" rx="38" ry="10" fill="#2a2a34" stroke="#5a5a64" strokeWidth="1.5" />
          <ellipse cx="217" cy="90" rx="36" ry="8" fill="#3a3a44" />

          {/* Left score badge */}
          <rect x="63" y="68" width="40" height="20" rx="4" fill="#dc2626" />
          <text x="83" y="82" textAnchor="middle" fontSize="12" fontWeight="800" fill="white">
            {personalScore}%
          </text>

          {/* Right score badge */}
          <rect x="197" y="68" width="40" height="20" rx="4" fill="#3b82f6" />
          <text x="217" y="82" textAnchor="middle" fontSize="12" fontWeight="800" fill="white">
            {socialScore}%
          </text>
        </g>

        {/* Labels below pans */}
        <text
          x="83"
          y="148"
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill="hsl(var(--muted-foreground))"
          style={{
            transform: `rotate(${tilt}, 150, 42)`,
            transformOrigin: '150px 42px',
            transition: 'transform 1.2s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          Личное
        </text>
        <text
          x="217"
          y="148"
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill="hsl(var(--muted-foreground))"
          style={{
            transform: `rotate(${tilt}, 150, 42)`,
            transformOrigin: '150px 42px',
            transition: 'transform 1.2s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          Социальное
        </text>
      </svg>
    </div>
  );
}
