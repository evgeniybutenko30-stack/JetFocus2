import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetrics, useInvalidateMetrics } from '@/hooks/use-metrics';
import { useAuthStore } from '@/stores/auth-store';
import { formatDateRu, getGreeting, INCOME_CATEGORIES, EXPENSE_CATEGORIES, SPHERES, getTodayStr } from '@/lib/constants';
import { MyDynamicsSection } from '@/components/home/MyDynamicsSection';
import { db } from '@/lib/db';
import { parseAmountToKopecks, FINANCE_AMOUNT_INPUT_MAX, FINANCE_CATEGORY_MAX, formatMoney, formatSignedMoney } from '@/lib/financeUtils';
import { toast } from 'sonner';
import type { SphereType } from '@/lib/types';
import {
  CircleDot, CheckSquare, TrendingDown, TrendingUp, Wallet,
  Calendar, BarChart3, X
} from 'lucide-react';

/* ─── Quick Add Finance Modal (inline) ─── */
function QuickFinanceModal({ type, onClose }: { type: 'INCOME' | 'EXPENSE'; onClose: () => void }) {
  const user = useAuthStore(s => s.user);
  const addXP = useAuthStore(s => s.addXP);
  const addStars = useAuthStore(s => s.addStars);
  const invalidateMetrics = useInvalidateMetrics();
  const navigate = useNavigate();
  const categories = type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [customCat, setCustomCat] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [sphere, setSphere] = useState<SphereType>('finance');
  const [saving, setSaving] = useState(false);

  const finalCategory = showCustom ? customCat.trim() : category;

  async function handleSave() {
    if (saving) return;
    // Same rule as the Finance page: a guest op would be saved with userId '' and never shown.
    if (!user) {
      toast.error('Войдите в аккаунт');
      onClose();
      navigate('/auth');
      return;
    }
    // Accepts "12,50", "1 000" (parseFloat("12,50") silently dropped the kopecks).
    const kopecks = parseAmountToKopecks(amount);
    if (!finalCategory || kopecks === null) {
      toast.error('Заполните сумму и категорию');
      return;
    }
    setSaving(true);
    try {
      await db.financeOperations.add({
        id: crypto.randomUUID(), userId: user.id, type, amount: kopecks,
        category: finalCategory, tags: [], date: getTodayStr(), sphere,
        emotionalTag: type === 'EXPENSE' ? 'neutral' : undefined,
        createdAt: Date.now(),
      });
      addXP(5);
      addStars(1);
      invalidateMetrics();
      toast.success('Добавлено');
      onClose();
    } catch (e) {
      console.error('Finance save error:', e);
      toast.error('Ошибка сохранения');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border/40 rounded-2xl w-[92%] max-w-md max-h-[85vh] overflow-auto p-5 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{type === 'INCOME' ? '💰 Доход' : '💸 Расход'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary"><X size={18} /></button>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма (₽)</label>
          <input type="text" inputMode="decimal" autoComplete="off" maxLength={FINANCE_AMOUNT_INPUT_MAX}
            value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0" className="form-input text-2xl font-bold text-center" autoFocus />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Категория</label>
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <button key={c.name} onClick={() => { setCategory(c.name); setShowCustom(false); }}
                className={`pill-btn ${category === c.name && !showCustom ? 'pill-btn-active' : 'pill-btn-inactive'}`}>
                {c.icon} {c.name}
              </button>
            ))}
            <button onClick={() => { setShowCustom(true); setCategory(''); }}
              className={`pill-btn ${showCustom ? 'pill-btn-active' : 'pill-btn-inactive'}`}>
              ✏️ Своя
            </button>
          </div>
          {showCustom && (
            <input value={customCat} onChange={e => setCustomCat(e.target.value)} maxLength={FINANCE_CATEGORY_MAX}
              placeholder="Название категории" className="form-input mt-2" autoFocus />
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Сфера</label>
          <div className="grid grid-cols-4 gap-1.5">
            {SPHERES.map(s => (
              <button key={s.id} onClick={() => setSphere(s.id)}
                className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[10px] transition-colors ${
                  sphere === s.id ? 'bg-primary/20 ring-1 ring-primary' : 'bg-secondary hover:bg-accent'
                }`}>
                <span className="text-sm">{s.icon}</span>
                <span className="truncate w-full text-center">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleSave} disabled={saving || !finalCategory || !amount}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
          {saving ? 'Сохранение…' : 'Добавить'}
        </button>
      </div>
    </div>
  );
}

export default function TodayPage() {
  const displayName = useAuthStore(s => s.displayName);
  const { data: m } = useMetrics();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [visible, setVisible] = useState(false);
  const [financeModal, setFinanceModal] = useState<'INCOME' | 'EXPENSE' | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const todayDate = new Date();
  const score = m?.dayProgressScore ?? 0;
  const totalHabits = m?.totalHabitsToday ?? 0;
  const totalTasks = m?.totalTasksToday ?? 0;
  const doneHabits = m?.habitsDoneCount ?? 0;
  const doneTasks = m?.tasksDoneCount ?? 0;
  const todoHabits = m?.habitsTodoCount ?? 0;
  const todoTasks = m?.tasksTodoCount ?? 0;

  const habitsCount = tab === 'todo' ? todoHabits : doneHabits;
  const tasksCount = tab === 'todo' ? todoTasks : doneTasks;

  return (
    <div className="flex flex-col min-h-screen pb-24 bg-background">
      <div
        className="flex-1 px-4 pt-5 pb-4 space-y-4 max-w-lg mx-auto w-full transition-all duration-500"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(12px)',
        }}
      >
        {/* === GREETING + PROGRESS RING === */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{getGreeting()},</p>
            <h1 className="text-2xl font-black text-foreground leading-tight">
              {displayName || 'Гость'}!
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDateRu(todayDate)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Progress Ring */}
            <div className="relative">
              <svg width="72" height="72" className="-rotate-90">
                {/* Track dots */}
                {Array.from({ length: 24 }).map((_, i) => {
                  const angle = (i / 24) * Math.PI * 2;
                  const cx = 36 + 28 * Math.cos(angle);
                  const cy = 36 + 28 * Math.sin(angle);
                  const filled = (i + 1) / 24 <= score / 100 + 1e-9; // no dot lit at 0
                  return (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={1.8}
                      fill={filled ? 'hsl(var(--primary))' : 'hsl(var(--accent))'}
                      className="transition-all duration-500"
                      style={filled ? { filter: 'drop-shadow(0 0 3px hsl(var(--primary) / 0.6))' } : {}}
                    />
                  );
                })}
                {/* Arc */}
                <circle
                  cx="36" cy="36" r="22"
                  fill="none"
                  stroke="hsl(var(--accent))"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle
                  cx="36" cy="36" r="22"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={`${2 * Math.PI * 22 * (1 - score / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                  style={{ filter: 'drop-shadow(0 0 6px hsl(var(--primary) / 0.5))' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-lg font-black"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  {score}
                </span>
              </div>
            </div>

            {/* Side icons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => navigate('/topfocus?tab=plan')}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-accent"
                style={{ color: 'hsl(var(--primary))' }}
              >
                <Calendar size={18} />
              </button>
              <button
                onClick={() => navigate('/statistics')}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-accent text-muted-foreground"
              >
                <BarChart3 size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* === SEGMENTED CONTROL === */}
        <div className="flex rounded-xl p-1 bg-card border border-border/40">
          {(['todo', 'done'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200"
              style={{
                background: tab === t ? 'hsl(var(--foreground))' : 'transparent',
                color: tab === t ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
              }}
            >
              {t === 'todo' ? 'Сделать' : 'Выполнено'}
            </button>
          ))}
        </div>

        {/* === HABITS & TASKS CARDS === */}
        <div className="grid grid-cols-2 gap-3">
          {/* Habits */}
          <button
            onClick={() => navigate('/habits')}
            className="rounded-xl p-4 flex items-center gap-3 active:scale-[0.97] transition-transform"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 6px 20px #10b98130',
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.2)' }}
            >
              <span className="text-base font-black text-white">{habitsCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CircleDot size={16} className="text-white/80" />
              <span className="text-sm font-bold text-white">Привычки</span>
            </div>
          </button>

          {/* Tasks */}
          <button
            onClick={() => navigate('/tasks')}
            className="rounded-xl p-4 flex items-center gap-3 active:scale-[0.97] transition-transform"
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              boxShadow: '0 6px 20px #3b82f630',
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.2)' }}
            >
              <span className="text-base font-black text-white">{tasksCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckSquare size={16} className="text-white/80" />
              <span className="text-sm font-bold text-white">Задачи</span>
            </div>
          </button>
        </div>

        {/* === FINANCE BLOCK === */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border) / 0.5)',
          }}
        >
          <div className="grid grid-cols-2">
            {/* Expense */}
            <button
              onClick={() => setFinanceModal('EXPENSE')}
              className="p-4 rounded-xl m-2 mr-1 text-left active:scale-95 transition-transform"
              style={{
                background: 'linear-gradient(135deg, hsl(258 56% 50% / 0.25) 0%, hsl(258 56% 40% / 0.15) 100%)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingDown size={14} style={{ color: '#8B5CF6' }} />
                <span className="text-xs font-medium text-muted-foreground">Расход</span>
              </div>
              <p className="text-xl font-black" style={{ color: '#8B5CF6' }}>
                {formatSignedMoney(m?.todayExpense ?? 0, '-')}
              </p>
            </button>
            {/* Income */}
            <button
              onClick={() => setFinanceModal('INCOME')}
              className="p-4 rounded-xl m-2 ml-1 text-left active:scale-95 transition-transform"
              style={{
                background: 'linear-gradient(135deg, hsl(25 95% 53% / 0.25) 0%, hsl(25 95% 40% / 0.15) 100%)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp size={14} style={{ color: '#F97316' }} />
                <span className="text-xs font-medium text-muted-foreground">Доход</span>
              </div>
              <p className="text-xl font-black" style={{ color: '#F97316' }}>
                {formatSignedMoney(m?.todayIncome ?? 0, '+')}
              </p>
            </button>
          </div>
          {/* Balance bar */}
          <div
            className="mx-2 mb-2 px-4 py-3 rounded-xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
            style={{ background: 'hsl(var(--accent) / 0.6)' }}
            onClick={() => navigate('/finance')}
          >
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Баланс</span>
            </div>
            <span
              className="text-lg font-black"
              style={{
                color: (m?.balanceTotal ?? 0) >= 0 ? 'hsl(var(--foreground))' : 'hsl(var(--destructive))',
              }}
            >
              {(m?.balanceTotal ?? 0) > 0 ? '+' : ''}{formatMoney(m?.balanceTotal ?? 0)}
            </span>
          </div>
        </div>

        {/* === MY DYNAMICS === */}
        <MyDynamicsSection />

        <div className="h-4" />
      </div>

      {/* Quick-add finance modal */}
      {financeModal && <QuickFinanceModal type={financeModal} onClose={() => setFinanceModal(null)} />}
    </div>
  );
}
