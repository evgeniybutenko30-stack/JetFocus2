import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '@/lib/db';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, SPHERES } from '@/lib/constants';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FinanceOperation, SphereType } from '@/lib/types';

export default function FinanceEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [op, setOp] = useState<FinanceOperation | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [customCat, setCustomCat] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [sphere, setSphere] = useState<SphereType>('finance');
  const [emotionalTag, setEmotionalTag] = useState<'useful' | 'neutral' | 'impulsive'>('neutral');

  useEffect(() => {
    if (id) db.financeOperations.get(id).then(o => {
      if (o) {
        setOp(o); setAmount(String(o.amount / 100)); setCategory(o.category);
        setDescription(o.description || ''); setDate(o.date);
        setSphere(o.sphere || 'finance');
        setEmotionalTag(o.emotionalTag || 'neutral');
        // Check if category is custom (not in predefined lists)
        const cats = o.type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
        if (!cats.find(c => c.name === o.category)) {
          setShowCustom(true);
          setCustomCat(o.category);
          setCategory('');
        }
      } else {
        toast.error('Операция не найдена');
        navigate('/finance');
      }
    });
  }, [id]);

  const finalCategory = showCustom ? customCat.trim() : category;

  async function handleSave() {
    if (!id || !finalCategory || !amount) { toast.error('Заполните все поля'); return; }
    try {
      await db.financeOperations.update(id, {
        amount: Math.round(parseFloat(amount) * 100), category: finalCategory,
        description: description.trim() || undefined, date, sphere,
        emotionalTag: op?.type === 'EXPENSE' ? emotionalTag : undefined,
      });
      toast.success('Сохранено');
      navigate('/finance');
    } catch {
      toast.error('Ошибка сохранения');
    }
  }

  async function handleDelete() {
    if (id) {
      await db.financeOperations.delete(id);
      toast.success('Удалено');
      navigate('/finance');
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
        <button onClick={handleDelete} className="p-2 text-destructive"><Trash2 size={18} /></button>
      </div>
      <div className="flex-1 px-4 py-4 space-y-5 max-w-lg mx-auto w-full fade-in">
        <div className="text-center text-sm font-medium">{op.type === 'INCOME' ? '💰 Доход' : '💸 Расход'}</div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма (₽)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="form-input text-xl font-bold text-center" />
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
            <input value={customCat} onChange={e => setCustomCat(e.target.value)}
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
          <input value={description} onChange={e => setDescription(e.target.value)} className="form-input" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Дата</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
        </div>

        <button onClick={handleSave} disabled={!finalCategory || !amount}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
          Сохранить
        </button>
      </div>
    </div>
  );
}
