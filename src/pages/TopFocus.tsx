import { useSearchParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProgressRing } from '@/components/ProgressRing';
import { useMetrics } from '@/hooks/use-metrics';
import { getTodayStr } from '@/lib/constants';
import { formatMoney } from '@/lib/financeUtils';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';

const PLAN_ITEMS = 3;
const PLAN_ITEM_MAX = 200;
const FOCUS_MAX = 1000;

/** Always exactly PLAN_ITEMS strings (older plans may have fewer / garbage entries). */
function normalizePlanItems(items: unknown): string[] {
  const list = Array.isArray(items) ? items.map(i => (typeof i === 'string' ? i : '')) : [];
  return [...list, ...Array<string>(PLAN_ITEMS).fill('')].slice(0, Math.max(PLAN_ITEMS, list.length));
}

export default function TopFocusPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'plan' | 'results'>(params.get('tab') === 'results' ? 'results' : 'plan');
  const navigate = useNavigate();
  const { data: m } = useMetrics();
  const userId = useAuthStore(s => s.user?.id ?? null);
  const today = getTodayStr();

  const [planItems, setPlanItems] = useState<string[]>(() => normalizePlanItems([]));
  const [focusOfDay, setFocusOfDay] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoaded(false);
    if (!userId) return;
    let cancelled = false;
    db.dailyPlans.where({ userId, date: today }).first()
      .then(p => {
        if (cancelled) return;
        // Only fill an untouched form: never overwrite what the user already typed.
        if (p) {
          setPlanItems(prev => (prev.some(Boolean) ? prev : normalizePlanItems(p.planItems)));
          setFocusOfDay(prev => prev || (p.focusOfDay ?? ''));
        }
      })
      .catch(e => {
        console.error('Daily plan load error:', e);
        if (!cancelled) toast.error('Не удалось загрузить план дня');
      })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [userId, today]);

  async function savePlan() {
    if (saving) return;
    if (!userId) {
      toast.error('Войдите, чтобы сохранить план дня');
      navigate('/auth');
      return;
    }
    setSaving(true);
    try {
      const items = planItems.map(i => i.trim().slice(0, PLAN_ITEM_MAX));
      const focus = focusOfDay.trim().slice(0, FOCUS_MAX);
      const now = Date.now();
      await db.transaction('rw', db.dailyPlans, async () => {
        const existing = await db.dailyPlans.where({ userId, date: today }).first();
        if (existing) {
          await db.dailyPlans.update(existing.id, { planItems: items, focusOfDay: focus, updatedAt: now });
        } else {
          await db.dailyPlans.add({ id: crypto.randomUUID(), userId, date: today, planItems: items, focusOfDay: focus, createdAt: now, updatedAt: now });
        }
      });
      toast.success('План дня сохранён');
    } catch (e) {
      console.error('Daily plan save error:', e);
      toast.error('Не удалось сохранить план дня');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border/30">
        <button onClick={() => navigate(-1)} className="p-1" aria-label="Назад"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold truncate">JetFocus — План дня</h1>
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
            {!userId && (
              <div className="glass-card p-3 text-sm text-muted-foreground">
                Войдите в аккаунт, чтобы сохранять план дня.{' '}
                <button onClick={() => navigate('/auth')} className="text-primary font-medium">Войти</button>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">План на день ({PLAN_ITEMS} пункта)</label>
              {planItems.map((item, i) => (
                <input key={i} value={item} maxLength={PLAN_ITEM_MAX}
                  onChange={e => { const v = e.target.value; setPlanItems(prev => prev.map((p, j) => (j === i ? v : p))); }}
                  placeholder={`Пункт ${i + 1}`}
                  className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary mb-2"
                />
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Фокус дня</label>
              <textarea value={focusOfDay} onChange={e => setFocusOfDay(e.target.value)} rows={3} maxLength={FOCUS_MAX} placeholder="На чём сосредоточиться сегодня?" className="w-full bg-secondary rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary resize-none" />
            </div>
            <button onClick={savePlan} disabled={saving || (!!userId && !loaded)}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center py-4"><ProgressRing score={m?.dayProgressScore ?? 0} size={96} strokeWidth={6} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground">Привычки</p><p className="text-lg font-bold">{m?.habitsDoneCount ?? 0}/{m?.totalHabitsToday ?? 0}</p></div>
              <div className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground">Задачи</p><p className="text-lg font-bold">{m?.tasksDoneCount ?? 0}/{m?.totalTasksToday ?? 0}</p></div>
              <div className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground">Фокус</p><p className="text-lg font-bold">{m?.focusMinutesToday ?? 0} мин</p></div>
              <div className="glass-card p-3 text-center min-w-0"><p className="text-xs text-muted-foreground">Баланс</p><p className="text-lg font-bold truncate">{formatMoney(m?.balanceTotal ?? 0)}</p></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
