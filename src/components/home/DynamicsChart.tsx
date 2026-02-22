import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { getTodayStr } from '@/lib/constants';

type Period = '7' | '30' | '90';

function getDaysBefore(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

export function DynamicsChart() {
  const user = useAuthStore(s => s.user);
  const [period, setPeriod] = useState<Period>('7');
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 100); }, []);

  const days = useMemo(() => getDaysBefore(parseInt(period)), [period]);

  const logs = useLiveQuery(
    () => user ? db.habitLogs.where('userId').equals(user.id).toArray() : [],
    [user?.id], []
  );
  const tasks = useLiveQuery(
    () => user ? db.tasks.where('userId').equals(user.id).toArray() : [],
    [user?.id], []
  );
  const sessions = useLiveQuery(
    () => user ? db.focusSessions.where('userId').equals(user.id).toArray() : [],
    [user?.id], []
  );

  const data = useMemo(() => {
    return days.map(date => {
      const dayLogs = (logs ?? []).filter(l => l.date === date && l.status === 'DONE');
      const dayTasks = (tasks ?? []).filter(t => {
        if (t.status !== 'DONE') return false;
        if (t.dueDate === date) return true;
        return false;
      });
      const daySess = (sessions ?? []).filter(s => s.date === date);
      const focusMins = Math.floor(daySess.reduce((s, ses) => s + ses.durationSeconds, 0) / 60);
      const score = Math.min(dayLogs.length * 10 + dayTasks.length * 15 + Math.min(focusMins, 60), 100);
      return { date, score, dayLogs: dayLogs.length, dayTasks: dayTasks.length, focusMins };
    });
  }, [days, logs, tasks, sessions]);

  // SVG path
  const chartW = 280;
  const chartH = 80;
  const maxScore = 100;
  const n = data.length;

  const pathD = useMemo(() => {
    if (n === 0) return '';
    const pts = data.map((d, i) => {
      const x = (i / (n - 1)) * chartW;
      const y = chartH - (d.score / maxScore) * chartH;
      return { x, y };
    });
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cp1x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) / 3;
      const cp1y = pts[i - 1].y;
      const cp2x = pts[i].x - (pts[i].x - pts[i - 1].x) / 3;
      const cp2y = pts[i].y;
      d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${pts[i].x} ${pts[i].y}`;
    }
    return d;
  }, [data, n]);

  const areaD = pathD
    ? `${pathD} L ${chartW} ${chartH} L 0 ${chartH} Z`
    : '';

  const avgScore = data.length ? Math.round(data.reduce((s, d) => s + d.score, 0) / data.length) : 0;

  return (
    <div className="space-y-3">
      {/* Period selector */}
      <div className="flex gap-1">
        {(['7', '30', '90'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={{
              background: period === p ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--accent))',
              color: period === p ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
              border: `1px solid ${period === p ? 'hsl(var(--primary) / 0.3)' : 'transparent'}`,
            }}
          >
            {p}д
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Ср. индекс:</span>
          <span
            className="text-sm font-black"
            style={{ color: 'hsl(var(--primary))' }}
          >
            {avgScore}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div
        className="rounded-2xl overflow-hidden p-4 transition-opacity duration-500"
        style={{
          background: 'hsl(var(--accent) / 0.5)',
          opacity: visible ? 1 : 0,
        }}
      >
        <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" style={{ height: 80 }}>
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
              <stop offset="100%" stopColor="hsl(162 85% 65%)" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {areaD && <path d={areaD} fill="url(#areaGrad)" />}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="url(#lineGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {/* Dots for 7d */}
          {period === '7' && data.map((d, i) => {
            const x = (i / (n - 1)) * chartW;
            const y = chartH - (d.score / maxScore) * chartH;
            return (
              <circle key={i} cx={x} cy={y} r={3}
                fill="hsl(var(--primary))"
                style={{ filter: 'drop-shadow(0 0 3px hsl(var(--primary)))' }}
              />
            );
          })}
        </svg>

        {/* Day labels for 7d */}
        {period === '7' && (
          <div className="flex justify-between mt-2">
            {data.map((d, i) => {
              const date = new Date(d.date);
              const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
              return (
                <span key={i} className="text-[9px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {d.date === getTodayStr() ? 'Сег' : dayNames[date.getDay()]}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
