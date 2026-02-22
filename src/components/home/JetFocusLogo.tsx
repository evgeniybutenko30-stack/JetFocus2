import { useEffect, useState } from 'react';

export function JetFocusLogo() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div
      className="flex flex-col items-center gap-1 transition-all duration-700"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'scale(1)' : 'scale(0.95)',
      }}
    >
      {/* Icon mark */}
      <div className="relative">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, hsl(162 85% 49%) 0%, hsl(162 85% 35%) 100%)',
            boxShadow: '0 0 20px hsl(162 85% 49% / 0.4), 0 4px 12px hsl(0 0% 0% / 0.4)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 2L4 7.5V20h14V7.5L11 2Z" fill="white" fillOpacity="0.15" />
            <path d="M11 2L4 7.5V20h14V7.5L11 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 13.5L10.5 16L14 11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {/* Glow ring */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            boxShadow: '0 0 30px hsl(162 85% 49% / 0.25)',
            border: '1px solid hsl(162 85% 49% / 0.2)',
          }}
        />
      </div>

      {/* Wordmark */}
      <div className="flex items-baseline gap-0.5">
        <span
          className="text-xl font-bold tracking-[-0.03em]"
          style={{ color: 'hsl(var(--foreground))' }}
        >
          Jet
        </span>
        <span
          className="text-xl font-bold tracking-[-0.03em]"
          style={{ color: 'hsl(var(--primary))' }}
        >
          Focus
        </span>
      </div>
    </div>
  );
}
