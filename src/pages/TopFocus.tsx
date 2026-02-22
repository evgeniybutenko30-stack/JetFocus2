import { useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ProgressRing } from '@/components/ProgressRing';
import { useMetrics } from '@/hooks/use-metrics';
import { formatCurrency, getTodayStr } from '@/lib/constants';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import type { DailyPlan } from '@/lib/types';

export default function TopFocusPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'plan' | 'results'>(params.get('tab') === 'results' ? 'results' : 'plan');
  const navigate = useNavigate();
  const { data: m } = useMetrics();
  const user = useAuthStore(s => s.user);
  const today = getTodayStr();

  const [planItems, setPlanItems] = useState(['', '', '']);
  const [focusOfDay, setFocusOfDay] = useState('');

  useEffect(() => {
    db.dailyPlans.where({ userId: user.id, date: today }).first().then(p => {
      if (p) { setPlanItems(p.planItems.length >= 3 ? p.planItems : [...p.planItems, ...Array(3 - p.planItems.length).fill('')]); setFocusOfDay(p.focusOfDay); }
    });
  }, []);

  async function savePlan() {
    const existing = await db.dailyPlans.where({ userId: user.id, date: today }).first();
    if (existing) {
      await db.dailyPlans.update(existing.id, { planItems, focusOfDay, updatedAt: Date.now() });
    } else {
      await db.dailyPlans.add({ id: crypto.randomUUID(), userId: user.id, date: today, planItems, focusOfDay, createdAt: Date.now(), updatedAt: Date.now() });
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border/30">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">JetFocus — План дня</h1>
      </div>
      <div className="px-4 py-3">
        <div className="flex bg-secondary rounded-lg p-0.5">
          <button onClick={() => setTab('plan')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'plan' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>План на день</button>
          <button onClick={() => setTab('results')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'results' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Итоги дня</button>
        </div>
      </div>
      <div className="flex-1 px-4 py-2 max-w-lg mx-auto w-full">
        {tab === 'plan' ? (
          <div className="space-y-5">
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">План на день (3 пункта)</label>
              {planItems.map((item, i) => (
                <input key={i} value={item} onChange={e => { const n = [...planItems]; n[i] = e.target.value; setPlanItems(n); }}
                  placeholder={`Пункт ${i + 1}`}
                  className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary mb-2"
                />
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Фокус дня</label>
              <textarea value={focusOfDay} onChange={e => setFocusOfDay(e.target.value)} rows={3} placeholder="На чём сосредоточиться сегодня?" className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary resize-none" />
            </div>
            <button onClick={savePlan} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium">Сохранить</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center py-4"><ProgressRing score={m?.dayProgressScore ?? 0} size={96} strokeWidth={6} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground">Привычки</p><p className="text-lg font-bold">{m?.habitsDoneCount ?? 0}/{m?.totalHabitsToday ?? 0}</p></div>
              <div className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground">Задачи</p><p className="text-lg font-bold">{m?.tasksDoneCount ?? 0}/{m?.totalTasksToday ?? 0}</p></div>
              <div className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground">Фокус</p><p className="text-lg font-bold">{m?.focusMinutesToday ?? 0} мин</p></div>
              <div className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground">Баланс</p><p className="text-lg font-bold">{formatCurrency(m?.balanceTotal ?? 0)}</p></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
