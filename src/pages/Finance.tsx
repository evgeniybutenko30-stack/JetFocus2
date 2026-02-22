import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import {
  formatCurrency, getSphereById, getSphereColor, SPHERES, ACCOUNT_TYPES,
  getTodayStr, INCOME_CATEGORIES, EXPENSE_CATEGORIES, CURRENCIES,
  GOAL_TYPES, GOAL_ICONS
} from '@/lib/constants';
import {
  Plus, TrendingUp, TrendingDown, Wallet, Target,
  Flame, BarChart3, ArrowUpDown, X, CreditCard, PiggyBank,
  Calendar as CalendarIcon, ChevronRight, Eye, EyeOff
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { toast } from 'sonner';
import type { SphereType, FinanceAccountType, FinanceGoalType } from '@/lib/types';

type TabType = 'dashboard' | 'income' | 'expenses' | 'analytics';

/* ─────────────────────────────────────────────────── */
/*  ADD OPERATION MODAL                                */
/* ─────────────────────────────────────────────────── */
function AddOperationModal({ type, onClose }: { type: 'INCOME' | 'EXPENSE'; onClose: () => void }) {
  const user = useAuthStore(s => s.user);
  const addXP = useAuthStore(s => s.addXP);
  const addStars = useAuthStore(s => s.addStars);
  const accounts = useLiveQuery(() => db.financeAccounts.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const categories = type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [customCat, setCustomCat] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [sphere, setSphere] = useState<SphereType>('finance');
  const [emotionalTag, setEmotionalTag] = useState<'useful' | 'neutral' | 'impulsive'>('neutral');
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);

  const finalCategory = showCustom ? customCat.trim() : category;

  async function handleSave() {
    if (!user) { toast.error('Войдите в аккаунт'); return; }
    const kopecks = Math.round(parseFloat(amount) * 100);
    if (!finalCategory || isNaN(kopecks) || kopecks <= 0) {
      toast.error('Заполните сумму и категорию');
      return;
    }
    setSaving(true);
    try {
      await db.financeOperations.add({
        id: crypto.randomUUID(), userId: user.id, type, amount: kopecks,
        category: finalCategory, tags: [], date: getTodayStr(), sphere,
        emotionalTag: type === 'EXPENSE' ? emotionalTag : undefined,
        accountId: accountId || undefined,
        createdAt: Date.now(),
      });
      addXP(5);
      addStars(1);
      toast.success('Добавлено');
      onClose();
    } catch (e) {
      console.error('Finance save error:', e);
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border/40 rounded-t-2xl sm:rounded-2xl w-full sm:w-[92%] max-w-md max-h-[90vh] overflow-auto p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{type === 'INCOME' ? '💰 Новый доход' : '💸 Новый расход'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} /></button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма</label>
          <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0" className="form-input text-2xl font-bold text-center" autoFocus />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Категория</label>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c: { name: string; icon: string }) => (
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
            <input value={customCat} onChange={e => setCustomCat(e.target.value)}
              placeholder="Название категории" className="form-input mt-2" autoFocus />
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Сфера жизни</label>
          <div className="grid grid-cols-4 gap-1.5">
            {SPHERES.map((s: typeof SPHERES[0]) => (
              <button key={s.id} onClick={() => setSphere(s.id)}
                className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[10px] transition-all ${
                  sphere === s.id ? 'bg-primary/15 ring-1 ring-primary/60 text-foreground' : 'bg-secondary/60 hover:bg-accent text-muted-foreground'
                }`}>
                <span className="text-sm">{s.icon}</span>
                <span className="truncate w-full text-center">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        {accounts.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Счёт</label>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map(a => (
                <button key={a.id} onClick={() => setAccountId(a.id)}
                  className={`pill-btn ${accountId === a.id ? 'pill-btn-active' : 'pill-btn-inactive'}`}>
                  {a.icon} {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {type === 'EXPENSE' && (
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Оценка</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'useful' as const, label: 'Полезно', icon: '✅', ring: 'ring-primary bg-primary/10' },
                { key: 'neutral' as const, label: 'Нейтрально', icon: '➖', ring: 'ring-border bg-secondary' },
                { key: 'impulsive' as const, label: 'Импульс', icon: '⚡', ring: 'ring-destructive bg-destructive/10' },
              ].map(e => (
                <button key={e.key} onClick={() => setEmotionalTag(e.key)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-xs transition-all ${
                    emotionalTag === e.key ? `ring-1 ${e.ring}` : 'bg-secondary/60 text-muted-foreground'
                  }`}>
                  <span>{e.icon}</span><span>{e.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleSave} disabled={saving || (!finalCategory || !amount)}
          className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-40 transition-opacity">
          {saving ? 'Сохранение…' : 'Добавить'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── */
/*  ADD ACCOUNT MODAL (Premium)                        */
/* ─────────────────────────────────────────────────── */
const ACCOUNT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'];

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore(s => s.user);
  const [name, setName] = useState('');
  const [type, setType] = useState<FinanceAccountType>('CARD');
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState('₽');
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [isDefault, setIsDefault] = useState(false);
  const [hideFromTotal, setHideFromTotal] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedType = ACCOUNT_TYPES.find(t => t.type === type)!;

  async function handleSave() {
    if (!user) { toast.error('Войдите в аккаунт'); return; }
    if (!name.trim()) { toast.error('Введите название'); return; }
    setSaving(true);
    try {
      await db.financeAccounts.add({
        id: crypto.randomUUID(), userId: user.id, name: name.trim(), type,
        balance: Math.round(parseFloat(balance || '0') * 100),
        currency, icon: selectedType.icon, color,
        isDefault, hideFromTotal,
        createdAt: Date.now(),
      });
      toast.success('Счёт добавлен');
      onClose();
    } catch (e) {
      console.error('Account save error:', e);
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border/40 rounded-t-2xl sm:rounded-2xl w-full sm:w-[92%] max-w-md max-h-[90vh] overflow-auto p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2"><CreditCard size={20} className="text-primary" /> Новый счёт</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} /></button>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Название</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Основная карта" className="form-input" autoFocus />
        </div>

        {/* Type */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Тип счёта</label>
          <div className="grid grid-cols-3 gap-1.5">
            {ACCOUNT_TYPES.map(t => (
              <button key={t.type} onClick={() => setType(t.type)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-xs transition-all ${
                  type === t.type ? 'bg-primary/15 ring-1 ring-primary/60 text-foreground font-semibold' : 'bg-secondary/60 text-muted-foreground hover:bg-accent'
                }`}>
                <span className="text-lg">{t.icon}</span>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Currency */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Валюта</label>
          <div className="flex gap-2">
            {CURRENCIES.map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                  currency === c ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:bg-accent'
                }`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Balance */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Начальный баланс ({currency})</label>
          <input type="number" inputMode="decimal" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0" className="form-input text-center text-lg font-bold" />
        </div>

        {/* Color */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Цвет</label>
          <div className="flex gap-2 flex-wrap">
            {ACCOUNT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-offset-card' : 'hover:scale-110'}`}
                style={{ backgroundColor: c, boxShadow: color === c ? `0 0 12px ${c}50` : undefined }} />
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm">Основной счёт</span>
            <button onClick={() => setIsDefault(!isDefault)}
              className={`w-11 h-6 rounded-full transition-colors relative ${isDefault ? 'bg-primary' : 'bg-secondary'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isDefault ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              {hideFromTotal ? <EyeOff size={14} className="text-muted-foreground" /> : <Eye size={14} className="text-muted-foreground" />}
              <span className="text-sm">Скрыть из общего баланса</span>
            </div>
            <button onClick={() => setHideFromTotal(!hideFromTotal)}
              className={`w-11 h-6 rounded-full transition-colors relative ${hideFromTotal ? 'bg-primary' : 'bg-secondary'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${hideFromTotal ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
        </div>

        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-40 transition-opacity">
          {saving ? 'Сохранение…' : 'Создать счёт'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── */
/*  ADD FINANCE GOAL MODAL (Premium)                   */
/* ─────────────────────────────────────────────────── */
function AddGoalModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore(s => s.user);
  const accounts = useLiveQuery(() => db.financeAccounts.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];

  const [title, setTitle] = useState('');
  const [goalType, setGoalType] = useState<FinanceGoalType>('saving');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [deadline, setDeadline] = useState('');
  const [accountId, setAccountId] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [sphere, setSphere] = useState<SphereType>('finance');
  const [saving, setSaving] = useState(false);

  // Auto-calc monthly/weekly/daily needed
  const targetNum = parseFloat(target) || 0;
  const currentNum = parseFloat(current) || 0;
  const remaining = Math.max(0, targetNum - currentNum);

  const calcPlan = useMemo(() => {
    if (!deadline || remaining <= 0) return null;
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diffMs = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const diffMonths = Math.max(1, Math.ceil(diffDays / 30));
    const diffWeeks = Math.max(1, Math.ceil(diffDays / 7));
    return {
      perMonth: Math.ceil(remaining / diffMonths),
      perWeek: Math.ceil(remaining / diffWeeks),
      perDay: Math.ceil(remaining / diffDays),
      months: diffMonths,
    };
  }, [deadline, remaining]);

  async function handleSave() {
    if (!user) { toast.error('Войдите в аккаунт'); return; }
    if (!title.trim() || !target) { toast.error('Заполните название и сумму'); return; }
    setSaving(true);
    try {
      await db.financeGoals.add({
        id: crypto.randomUUID(), userId: user.id, title: title.trim(),
        goalType,
        targetAmount: Math.round(targetNum * 100),
        currentAmount: Math.round(currentNum * 100),
        deadline: deadline || undefined,
        accountId: accountId || undefined,
        icon, sphere, createdAt: Date.now(),
      });
      toast.success('Финансовая цель создана. Начинай движение! 🚀');
      onClose();
    } catch (e) {
      console.error('Goal save error:', e);
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border/40 rounded-t-2xl sm:rounded-2xl w-full sm:w-[92%] max-w-md max-h-[90vh] overflow-auto p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2"><PiggyBank size={20} className="text-primary" /> Финансовая цель</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} /></button>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Название цели</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Новый MacBook" className="form-input" autoFocus />
        </div>

        {/* Goal Type */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Тип цели</label>
          <div className="grid grid-cols-2 gap-1.5">
            {GOAL_TYPES.map(t => (
              <button key={t.type} onClick={() => setGoalType(t.type)}
                className={`flex items-center gap-2 p-2.5 rounded-xl text-xs transition-all ${
                  goalType === t.type ? 'ring-1 font-semibold text-foreground' : 'bg-secondary/60 text-muted-foreground hover:bg-accent'
                }`}
                style={goalType === t.type ? { backgroundColor: `${t.color}15`, borderColor: t.color, boxShadow: `0 0 12px ${t.color}20` } : {}}>
                <span className="text-base">{t.icon}</span>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Target & Current */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Целевая сумма</label>
            <input type="number" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="300 000" className="form-input text-center font-bold" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Уже накоплено</label>
            <input type="number" inputMode="decimal" value={current} onChange={e => setCurrent(e.target.value)} placeholder="0" className="form-input text-center" />
          </div>
        </div>

        {/* Progress preview */}
        {targetNum > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Прогресс</span>
              <span className="font-bold text-primary">{Math.min(100, Math.round(currentNum / targetNum * 100))}%</span>
            </div>
            <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, currentNum / targetNum * 100)}%` }} />
            </div>
          </div>
        )}

        {/* Deadline */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
            <CalendarIcon size={12} /> Дедлайн
          </label>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            className="form-input" min={getTodayStr()} />
        </div>

        {/* Auto-calc plan */}
        {calcPlan && (
          <div className="rounded-xl p-3 space-y-1" style={{ background: 'hsl(var(--accent) / 0.5)' }}>
            <p className="text-xs font-semibold text-foreground">📊 Чтобы достичь цели:</p>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="text-center">
                <p className="text-sm font-bold text-primary">{remaining.toLocaleString('ru-RU')} ₽</p>
                <p className="text-[10px] text-muted-foreground">Осталось</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">{calcPlan.perMonth.toLocaleString('ru-RU')} ₽</p>
                <p className="text-[10px] text-muted-foreground">в месяц</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">{calcPlan.perDay.toLocaleString('ru-RU')} ₽</p>
                <p className="text-[10px] text-muted-foreground">в день</p>
              </div>
            </div>
          </div>
        )}

        {/* Account link */}
        {accounts.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Привязать к счёту</label>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setAccountId('')}
                className={`pill-btn ${!accountId ? 'pill-btn-active' : 'pill-btn-inactive'}`}>
                Без привязки
              </button>
              {accounts.map(a => (
                <button key={a.id} onClick={() => setAccountId(a.id)}
                  className={`pill-btn ${accountId === a.id ? 'pill-btn-active' : 'pill-btn-inactive'}`}>
                  {a.icon} {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Icon */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Иконка</label>
          <div className="flex gap-1.5 flex-wrap">
            {GOAL_ICONS.map(ic => (
              <button key={ic} onClick={() => setIcon(ic)}
                className={`text-xl w-9 h-9 flex items-center justify-center rounded-lg transition-all ${
                  icon === ic ? 'bg-primary/15 ring-1 ring-primary/60 scale-110' : 'bg-secondary/60 hover:bg-accent'
                }`}>{ic}</button>
            ))}
          </div>
        </div>

        {/* Sphere */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Сфера жизни</label>
          <div className="grid grid-cols-4 gap-1.5">
            {SPHERES.map(s => (
              <button key={s.id} onClick={() => setSphere(s.id)}
                className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[10px] transition-all ${
                  sphere === s.id ? 'bg-primary/15 ring-1 ring-primary/60 text-foreground' : 'bg-secondary/60 hover:bg-accent text-muted-foreground'
                }`}>
                <span className="text-sm">{s.icon}</span>
                <span className="truncate w-full text-center">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving || !title.trim() || !target}
          className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-40 transition-opacity">
          {saving ? 'Сохранение…' : 'Создать цель'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── */
/*  TOP-UP GOAL MODAL                                  */
/* ─────────────────────────────────────────────────── */
function TopUpGoalModal({ goalId, goalTitle, onClose }: { goalId: string; goalTitle: string; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleTopUp() {
    const val = Math.round(parseFloat(amount) * 100);
    if (isNaN(val) || val <= 0) { toast.error('Введите сумму'); return; }
    setSaving(true);
    try {
      const goal = await db.financeGoals.get(goalId);
      if (!goal) { toast.error('Цель не найдена'); return; }
      await db.financeGoals.update(goalId, { currentAmount: goal.currentAmount + val });
      toast.success(`+${(val / 100).toLocaleString('ru-RU')} ₽ к "${goalTitle}"`);
      onClose();
    } catch {
      toast.error('Ошибка');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border/40 rounded-2xl w-[88%] max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-center">➕ Пополнить «{goalTitle}»</h3>
        <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0" className="form-input text-xl font-bold text-center" autoFocus />
        <button onClick={handleTopUp} disabled={saving || !amount}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-40">
          {saving ? '…' : 'Пополнить'}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  MAIN FINANCE PAGE                                  */
/* ═══════════════════════════════════════════════════ */

export default function FinancePage() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabType>('dashboard');
  const [period, setPeriod] = useState<'30' | '90'>('30');
  const [modal, setModal] = useState<'income' | 'expense' | 'account' | 'goal' | null>(null);
  const [topUpGoal, setTopUpGoal] = useState<{ id: string; title: string } | null>(null);

  const ops = useLiveQuery(() => db.financeOperations.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const accounts = useLiveQuery(() => db.financeAccounts.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];
  const finGoals = useLiveQuery(() => db.financeGoals.where('userId').equals(user?.id ?? '').toArray(), [user?.id]) ?? [];

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const monthOps = ops.filter(o => o.date >= monthStart);
  const monthIncome = monthOps.filter(o => o.type === 'INCOME').reduce((s, o) => s + o.amount, 0);
  const monthExpense = monthOps.filter(o => o.type === 'EXPENSE').reduce((s, o) => s + o.amount, 0);
  const monthResult = monthIncome - monthExpense;

  const totalIncome = ops.filter(o => o.type === 'INCOME').reduce((s, o) => s + o.amount, 0);
  const totalExpense = ops.filter(o => o.type === 'EXPENSE').reduce((s, o) => s + o.amount, 0);
  const visibleAccountsBalance = accounts.filter(a => !a.hideFromTotal).reduce((s, a) => s + a.balance, 0);
  const totalBalance = totalIncome - totalExpense + visibleAccountsBalance;

  const daysPassed = now.getDate();
  const avgDailyExpense = daysPassed > 0 ? monthExpense / daysPassed : 0;
  const daysLeft = totalBalance > 0 && avgDailyExpense > 0 ? Math.floor(totalBalance / avgDailyExpense) : 0;

  const impulsePercent = (() => {
    const expenseOps = monthOps.filter(o => o.type === 'EXPENSE');
    if (expenseOps.length === 0) return 0;
    return Math.round(expenseOps.filter(o => o.emotionalTag === 'impulsive').length / expenseOps.length * 100);
  })();

  const sphereData = useMemo(() => {
    const expenseOps = ops.filter(o => o.type === 'EXPENSE');
    const byS: Record<string, number> = {};
    expenseOps.forEach(o => { byS[o.sphere] = (byS[o.sphere] || 0) + o.amount; });
    const total = Object.values(byS).reduce((s, v) => s + v, 0);
    return SPHERES.map(s => ({
      name: s.name, value: byS[s.id] || 0,
      percent: total > 0 ? Math.round((byS[s.id] || 0) / total * 100) : 0,
      color: getSphereColor(s.id), icon: s.icon,
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [ops]);

  const trendData = useMemo(() => {
    const days = parseInt(period);
    const data: { date: string; balance: number }[] = [];
    let running = 0;
    const sorted = [...ops].sort((a, b) => a.date.localeCompare(b.date));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    sorted.filter(o => o.date < cutoffStr).forEach(o => {
      running += o.type === 'INCOME' ? o.amount : -o.amount;
    });
    for (let i = days; i >= 0; i -= Math.max(1, Math.floor(days / 15))) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const dayOps = sorted.filter(o => o.date <= ds && o.date >= cutoffStr);
      let bal = running;
      dayOps.forEach(o => { bal += o.type === 'INCOME' ? o.amount : -o.amount; });
      data.push({ date: `${d.getDate()}.${d.getMonth() + 1}`, balance: bal / 100 });
    }
    return data;
  }, [ops, period]);

  const recent = [...ops].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);

  const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'Обзор', icon: <Wallet size={14} /> },
    { key: 'income', label: 'Доходы', icon: <TrendingUp size={14} /> },
    { key: 'expenses', label: 'Расходы', icon: <TrendingDown size={14} /> },
    { key: 'analytics', label: 'Аналитика', icon: <BarChart3 size={14} /> },
  ];

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Wallet size={20} className="text-primary" />
          <h1 className="text-lg font-bold">Финансы</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setModal('expense')} className="p-2 rounded-lg bg-secondary text-muted-foreground hover:bg-accent transition-colors">
            <TrendingDown size={16} />
          </button>
          <button onClick={() => setModal('income')} className="p-2 rounded-lg bg-primary text-primary-foreground">
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2">
        <div className="flex bg-secondary rounded-lg p-0.5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-[11px] font-medium rounded-md flex items-center justify-center gap-1 transition-colors ${
                tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-2 space-y-4 max-w-lg mx-auto w-full fade-in overflow-auto">
        {/* ═══ DASHBOARD ═══ */}
        {tab === 'dashboard' && (
          <>
            {/* Total Balance */}
            <div className="glass-card p-5 text-center">
              <p className="text-xs text-muted-foreground mb-1">Общий баланс</p>
              <p className={`text-3xl font-bold ${totalBalance >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {formatCurrency(totalBalance)}
              </p>
            </div>

            {/* Month summary */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setModal('income')} className="glass-card p-3 text-center active:scale-95 transition-transform">
                <TrendingUp size={16} className="mx-auto text-primary mb-1" />
                <p className="text-sm font-bold text-primary">+{formatCurrency(monthIncome)}</p>
                <p className="text-[10px] text-muted-foreground">Доходы</p>
              </button>
              <button onClick={() => setModal('expense')} className="glass-card p-3 text-center active:scale-95 transition-transform">
                <TrendingDown size={16} className="mx-auto text-destructive mb-1" />
                <p className="text-sm font-bold text-destructive">-{formatCurrency(monthExpense)}</p>
                <p className="text-[10px] text-muted-foreground">Расходы</p>
              </button>
              <div className="glass-card p-3 text-center">
                <ArrowUpDown size={16} className="mx-auto text-muted-foreground mb-1" />
                <p className={`text-sm font-bold ${monthResult >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {monthResult >= 0 ? '+' : ''}{formatCurrency(monthResult)}
                </p>
                <p className="text-[10px] text-muted-foreground">Итог</p>
              </div>
            </div>

            {/* Burn Rate */}
            {monthExpense > 0 && (
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Flame size={16} className="text-orange-500" />
                  <span className="text-sm font-semibold">Burn Rate</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">В день</p>
                    <p className="text-lg font-bold">{formatCurrency(Math.round(avgDailyExpense))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Хватит на</p>
                    <p className={`text-lg font-bold ${daysLeft < 30 ? 'text-destructive' : 'text-primary'}`}>
                      {daysLeft > 0 ? `${daysLeft} дн.` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Accounts */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Счета</h3>
                <button onClick={() => setModal('account')} className="text-xs text-primary font-medium">+ Добавить</button>
              </div>
              {accounts.length === 0 ? (
                <div className="glass-card p-6 text-center">
                  <CreditCard size={28} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Нет счетов</p>
                  <button onClick={() => setModal('account')}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
                    Добавить счёт
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {accounts.map(acc => (
                    <div key={acc.id} className="glass-card p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                        style={{ backgroundColor: `${acc.color}20` }}>
                        {acc.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{acc.name}</p>
                          {acc.isDefault && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">Основной</span>}
                          {acc.hideFromTotal && <EyeOff size={10} className="text-muted-foreground" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {ACCOUNT_TYPES.find(t => t.type === acc.type)?.name ?? acc.type}
                        </p>
                      </div>
                      <p className="text-sm font-bold">{(acc.balance / 100).toLocaleString('ru-RU')} {acc.currency}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Finance Goals */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Target size={14} className="text-primary" /> Финансовые цели
                </h3>
                <button onClick={() => setModal('goal')} className="text-xs text-primary font-medium">+ Добавить</button>
              </div>
              {finGoals.length === 0 ? (
                <div className="glass-card p-6 text-center">
                  <PiggyBank size={28} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Нет финансовых целей</p>
                  <button onClick={() => setModal('goal')}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
                    Добавить цель
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {finGoals.map(g => {
                    const pct = g.targetAmount > 0 ? Math.min(Math.round(g.currentAmount / g.targetAmount * 100), 100) : 0;
                    const remainKop = Math.max(0, g.targetAmount - g.currentAmount);
                    const gt = GOAL_TYPES.find(t => t.type === g.goalType);
                    // Monthly calc
                    let monthlyNeeded: string | null = null;
                    if (g.deadline && remainKop > 0) {
                      const diffMs = new Date(g.deadline).getTime() - Date.now();
                      const months = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30)));
                      monthlyNeeded = (Math.ceil(remainKop / months) / 100).toLocaleString('ru-RU');
                    }
                    return (
                      <div key={g.id} className="glass-card p-4">
                        <div className="flex items-center gap-2.5 mb-2">
                          <span className="text-xl">{g.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{g.title}</p>
                            {gt && <p className="text-[10px] text-muted-foreground">{gt.icon} {gt.name}</p>}
                          </div>
                          <span className="text-sm font-black text-primary">{pct}%</span>
                        </div>
                        <div className="h-2.5 bg-secondary rounded-full overflow-hidden mb-2">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: gt?.color || 'hsl(var(--primary))' }} />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
                          <span>{formatCurrency(g.currentAmount)} / {formatCurrency(g.targetAmount)}</span>
                          <span>Осталось: {formatCurrency(remainKop)}</span>
                        </div>
                        {monthlyNeeded && (
                          <p className="text-[10px] text-primary/80 mb-2">📊 Нужно {monthlyNeeded} ₽/мес</p>
                        )}
                        {g.deadline && (
                          <p className="text-[10px] text-muted-foreground mb-2">
                            📅 До {new Date(g.deadline).toLocaleDateString('ru-RU')}
                          </p>
                        )}
                        <button onClick={() => setTopUpGoal({ id: g.id, title: g.title })}
                          className="w-full py-2 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                          ➕ Пополнить цель
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Balance chart */}
            {ops.length > 0 && (
              <div className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold">Динамика баланса</h3>
                  <div className="flex gap-1">
                    {(['30', '90'] as const).map(p => (
                      <button key={p} onClick={() => setPeriod(p)}
                        className={`px-2 py-1 text-[10px] rounded-md transition-colors ${period === p ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                        {p} дн
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip formatter={(v: number) => `${v.toLocaleString('ru-RU')} ₽`}
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="balance" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent ops */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Последние операции</h3>
              {recent.length === 0 ? (
                <div className="glass-card p-6 text-center">
                  <p className="text-sm text-muted-foreground">Нет операций</p>
                  <p className="text-xs text-muted-foreground mt-1">Добавьте первую операцию</p>
                </div>
              ) : recent.map(op => (
                <div key={op.id} className="glass-card p-3 mb-2 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/finance/${op.id}/edit`)}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{getSphereById(op.sphere).icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{op.category}</p>
                      <div className="flex items-center gap-1.5">
                        {op.emotionalTag && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                            op.emotionalTag === 'useful' ? 'bg-primary/20 text-primary' :
                            op.emotionalTag === 'impulsive' ? 'bg-destructive/20 text-destructive' :
                            'bg-secondary text-muted-foreground'
                          }`}>
                            {op.emotionalTag === 'useful' ? '✅' : op.emotionalTag === 'impulsive' ? '⚡' : '➖'}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{op.date}</span>
                      </div>
                    </div>
                    <p className={`font-bold text-sm ${op.type === 'INCOME' ? 'text-primary' : 'text-destructive'}`}>
                      {op.type === 'INCOME' ? '+' : '-'}{formatCurrency(op.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {impulsePercent > 0 && (
              <div className="glass-card p-3 border-l-4 border-orange-500">
                <p className="text-xs font-medium">⚡ {impulsePercent}% расходов были импульсивными</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Старайтесь снижать импульсивные траты</p>
              </div>
            )}
          </>
        )}

        {/* ═══ INCOME TAB ═══ */}
        {tab === 'income' && (
          <>
            <div className="glass-card p-5 text-center">
              <p className="text-xs text-muted-foreground mb-1">Доходы за месяц</p>
              <p className="text-3xl font-bold text-primary">+{formatCurrency(monthIncome)}</p>
            </div>
            <button onClick={() => setModal('income')} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium flex items-center justify-center gap-2">
              <Plus size={16} /> Добавить доход
            </button>
            {ops.filter(o => o.type === 'INCOME').length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">Пока нет доходов</div>
            )}
            {ops.filter(o => o.type === 'INCOME').sort((a, b) => b.createdAt - a.createdAt).map(op => (
              <div key={op.id} className="glass-card p-3 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/finance/${op.id}/edit`)}>
                <div className="flex items-center gap-3">
                  <TrendingUp size={16} className="text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{op.category}</p>
                    <p className="text-[10px] text-muted-foreground">{op.date} · {getSphereById(op.sphere).name}</p>
                  </div>
                  <p className="text-sm font-bold text-primary">+{formatCurrency(op.amount)}</p>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ═══ EXPENSES TAB ═══ */}
        {tab === 'expenses' && (
          <>
            <div className="glass-card p-5 text-center">
              <p className="text-xs text-muted-foreground mb-1">Расходы за месяц</p>
              <p className="text-3xl font-bold text-destructive">-{formatCurrency(monthExpense)}</p>
            </div>
            <button onClick={() => setModal('expense')} className="w-full py-3 bg-destructive text-destructive-foreground rounded-xl font-medium flex items-center justify-center gap-2">
              <Plus size={16} /> Добавить расход
            </button>
            {ops.filter(o => o.type === 'EXPENSE').length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">Пока нет расходов</div>
            )}
            {ops.filter(o => o.type === 'EXPENSE').sort((a, b) => b.createdAt - a.createdAt).map(op => (
              <div key={op.id} className="glass-card p-3 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/finance/${op.id}/edit`)}>
                <div className="flex items-center gap-3">
                  <TrendingDown size={16} className="text-destructive" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{op.category}</p>
                    <div className="flex items-center gap-1.5">
                      {op.emotionalTag && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                          op.emotionalTag === 'useful' ? 'bg-primary/20 text-primary' :
                          op.emotionalTag === 'impulsive' ? 'bg-destructive/20 text-destructive' :
                          'bg-secondary text-muted-foreground'
                        }`}>
                          {op.emotionalTag === 'useful' ? '✅' : op.emotionalTag === 'impulsive' ? '⚡' : '➖'}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{op.date}</span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-destructive">-{formatCurrency(op.amount)}</p>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ═══ ANALYTICS TAB ═══ */}
        {tab === 'analytics' && (
          <>
            {ops.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <BarChart3 size={32} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Добавьте операции для аналитики</p>
              </div>
            ) : (
              <>
                {sphereData.length > 0 && (
                  <div className="glass-card p-4">
                    <h3 className="text-sm font-bold mb-3">Расходы по сферам</h3>
                    <div className="flex justify-center">
                      <ResponsiveContainer width={200} height={200}>
                        <PieChart>
                          <Pie data={sphereData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                            {sphereData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2 mt-3">
                      {sphereData.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span>{d.icon}</span>
                          <span className="text-xs flex-1">{d.name}</span>
                          <span className="text-xs font-bold">{d.percent}%</span>
                          <span className="text-[10px] text-muted-foreground">{formatCurrency(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="glass-card p-4">
                  <h3 className="text-sm font-bold mb-3">Эмоциональный анализ</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Полезные', tag: 'useful' as const, color: 'text-primary', bgColor: 'bg-primary/10' },
                      { label: 'Нейтральные', tag: 'neutral' as const, color: 'text-muted-foreground', bgColor: 'bg-secondary' },
                      { label: 'Импульсивные', tag: 'impulsive' as const, color: 'text-destructive', bgColor: 'bg-destructive/10' },
                    ].map(item => {
                      const expOps = monthOps.filter(o => o.type === 'EXPENSE');
                      const count = expOps.filter(o => o.emotionalTag === item.tag).length;
                      const pct = expOps.length > 0 ? Math.round(count / expOps.length * 100) : 0;
                      return (
                        <div key={item.tag} className={`${item.bgColor} rounded-xl p-3 text-center`}>
                          <p className={`text-xl font-bold ${item.color}`}>{pct}%</p>
                          <p className="text-[10px] text-muted-foreground">{item.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="glass-card p-4">
                  <h3 className="text-sm font-bold mb-3">Баланс сфер</h3>
                  <div className="space-y-2">
                    {SPHERES.map(s => {
                      const total = ops.filter(o => o.type === 'EXPENSE').reduce((sum, o) => sum + o.amount, 0);
                      const sVal = ops.filter(o => o.type === 'EXPENSE' && o.sphere === s.id).reduce((sum, o) => sum + o.amount, 0);
                      const pct = total > 0 ? Math.round(sVal / total * 100) : 0;
                      return (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className="text-sm">{s.icon}</span>
                          <span className="text-xs w-12">{s.name}</span>
                          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: getSphereColor(s.id) }} />
                          </div>
                          <span className="text-[10px] font-bold w-8 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      {modal === 'income' && <AddOperationModal type="INCOME" onClose={() => setModal(null)} />}
      {modal === 'expense' && <AddOperationModal type="EXPENSE" onClose={() => setModal(null)} />}
      {modal === 'account' && <AddAccountModal onClose={() => setModal(null)} />}
      {modal === 'goal' && <AddGoalModal onClose={() => setModal(null)} />}
      {topUpGoal && <TopUpGoalModal goalId={topUpGoal.id} goalTitle={topUpGoal.title} onClose={() => setTopUpGoal(null)} />}
    </div>
  );
}
