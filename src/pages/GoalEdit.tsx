import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES } from '@/lib/constants';
import { ArrowLeft, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import type { SphereType } from '@/lib/types';
import {
  getGoalById, updateGoal, deleteGoal, clampProgress, completionTransition,
  GOAL_TITLE_MAX, GOAL_DESCRIPTION_MAX, type GoalRow,
} from '@/lib/goalsService';
import { toast } from 'sonner';

export default function GoalEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const requestIdRef = useRef(0);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sphere, setSphere] = useState<SphereType>('career');
  const [targetDate, setTargetDate] = useState('');
  const [progress, setProgress] = useState(0);

  const fetchGoal = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!id || !user?.id) {
      // Guests have no cloud goals: show the message instead of an endless spinner.
      setLoading(false);
      setError(user?.id ? 'Цель не найдена' : 'Войдите в аккаунт, чтобы редактировать цели');
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await getGoalById(id, user.id);
    if (requestId !== requestIdRef.current) return;
    setLoading(false);
    if (err) { setError(err.message); return; }
    if (!data) { setError('Цель не найдена'); return; }
    setGoal(data);
    setTitle(data.title ?? '');
    setDescription(data.description ?? '');
    setSphere((data.sphere as SphereType) ?? 'career');
    setTargetDate(data.target_date ?? data.deadline ?? '');
    setProgress(clampProgress(data.progress));
  }, [id, user?.id]);

  useEffect(() => { void fetchGoal(); }, [fetchGoal]);

  async function handleSave() {
    if (!id || !user?.id || !goal || !title.trim() || saving) return;
    setSaving(true);
    // Status follows progress: 100% → completed, below 100% → active again. Only when the
    // slider was moved: a title/date edit must not un-archive (or re-open) a goal.
    const progressChanged = progress !== clampProgress(goal.progress);
    const { patch } = progressChanged ? completionTransition(goal.status, progress) : { patch: null };
    const { error: err } = await updateGoal(id, user.id, {
      title: title.trim().slice(0, GOAL_TITLE_MAX),
      description: description.trim().slice(0, GOAL_DESCRIPTION_MAX) || null,
      sphere,
      target_date: targetDate || null,
      progress,
      ...(patch ?? {}),
    });
    setSaving(false);
    if (err) { toast.error('Ошибка сохранения: ' + err.message); return; }
    toast.success('Цель обновлена');
    navigate(`/goals/${id}`);
  }

  async function handleDelete() {
    if (!id || !user?.id || deleting) return;
    setDeleting(true);
    const { error: err } = await deleteGoal(id, user.id);
    setDeleting(false);
    if (err) { toast.error('Ошибка удаления: ' + err.message); return; }
    toast.success('Цель удалена');
    navigate('/goals');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !goal) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-4 px-8 text-center">
        <AlertTriangle size={40} className="text-destructive" />
        <p className="text-sm text-muted-foreground">{error ?? 'Цель не найдена'}</p>
        <div className="flex gap-3">
          <button onClick={() => { void fetchGoal(); }} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <RefreshCw size={14} /> Повторить
          </button>
          <button onClick={() => navigate('/goals')} className="px-4 py-2 bg-secondary rounded-xl text-sm">← Назад</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirmDelete(false)}>
          <div className="bg-card rounded-3xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-2">Удалить цель?</h3>
            <p className="text-sm text-muted-foreground mb-5">Будут удалены все вехи и шаги. Это действие необратимо.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 bg-secondary rounded-xl text-sm">Отмена</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 bg-destructive text-destructive-foreground rounded-xl text-sm font-semibold disabled:opacity-50">{deleting ? 'Удаление…' : 'Удалить'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col min-h-screen pb-20">
        <div className="flex items-center justify-between px-4 h-14 border-b border-border/30">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
            <h1 className="text-lg font-bold">Редактировать цель</h1>
          </div>
          <button onClick={() => setConfirmDelete(true)} className="p-2 text-destructive">
            <Trash2 size={18} />
          </button>
        </div>

        <div className="flex-1 px-4 py-4 space-y-5 max-w-lg mx-auto w-full">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={GOAL_TITLE_MAX} className="form-input" placeholder="Название цели" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={GOAL_DESCRIPTION_MAX} className="form-input resize-none" placeholder="Описание (необязательно)" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Сфера жизни</label>
            <div className="grid grid-cols-4 gap-2">
              {SPHERES.slice(0, 8).map(s => (
                <button
                  key={s.id}
                  onClick={() => setSphere(s.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-colors ${sphere === s.id ? 'bg-primary/20 ring-1 ring-primary' : 'bg-secondary hover:bg-accent'}`}
                >
                  <span>{s.icon}</span>
                  <span className="truncate w-full text-center">{s.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Целевая дата</label>
            <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="form-input" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Прогресс: {progress}%</label>
            <input type="range" min={0} max={100} value={progress} onChange={e => setProgress(Number(e.target.value))} className="w-full accent-primary" />
          </div>

          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </>
  );
}
