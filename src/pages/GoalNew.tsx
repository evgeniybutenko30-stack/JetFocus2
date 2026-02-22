import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES } from '@/lib/constants';
import { ArrowLeft, Plus, X, LogIn } from 'lucide-react';
import type { SphereType } from '@/lib/types';
import { createGoal } from '@/lib/goalsService';
import { toast } from 'sonner';

function GuestPrompt({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5" />
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-3">
            <LogIn size={32} className="text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-1">Войдите, чтобы создавать цели</h2>
          <p className="text-sm text-muted-foreground">В гостевом режиме данные не сохраняются. Создайте аккаунт — это бесплатно.</p>
        </div>
        <button onClick={() => navigate('/auth')} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold mb-3">
          Войти или зарегистрироваться
        </button>
        <button onClick={onClose} className="w-full py-3 text-muted-foreground text-sm">Продолжить как гость</button>
      </div>
    </div>
  );
}

export default function GoalNewPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const addStars = useAuthStore(s => s.addStars);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sphere, setSphere] = useState<SphereType | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [sphereError, setSphereError] = useState(false);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) return;
    if (!sphere) { setSphereError(true); return; }
    if (!user?.id) { setShowGuestPrompt(true); return; }

    setSaving(true);
    const { data, error } = await createGoal({
      user_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      sphere,
      status: 'active',
      progress: 0,
      is_pinned: false,
      target_date: targetDate || null,
    });
    setSaving(false);

    if (error) { toast.error('Ошибка создания: ' + error.message); return; }
    addStars(5);
    toast.success('Цель создана!');
    if (data) navigate(`/goals/${data.id}`);
    else navigate('/goals');
  }

  return (
    <>
      {showGuestPrompt && <GuestPrompt onClose={() => setShowGuestPrompt(false)} />}
      <div className="flex flex-col min-h-screen pb-20">
        <div className="section-header">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold">Новая цель</h1>
        </div>
        <div className="flex-1 px-4 py-4 space-y-5 max-w-lg mx-auto w-full fade-in">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Выучить китайский" className="form-input" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Опишите вашу цель" className="form-input resize-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">
              Сфера жизни *
              {sphereError && <span className="text-destructive ml-1">— обязательное поле</span>}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {SPHERES.map(s => (
                <button key={s.id} onClick={() => { setSphere(s.id); setSphereError(false); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-colors ${sphere === s.id ? 'bg-primary/20 ring-1 ring-primary' : 'bg-secondary hover:bg-accent'}`}>
                  <span>{s.icon}</span><span className="truncate w-full text-center">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Целевая дата</label>
            <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="form-input" />
          </div>
          <button onClick={handleSubmit} disabled={!title.trim() || saving}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {saving ? 'Создание…' : 'Создать цель'}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Хочешь автоматический план? Используй{' '}
            <button onClick={() => navigate('/goals')} className="text-primary font-medium">мастер целей →</button>
          </p>
        </div>
      </div>
    </>
  );
}
