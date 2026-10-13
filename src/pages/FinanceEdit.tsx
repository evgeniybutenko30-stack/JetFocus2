import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '@/lib/db';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, SPHERES } from '@/lib/constants';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { useInvalidateMetrics } from '@/hooks/use-metrics';
import {
  parseAmountToKopecks, kopecksToInputString, isValidDateStr,
  FINANCE_AMOUNT_INPUT_MAX, FINANCE_CATEGORY_MAX, FINANCE_DESCRIPTION_MAX,
} from '@/lib/financeUtils';
import type { FinanceOperation, SphereType } from '@/lib/types';

/** Loads an operation only if it belongs to `ownerId` (guests own the rows written with userId ''). */
async function loadOwnOperation(id: string, ownerId: string): Promise<FinanceOperation | null> {
  const found = await db.financeOperations.get(id);
  return found && found.userId === ownerId ? found : null;
}

export default function FinanceEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ownerId = useAuthStore(s => s.user?.id ?? '');
  const invalidateMetrics = useInvalidateMetrics();
  const [op, setOp] = useState<FinanceOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [customCat, setCustomCat] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [sphere, setSphere] = useState<SphereType>('finance');
  const [emotionalTag, setEmotionalTag] = useState<'useful' | 'neutral' | 'impulsive'>('neutral');

  useEffect(() => {
    // Ignore a late response for a previous id / user, and never set state after unmount.
    let cancelled = false;
    const notFound = () => {
      toast.error('Операция не найдена');
      navigate('/finance', { replace: true });
    };
    if (!id) { notFound(); return; }
    loadOwnOperation(id, ownerId).then(o => {
      if (cancelled) return;
      if (!o) { notFound(); return; }
      setOp(o); setAmount(kopecksToInputString(o.amount)); setCategory(o.category);
      setDescription(o.description || ''); setDate(o.date);
      setSphere(o.sphere || 'finance');
      setEmotionalTag(o.emotionalTag || 'neutral');
      // Check if category is custom (not in predefined lists)
      const cats = o.type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      if (!cats.find(c => c.name === o.category)) {
        setShowCustom(true);
        setCustomCat(o.category);
        setCategory('');
      } else {
        setShowCustom(false);
        setCustomCat('');
      }
    }).catch(e => {
      if (cancelled) return;
      console.error('Finance load error:', e);
      toast.error('Не удалось загрузить операцию');
      navigate('/finance', { replace: true });
    });
    return () => { cancelled = true; };
  }, [id, ownerId, navigate]);

  const finalCategory = showCustom ? customCat.trim() : category;

  async function handleSave() {
    if (busy || !id || !op) return;
    const kopecks = parseAmountToKopecks(amount);
    if (!finalCategory || kopecks === null) { toast.error('Заполните сумму и категорию'); return; }
    if (!isValidDateStr(date)) { toast.error('Укажите дату'); return; }
    setBusy(true);
    try {
      // Re-check existence/ownership inside the transaction: the row may have been deleted meanwhile,
      // and Dexie's update() resolves with 0 both for "missing" and "nothing changed".
      const saved = await db.transaction('rw', db.financeOperations, async () => {
        if (!(await loadOwnOperation(id, ownerId))) return false;
        await db.financeOperations.update(id, {
          amount: kopecks, category: finalCategory,
          description: description.trim() || undefined, date, sphere,
          emotionalTag: op.type === 'EXPENSE' ? emotionalTag : undefined,
        });
        return true;
      });
      if (!saved) {
        toast.error('Операция не найдена');
        navigate('/finance', { replace: true });
        return;
      }
      invalidateMetrics();
      toast.success('Сохранено');
      navigate('/finance');
    } catch (e) {
      console.error('Finance update error:', e);
      toast.error('Ошибка сохранения');
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy || !id || !op) return;
    if (!window.confirm('Удалить операцию? Это действие нельзя отменить.')) return;
    setBusy(true);
    try {
      const deleted = await db.transaction('rw', db.financeOperations, async () => {
        if (!(await loadOwnOperation(id, ownerId))) return false;
        await db.financeOperations.delete(id);
        return true;
      });
      if (!deleted) {
        toast.error('Операция не найдена');
      } else {
        invalidateMetrics();
        toast.success('Удалено');
      }
      navigate('/finance', { replace: true });
    } catch (e) {
      console.error('Finance delete error:', e);
      toast.error('Не удалось удалить');
      setBusy(false);
    }
  }

  if (!op) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const categories = op.type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border/30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold">Редактировать</h1>
        </div>
        <button onClick={handleDelete} disabled={busy} aria-label="Удалить операцию" className="p-2 text-destructive disabled:opacity-50"><Trash2 size={18} /></button>
      </div>
      <div className="flex-1 px-4 py-4 space-y-5 max-w-lg mx-auto w-full fade-in">
        <div className="text-center text-sm font-medium">{op.type === 'INCOME' ? '💰 Доход' : '💸 Расход'}</div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма (₽)</label>
          <input type="text" inputMode="decimal" autoComplete="off" maxLength={FINANCE_AMOUNT_INPUT_MAX} value={amount} onChange={e => setAmount(e.target.value)} className="form-input text-xl font-bold text-center" />
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
          <label className="text-xs text-muted-foreground mb-2 block">Сфера жизни</label>
          <div className="grid grid-cols-4 gap-2">
            {SPHERES.map(s => (
              <button key={s.id} onClick={() => setSphere(s.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-colors ${sphere === s.id ? 'bg-primary/20 ring-1 ring-primary' : 'bg-secondary hover:bg-accent'}`}>
                <span>{s.icon}</span><span className="truncate w-full text-center">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        {op.type === 'EXPENSE' && (
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Оценка</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'useful' as const, label: 'Полезно', icon: '✅' },
                { key: 'neutral' as const, label: 'Нейтрально', icon: '➖' },
                { key: 'impulsive' as const, label: 'Импульсивно', icon: '⚡' },
              ].map(e => (
                <button key={e.key} onClick={() => setEmotionalTag(e.key)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-xs ${
                    emotionalTag === e.key ? 'bg-primary/20 ring-1 ring-primary' : 'bg-secondary text-muted-foreground'
                  }`}>
                  <span>{e.icon}</span><span>{e.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
          <input value={description} onChange={e => setDescription(e.target.value)} maxLength={FINANCE_DESCRIPTION_MAX} className="form-input" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Дата</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
        </div>

        <button onClick={handleSave} disabled={busy || !finalCategory || !amount.trim()}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
          {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
