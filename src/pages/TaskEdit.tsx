import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES } from '@/lib/constants';
import {
  getTaskById, updateTask, deleteTask, resolveCompletedAt,
  TASK_TITLE_MAX, TASK_DESCRIPTION_MAX,
  type TaskRow, type TaskStatus,
} from '@/lib/tasksService';
import { listGoals, type GoalRow } from '@/lib/goalsService';
import { ArrowLeft, Trash2, Target, AlertCircle } from 'lucide-react';
import type { SphereType } from '@/lib/types';
import { toast } from 'sonner';

export default function TaskEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const userId = user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Synchronous guard against double taps on save / delete.
  const busyRef = useRef(false);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [original, setOriginal] = useState<Pick<TaskRow, 'status' | 'completed_at'> | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sphere, setSphere] = useState<SphereType>('career');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [dueDate, setDueDate] = useState('');
  const [goalId, setGoalId] = useState('');

  useEffect(() => {
    // Keyed by user id (not the user object, which changes on every token refresh).
    let cancelled = false;
    async function load() {
      if (!id || !userId) { setLoading(false); return; }
      setLoading(true);
      setLoadError(null);
      setNotFound(false);
      try {
        const [taskRes, goalsRes] = await Promise.all([
          getTaskById(id, userId),
          listGoals(userId),
        ]);
        if (cancelled) return;

        // 22P02 = malformed uuid in the URL: that task simply does not exist.
        if (taskRes.error && taskRes.error.code !== '22P02') {
          // A network / server error is not "the task was deleted".
          setLoadError(taskRes.error.message);
          return;
        }
        if (!taskRes.data) {
          setNotFound(true);
          return;
        }

        const t = taskRes.data;
        // Keep the linked goal selectable even if it is no longer active,
        // otherwise the select would show "Без цели" while the link is kept on save.
        setGoals(goalsRes.data.filter(g => g.status === 'active' || g.id === t.goal_id));
        setOriginal({ status: t.status, completed_at: t.completed_at ?? null });
        setTitle(t.title);
        setDescription(t.description ?? '');
        setSphere(t.sphere as SphereType);
        setPriority(t.priority);
        setStatus(t.status);
        setDueDate(t.due_date ?? '');
        setGoalId(t.goal_id ?? '');
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [id, userId, reloadKey]);

  async function handleSave() {
    if (busyRef.current || !id || !title.trim() || !userId) return;
    busyRef.current = true;
    setSaving(true);
    try {
      const { error } = await updateTask(id, userId, {
        title: title.trim().slice(0, TASK_TITLE_MAX),
        description: description.trim().slice(0, TASK_DESCRIPTION_MAX) || null,
        sphere,
        priority,
        status,
        due_date: dueDate || null,
        goal_id: goalId || null,
        completed_at: resolveCompletedAt(original ?? { status: 'TODO', completed_at: null }, status, new Date().toISOString()),
      });
      if (error) {
        toast.error('Ошибка при сохранении: ' + error.message);
        return;
      }
      toast.success('Задача сохранена');
      navigate('/tasks');
    } catch (err) {
      toast.error('Ошибка при сохранении: ' + (err instanceof Error ? err.message : 'ошибка сети'));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (busyRef.current || !id || !userId) return;
    if (!confirm('Удалить задачу? Это действие нельзя отменить.')) return;
    busyRef.current = true;
    setDeleting(true);
    try {
      const { error } = await deleteTask(id, userId);
      if (error) {
        toast.error('Ошибка при удалении: ' + error.message);
        return;
      }
      toast.success('Задача удалена');
      navigate('/tasks');
    } catch (err) {
      toast.error('Ошибка при удалении: ' + (err instanceof Error ? err.message : 'ошибка сети'));
    } finally {
      busyRef.current = false;
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="section-header">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold">Редактировать</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!userId || notFound || loadError) {
    const message = !userId
      ? { title: 'Войдите в аккаунт', hint: 'Задачи доступны только после входа' }
      : loadError
        ? { title: 'Не удалось загрузить задачу', hint: loadError }
        : { title: 'Задача не найдена', hint: 'Возможно, она была удалена' };
    return (
      <div className="flex flex-col min-h-screen">
        <div className="section-header">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold">Задача</h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <AlertCircle size={32} className="text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">{message.title}</p>
            <p className="text-xs text-muted-foreground break-words">{message.hint}</p>
            {!userId ? (
              <button onClick={() => navigate('/auth')} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
                Войти
              </button>
            ) : loadError ? (
              <button onClick={() => setReloadKey(k => k + 1)} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
                Повторить
              </button>
            ) : (
              <button onClick={() => navigate('/tasks')} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
                К списку задач
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border/30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold">Редактировать</h1>
        </div>
        <button
          onClick={handleDelete}
          disabled={saving || deleting}
          aria-label="Удалить задачу"
          className="p-2 text-destructive disabled:opacity-50"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-5 max-w-lg mx-auto w-full">
        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Название</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={TASK_TITLE_MAX}
            className="form-input"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={TASK_DESCRIPTION_MAX}
            rows={3}
            className="form-input resize-none"
          />
        </div>

        {/* Goal */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
            <Target size={12} /> Цель
          </label>
          {goals.length === 0 ? (
            <p className="text-xs text-muted-foreground">Нет активных целей</p>
          ) : (
            <select
              value={goalId}
              onChange={e => setGoalId(e.target.value)}
              className="form-input"
            >
              <option value="">Без цели</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          )}
        </div>

        {/* Sphere */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Сфера</label>
          <div className="grid grid-cols-4 gap-2">
            {SPHERES.map(s => (
              <button
                key={s.id}
                onClick={() => setSphere(s.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs ${
                  sphere === s.id ? 'bg-primary/20 ring-1 ring-primary' : 'bg-secondary hover:bg-accent'
                }`}
              >
                <span>{s.icon}</span>
                <span className="truncate w-full text-center">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Приоритет</label>
          <div className="flex gap-2 flex-wrap">
            {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`pill-btn ${priority === p ? 'pill-btn-active' : 'pill-btn-inactive'}`}
              >
                {p === 'LOW' ? 'Низкий' : p === 'MEDIUM' ? 'Средний' : p === 'HIGH' ? 'Высокий' : 'Срочный'}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Статус</label>
          <div className="flex gap-2 flex-wrap">
            {([
              { val: 'TODO', label: 'Не начато' },
              { val: 'IN_PROGRESS', label: 'В процессе' },
              { val: 'DONE', label: 'Готово' },
            ] as const).map(s => (
              <button
                key={s.val}
                onClick={() => setStatus(s.val)}
                className={`pill-btn ${status === s.val ? 'pill-btn-active' : 'pill-btn-inactive'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Due date */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Дедлайн</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="form-input"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={!title.trim() || saving || deleting}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50"
        >
          {saving ? 'Сохраняю...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
