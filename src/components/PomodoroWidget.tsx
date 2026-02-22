import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Timer } from 'lucide-react';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { getTodayStr } from '@/lib/constants';
import { useInvalidateMetrics } from '@/hooks/use-metrics';

export function PomodoroWidget() {
  const user = useAuthStore(s => s.user);
  const invalidate = useInvalidateMetrics();
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [todayFocusSec, setTodayFocusSec] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadTodayFocus();
  }, []);

  async function loadTodayFocus() {
    const sessions = await db.focusSessions.where('date').equals(getTodayStr()).toArray();
    const userSessions = sessions.filter(s => s.userId === user.id);
    setTodayFocusSec(userSessions.reduce((s, ses) => s + ses.durationSeconds, 0));
  }

  useEffect(() => {
    if (running && seconds > 0) {
      intervalRef.current = window.setInterval(() => setSeconds(s => s - 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (running && seconds === 0) {
        completeSession();
      }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, seconds]);

  async function completeSession() {
    setRunning(false);
    const dur = 25 * 60;
    await db.focusSessions.add({
      id: crypto.randomUUID(),
      userId: user.id,
      type: 'POMODORO',
      startedAt: Date.now() - dur * 1000,
      endedAt: Date.now(),
      durationSeconds: dur,
      targetSeconds: dur,
      isCompleted: true,
      date: getTodayStr(),
    });
    invalidate();
    loadTodayFocus();
    setSeconds(25 * 60);
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
          <button onClick={() => setRunning(!running)} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            {running ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={() => { setRunning(false); setSeconds(25 * 60); }} className="p-2 rounded-lg bg-accent hover:bg-accent/80 transition-colors">
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
