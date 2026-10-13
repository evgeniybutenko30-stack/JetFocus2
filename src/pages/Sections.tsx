import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SPHERES, getTodayStr } from '@/lib/constants';
import { LifeBalanceWheel } from '@/components/LifeBalanceWheel';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useDashboardData } from '@/hooks/use-metrics';
import { computeSectionScores, isGoalAchieved, isHabitFinished } from '@/lib/dashboardStats';

export default function SectionsPage() {
  const navigate = useNavigate();
  // Habits / tasks / goals live in Supabase (the old Dexie tables are no longer written).
  const { data, isError, refetch, isGuest } = useDashboardData(0);
  const today = getTodayStr();

  const activeHabits = useMemo(() => data.habits.filter(h => !isHabitFinished(h, today)), [data.habits, today]);
  const sphereScores = useMemo(
    () => computeSectionScores(data.goals, activeHabits, data.tasks),
    [data.goals, activeHabits, data.tasks],
  );

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="section-header">
        <button onClick={() => navigate(-1)} className="p-1" aria-label="Назад"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">Сферы жизни</h1>
      </div>
      <div className="px-4 py-4 max-w-lg mx-auto w-full space-y-4 fade-in">
        {isGuest && (
          <div className="glass-card p-3 text-sm text-muted-foreground">
            Войдите в аккаунт, чтобы видеть баланс сфер.{' '}
            <button onClick={() => navigate('/auth')} className="text-primary font-medium">Войти</button>
          </div>
        )}
        {isError && (
          <div className="glass-card p-3 flex items-center justify-between gap-2 text-sm">
            <span className="text-destructive">Не удалось загрузить данные</span>
            <button onClick={() => refetch()} className="flex items-center gap-1 text-primary text-xs font-medium"><RefreshCw size={12} /> Повторить</button>
          </div>
        )}
        <div className="glass-card p-4">
          <LifeBalanceWheel values={sphereScores} size={240} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {SPHERES.slice(0, 8).map(s => {
            const score = sphereScores[s.id] ?? 0;
            const sGoals = data.goals.filter(g => g.sphere === s.id && !isGoalAchieved(g)).length;
            const sHabits = activeHabits.filter(h => h.life_sphere === s.id).length;
            return (
              <div key={s.id} className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all" onClick={() => navigate('/goals')}>
                <div className="flex items-center gap-2 mb-2 min-w-0">
                  <span className="text-xl">{s.icon}</span>
                  <span className="text-sm font-medium truncate">{s.name}</span>
                </div>
                <div className="h-1.5 bg-accent rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${score * 10}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground">{sGoals} целей · {sHabits} привычек</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
