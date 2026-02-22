import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetrics } from '@/hooks/use-metrics';
import { CheckCircle2, Moon, Sparkles } from 'lucide-react';

export function DaySummaryCard() {
  const navigate = useNavigate();
  const { data: m } = useMetrics();
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);

  const score = m?.dayProgressScore ?? 0;
  const isDone = score >= 80;

  async function handleClose() {
    setClosing(true);
    setTimeout(() => setClosed(true), 800);
  }

  if (closed) return null;

  return (
    <div
      className="rounded-3xl p-5 relative overflow-hidden transition-all duration-700"
      style={{
        background: isDone
          ? 'linear-gradient(135deg, hsl(162 85% 12%) 0%, hsl(162 85% 8%) 100%)'
          : 'hsl(var(--card))',
        border: isDone
          ? '1px solid hsl(var(--primary) / 0.3)'
          : '1px solid hsl(var(--border) / 0.6)',
        boxShadow: isDone
          ? '0 8px 32px hsl(var(--primary) / 0.15), inset 0 1px 0 hsl(var(--primary) / 0.1)'
          : '0 8px 32px hsl(0 0% 0% / 0.3)',
        opacity: closing ? 0 : 1,
        transform: closing ? 'scale(0.95)' : 'scale(1)',
      }}
    >
      {/* Background glow for completed */}
      {isDone && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, hsl(var(--primary) / 0.1) 0%, transparent 70%)',
          }}
        />
      )}

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {isDone ? (
            <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--primary) / 0.2)' }}>
              <CheckCircle2 size={16} style={{ color: 'hsl(var(--primary))' }} />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'hsl(38 92% 50% / 0.15)' }}>
              <Moon size={16} style={{ color: 'hsl(38 92% 50%)' }} />
            </div>
          )}
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: isDone ? 'hsl(var(--primary))' : 'hsl(38 92% 50%)' }}>
            Итоги дня
          </p>
        </div>
        <div className="text-2xl font-black" style={{ color: isDone ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}>
          {score}
        </div>
      </div>

      {isDone ? (
        <>
          <p className="text-sm font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
            Мощный день! 🏆
          </p>
          <div className="flex gap-4 mb-4">
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: 'hsl(var(--primary))' }}>✓ {m?.tasksDoneCount ?? 0}</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>задач</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: 'hsl(var(--primary))' }}>✓ {m?.habitsDoneCount ?? 0}</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>привычек</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: 'hsl(var(--primary))' }}>{m?.focusMinutesToday ?? 0}м</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>фокус</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(162 85% 38%) 100%)',
              color: 'hsl(var(--primary-foreground))',
              boxShadow: '0 4px 16px hsl(var(--primary) / 0.4)',
            }}
          >
            <Sparkles size={16} />
            Завершить день
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--foreground))' }}>
            Сегодня ты движешься.
          </p>
          <p className="text-xs mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Продолжай. Ещё {100 - score} баллов до отличного дня.
          </p>
          <button
            onClick={() => navigate('/topfocus?tab=results')}
            className="w-full py-2.5 rounded-2xl text-sm font-medium transition-all active:scale-95"
            style={{
              background: 'hsl(var(--accent))',
              color: 'hsl(var(--foreground))',
            }}
          >
            Посмотреть аналитику
          </button>
        </>
      )}
    </div>
  );
}
