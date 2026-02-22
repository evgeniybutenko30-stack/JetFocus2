import { useNavigate } from 'react-router-dom';
import { SPHERES } from '@/lib/constants';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { LifeBalanceWheel } from '@/components/LifeBalanceWheel';
import { ArrowLeft } from 'lucide-react';

export default function SectionsPage() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();

  const goals = useLiveQuery(() => db.goals.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const habits = useLiveQuery(() => db.habits.where('userId').equals(user?.id ?? '').filter(h => !h.isArchived).toArray(), [user?.id]) ?? [];
  const tasks = useLiveQuery(() => db.tasks.where('userId').equals(user?.id ?? '').filter(t => t.status !== 'CANCELLED').toArray(), [user?.id]) ?? [];

  const sphereScores: Record<string, number> = {};
  SPHERES.forEach(s => {
    const sGoals = goals.filter(g => g.sphere === s.id);
    const sHabits = habits.filter(h => h.sphere === s.id);
    const sTasks = tasks.filter(t => t.sphere === s.id);
    const total = sGoals.length + sHabits.length + sTasks.length;
    if (total === 0) { sphereScores[s.id] = 0; return; }
    const goalScore = sGoals.length > 0 ? sGoals.reduce((s, g) => s + g.progress, 0) / sGoals.length : 0;
    const doneRatio = sTasks.length > 0 ? sTasks.filter(t => t.status === 'DONE').length / sTasks.length * 100 : 0;
    sphereScores[s.id] = Math.min(10, Math.round(((goalScore + doneRatio) / 2) / 10));
  });

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="section-header">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">Сферы жизни</h1>
      </div>
      <div className="px-4 py-4 max-w-lg mx-auto w-full space-y-4 fade-in">
        <div className="glass-card p-4">
          <LifeBalanceWheel values={sphereScores} size={240} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {SPHERES.slice(0, 8).map(s => {
            const score = sphereScores[s.id] ?? 0;
            const sGoals = goals.filter(g => g.sphere === s.id && !g.isAchieved).length;
            const sHabits = habits.filter(h => h.sphere === s.id).length;
            return (
              <div key={s.id} className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all" onClick={() => navigate('/goals')}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{s.icon}</span>
                  <span className="text-sm font-medium">{s.name}</span>
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
