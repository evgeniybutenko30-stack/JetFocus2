import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play, Pause, RotateCcw, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { getTodayStr } from '@/lib/constants';
import { useInvalidateMetrics } from '@/hooks/use-metrics';
import { remainingSeconds } from '@/lib/dashboardStats';
import type { FocusSession } from '@/lib/types';

const POMODORO_SECONDS = 25 * 60;
const NO_SESSIONS: FocusSession[] = [];

export function PomodoroWidget() {
  const userId = useAuthStore(s => s.user?.id ?? null);
  const invalidate = useInvalidateMetrics();
  // Running = endsAt is set. The remaining time is derived from timestamps, so a throttled
  // background tab (setInterval slowed to ≥1 min) can't make the timer drift.
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState(POMODORO_SECONDS);
  const [now, setNow] = useState(() => Date.now());
  const savingRef = useRef(false);

  const today = getTodayStr();
  const sessions = useLiveQuery(
    () => (userId ? db.focusSessions.where('date').equals(today).toArray() : Promise.resolve(NO_SESSIONS)),
    [userId, today],
    NO_SESSIONS,
  );
  const todayFocusSec = sessions
    .filter(s => s.userId === userId)
    .reduce((sum, s) => sum + (Number.isFinite(s.durationSeconds) ? Math.max(0, s.durationSeconds) : 0), 0);

  const running = endsAt !== null;
  const seconds = running ? remainingSeconds(endsAt, now) : pausedLeft;

  // Tick while running; also re-sync immediately when the tab becomes visible again.
  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [endsAt]);

  // Completion: runs once per finished session.
  useEffect(() => {
    if (endsAt === null || now < endsAt || savingRef.current) return;
    const finishedAt = endsAt;
    savingRef.current = true;
    setEndsAt(null);
    setPausedLeft(POMODORO_SECONDS);
    if (!userId) {
      savingRef.current = false;
      toast.info('Помодоро завершён. Войдите, чтобы сохранять время фокуса.');
      return;
    }
    db.focusSessions.add({
      id: crypto.randomUUID(),
      userId,
      type: 'POMODORO',
      startedAt: finishedAt - POMODORO_SECONDS * 1000,
      endedAt: finishedAt,
      durationSeconds: POMODORO_SECONDS,
      targetSeconds: POMODORO_SECONDS,
      isCompleted: true,
      date: getTodayStr(),
    })
      .then(() => { invalidate(); })
      .catch(e => {
        console.error('Focus session save error:', e);
        toast.error('Не удалось сохранить сессию фокуса');
      })
      .finally(() => { savingRef.current = false; });
  }, [now, endsAt, userId, invalidate]);

  function toggle() {
    if (endsAt !== null) {
      setPausedLeft(remainingSeconds(endsAt, Date.now()));
      setEndsAt(null);
    } else {
      const start = Date.now();
      setNow(start);
      setEndsAt(start + pausedLeft * 1000);
    }
  }

  function reset() {
    setEndsAt(null);
    setPausedLeft(POMODORO_SECONDS);
  }

  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const fh = Math.floor(todayFocusSec / 3600);
  const fm = Math.floor((todayFocusSec % 3600) / 60);
  const fs = todayFocusSec % 60;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Timer size={16} className="text-primary" />
          <span className="text-xs text-muted-foreground">Помодоро</span>
        </div>
        <p className="text-2xl font-bold font-mono text-center mb-3">
          {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
        </p>
        <div className="flex justify-center gap-2">
          <button onClick={toggle} aria-label={running ? 'Пауза' : 'Старт'} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            {running ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={reset} aria-label="Сбросить" className="p-2 rounded-lg bg-accent hover:bg-accent/80 transition-colors">
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <div className="glass-card p-4 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground mb-2">Время сегодня</span>
        <p className="text-2xl font-bold font-mono">
          {String(fh).padStart(2, '0')}:{String(fm).padStart(2, '0')}:{String(fs).padStart(2, '0')}
        </p>
      </div>
    </div>
  );
}
