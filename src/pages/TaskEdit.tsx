import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES } from '@/lib/constants';
import { getTaskById, updateTask, deleteTask } from '@/lib/tasksService';
import { listGoals, type GoalRow } from '@/lib/goalsService';
import { ArrowLeft, Trash2, Target, AlertCircle } from 'lucide-react';
import type { SphereType } from '@/lib/types';
import { toast } from 'sonner';

export default function TaskEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goals, setGoals] = useState<GoalRow[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sphere, setSphere] = useState<SphereType>('career');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [status, setStatus] = useState<'TODO' | 'IN_PROGRESS' | 'DONE'>('TODO');
  const [dueDate, setDueDate] = useState('');
  const [goalId, setGoalId] = useState('');

  const fetchData = useCallback(async () => {
    if (!id || !user) { setLoading(false); return; }

    const [taskRes, goalsRes] = await Promise.all([
      getTaskById(id, user.id),
      listGoals(user.id),
    ]);

    setGoals(goalsRes.data.filter(g => g.status === 'active'));

    if (taskRes.error || !taskRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const t = taskRes.data;
    setTitle(t.title);
    setDescription(t.description ?? '');
    setSphere(t.sphere as SphereType);
    setPriority(t.priority);
    setStatus(t.status as 'TODO' | 'IN_PROGRESS' | 'DONE');
    setDueDate(t.due_date ?? '');
    setGoalId(t.goal_id ?? '');
    setLoading(false);
  }, [id, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave() {
    if (!id || !title.trim() || !user) return;
    setSaving(true);
    const { error } = await updateTask(id, user.id, {
      title: title.trim(),
      description: description.trim() || null,
      sphere,
      priority,
      status,
      due_date: dueDate || null,
      goal_id: goalId || null,
      completed_at: status === 'DONE' ? new Date().toISOString() : null,
    });
    setSaving(false);
    if (error) {
      toast.error('Ошибка при сохранении: ' + error.message);
      return;
    }
    toast.success('Задача сохранена');
    navigate('/tasks');
  }

  async function handleDelete() {
    if (!id || !user) return;
    if (!confirm('Удалить задачу? Это действие нельзя отменить.')) return;
    const { error } = await deleteTask(id, user.id);
    if (error) {
      toast.error('Ошибка при удалении: ' + error.message);
      return;
    }
    toast.success('Задача удалена');
    navigate('/tasks');
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

  if (notFound) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="section-header">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold">Задача</h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <AlertCircle size={32} className="text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">Задача не найдена</p>
            <p className="text-xs text-muted-foreground">Возможно, она была удалена</p>
            <button onClick={() => navigate('/tasks')} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
              К списку задач
            </button>
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
        <button onClick={handleDelete} className="p-2 text-destructive">
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
            className="form-input"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
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
          disabled={!title.trim() || saving}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50"
        >
          {saving ? 'Сохраняю...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
