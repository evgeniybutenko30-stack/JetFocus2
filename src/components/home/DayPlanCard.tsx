import { useNavigate } from 'react-router-dom';
import { CheckSquare, Circle, ChevronRight, Flame } from 'lucide-react';
import { useMetrics } from '@/hooks/use-metrics';

const QUOTES = [
  'Фокус определяет результат.',
  'Каждый день — новая точка старта.',
  'Малые шаги. Большие победы.',
  'Дисциплина сильнее мотивации.',
  'Один процент лучше каждый день.',
];

export function DayPlanCard() {
  const navigate = useNavigate();
  const { data: m } = useMetrics();
  const today = new Date();
  const dayIdx = today.getDay();
  const quote = QUOTES[dayIdx % QUOTES.length];

  const totalHabits = m?.totalHabitsToday ?? 0;
  const doneHabits = m?.habitsDoneCount ?? 0;
  const totalTasks = m?.totalTasksToday ?? 0;
  const doneTasks = m?.tasksDoneCount ?? 0;

  const total = totalHabits + totalTasks;
  const done = doneHabits + doneTasks;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="rounded-3xl p-5 relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border) / 0.6)',
        boxShadow: '0 8px 32px hsl(0 0% 0% / 0.3), inset 0 1px 0 hsl(var(--foreground) / 0.05)',
      }}
      onClick={() => navigate('/topfocus?tab=plan')}
    >
      {/* Subtle glow */}
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, hsl(var(--primary) / 0.08) 0%, transparent 70%)',
          transform: 'translate(30%, -30%)',
        }}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'hsl(var(--primary))' }}>
            План на день
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{quote}</p>
        </div>
        <ChevronRight size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--primary) / 0.15)' }}>
            <CheckSquare size={14} style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Задачи</p>
            <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              {doneTasks}/{totalTasks}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'hsl(38 92% 50% / 0.15)' }}>
            <Circle size={14} style={{ color: 'hsl(38 92% 50%)' }} />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Привычки</p>
            <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              {doneHabits}/{totalHabits}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'hsl(0 72% 51% / 0.15)' }}>
            <Flame size={14} style={{ color: 'hsl(0 72% 51%)' }} />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Фокус</p>
            <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              {m?.focusMinutesToday ?? 0}м
            </p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Прогресс</span>
          <span className="text-xs font-bold" style={{ color: 'hsl(var(--primary))' }}>{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--accent))' }}>
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(162 85% 65%) 100%)',
              boxShadow: '0 0 8px hsl(var(--primary) / 0.5)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
