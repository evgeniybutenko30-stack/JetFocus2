import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, SPHERES, getTodayStr } from '@/lib/constants';
import { ArrowLeft } from 'lucide-react';
import { useInvalidateMetrics } from '@/hooks/use-metrics';
import { toast } from 'sonner';
import {
  parseAmountToKopecks, isValidDateStr,
  FINANCE_AMOUNT_INPUT_MAX, FINANCE_CATEGORY_MAX, FINANCE_DESCRIPTION_MAX,
} from '@/lib/financeUtils';
import type { SphereType } from '@/lib/types';

export default function FinanceNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useAuthStore(s => s.user);
  const invalidate = useInvalidateMetrics();
  const addXP = useAuthStore(s => s.addXP);
  const addStars = useAuthStore(s => s.addStars);
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(params.get('type') === 'income' ? 'INCOME' : 'EXPENSE');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [customCat, setCustomCat] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(getTodayStr());
  const [sphere, setSphere] = useState<SphereType>('finance');
  const [emotionalTag, setEmotionalTag] = useState<'useful' | 'neutral' | 'impulsive'>('neutral');
  const [sphereError, setSphereError] = useState(false);
  const [saving, setSaving] = useState(false);

  const categories = type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const finalCategory = showCustom ? customCat.trim() : category;

  async function handleSubmit() {
    if (saving) return;
    // Same rule as the Finance page modals; without it `user.id` threw and showed a misleading "save error".
    if (!user) { toast.error('Войдите в аккаунт'); return; }
    const kopecks = parseAmountToKopecks(amount);
    if (!finalCategory || kopecks === null) {
      toast.error('Заполните сумму и категорию');
      return;
    }
    if (!isValidDateStr(date)) { toast.error('Укажите дату'); return; }
    if (!sphere) { setSphereError(true); return; }
    setSaving(true);
    try {
      await db.financeOperations.add({
        id: crypto.randomUUID(), userId: user.id, type, amount: kopecks, category: finalCategory,
        description: description.trim() || undefined, tags: [], date, sphere,
        emotionalTag: type === 'EXPENSE' ? emotionalTag : undefined,
        createdAt: Date.now(),
      });
      addXP(5);
      addStars(1);
      invalidate();
      toast.success('Добавлено');
      navigate('/finance');
    } catch (e) {
      console.error('Finance save error:', e);
      toast.error('Ошибка сохранения');
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="section-header">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">Новая операция</h1>
      </div>
      <div className="flex-1 px-4 py-4 space-y-5 max-w-lg mx-auto w-full fade-in">
        {/* Type toggle */}
        <div className="flex bg-secondary rounded-lg p-0.5">
          <button onClick={() => { setType('INCOME'); setCategory(''); setShowCustom(false); }} className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${type === 'INCOME' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>💰 Доход</button>
          <button onClick={() => { setType('EXPENSE'); setCategory(''); setShowCustom(false); }} className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${type === 'EXPENSE' ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground'}`}>💸 Расход</button>
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма (₽)</label>
          <input type="text" inputMode="decimal" autoComplete="off" maxLength={FINANCE_AMOUNT_INPUT_MAX} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="form-input text-2xl font-bold text-center" />
        </div>

        {/* Category */}
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
              ✏️ Своя категория
            </button>
          </div>
          {showCustom && (
            <input value={customCat} onChange={e => setCustomCat(e.target.value)} maxLength={FINANCE_CATEGORY_MAX}
              placeholder="Название категории" className="form-input mt-2" autoFocus />
          )}
        </div>

        {/* Sphere */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">
            Сфера жизни *
            {sphereError && <span className="text-destructive ml-1">— обязательное поле</span>}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {SPHERES.map(s => (
              <button key={s.id} onClick={() => { setSphere(s.id); setSphereError(false); }}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-colors ${
                  sphere === s.id ? 'bg-primary/20 ring-1 ring-primary' : 'bg-secondary hover:bg-accent'
                }`}>
                <span>{s.icon}</span>
                <span className="truncate w-full text-center">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Emotional tag (only for expenses) */}
        {type === 'EXPENSE' && (
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Оценка расхода</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'useful' as const, label: 'Полезно', icon: '✅', active: 'bg-primary/20 ring-1 ring-primary text-primary' },
                { key: 'neutral' as const, label: 'Нейтрально', icon: '➖', active: 'bg-secondary ring-1 ring-border' },
                { key: 'impulsive' as const, label: 'Импульсивно', icon: '⚡', active: 'bg-destructive/20 ring-1 ring-destructive text-destructive' },
              ].map(e => (
                <button key={e.key} onClick={() => setEmotionalTag(e.key)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl text-xs transition-all ${
                    emotionalTag === e.key ? e.active : 'bg-secondary text-muted-foreground hover:bg-accent'
                  }`}>
                  <span className="text-lg">{e.icon}</span>
                  <span>{e.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
          <input value={description} onChange={e => setDescription(e.target.value)} maxLength={FINANCE_DESCRIPTION_MAX} placeholder="Необязательно" className="form-input" />
        </div>

        {/* Date */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Дата</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
        </div>

        <button onClick={handleSubmit} disabled={saving || !finalCategory || !amount.trim()}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
          {saving ? 'Сохранение…' : 'Добавить'}
        </button>
      </div>
    </div>
  );
}
