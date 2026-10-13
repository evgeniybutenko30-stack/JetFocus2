import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES, TASK_CATEGORIES, getTodayStr, EMOJI_LIST, COLOR_LIST } from '@/lib/constants';
import {
  createTask, addUniqueTag,
  TASK_TITLE_MAX, TASK_DESCRIPTION_MAX, TASK_SUBTASK_MAX, TASK_TAG_MAX,
} from '@/lib/tasksService';
import { listGoals, type GoalRow } from '@/lib/goalsService';
import { ArrowLeft, Plus, X, Target } from 'lucide-react';
import type { SphereType } from '@/lib/types';
import { toast } from 'sonner';

const TAG_PRESETS = ['Срочно', 'Важно', 'Позже'];
const RECURRENCE_OPTIONS = [
  { value: 'NONE', label: 'Нет' },
  { value: 'DAILY', label: 'Ежедневно' },
  { value: 'WEEKLY', label: 'Еженедельно' },
  { value: 'MONTHLY', label: 'Ежемесячно' },
];

export default function TaskNewPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sphere, setSphere] = useState<SphereType | null>(null);
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [status, setStatus] = useState<'TODO' | 'IN_PROGRESS' | 'DONE'>('TODO');
  const [dueDate, setDueDate] = useState(getTodayStr());
  const [recurrence, setRecurrence] = useState('NONE');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [category, setCategory] = useState('');
  const [goalId, setGoalId] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>(['']);
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [showIcons, setShowIcons] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [sphereError, setSphereError] = useState(false);
  const [saving, setSaving] = useState(false);
  // Synchronous double-submit guard (state updates land only after the next render).
  const savingRef = useRef(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    async function loadGoals() {
      if (!userId) { setGoalsLoading(false); return; }
      const { data } = await listGoals(userId);
      if (cancelled) return;
      setGoals(data.filter(g => g.status === 'active'));
      setGoalsLoading(false);
    }
    void loadGoals();
    return () => { cancelled = true; };
  }, [userId]);

  function addTag(raw: string) {
    setTags(prev => addUniqueTag(prev, raw));
    setNewTag('');
  }

  async function handleSubmit() {
    if (savingRef.current || !title.trim()) return;
    if (!sphere) { setSphereError(true); return; }
    if (!user) {
      toast.error('Войдите в аккаунт, чтобы сохранять задачи', {
        action: { label: 'Войти', onClick: () => navigate('/auth') },
      });
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const { error } = await createTask({
        user_id: user.id,
        title: title.trim().slice(0, TASK_TITLE_MAX),
        description: description.trim().slice(0, TASK_DESCRIPTION_MAX) || null,
        sphere,
        priority,
        status,
        due_date: dueDate || null,
        tags: tags.length > 0 ? tags : null,
        category: category || null,
        goal_id: goalId || null,
        recurrence: recurrence || null,
        subtasks: subtasks
          .filter(s => s.trim())
          .map(s => ({ id: crypto.randomUUID(), title: s.trim().slice(0, TASK_SUBTASK_MAX), done: false })),
        icon: icon || null,
        color: color || null,
        completed_at: status === 'DONE' ? new Date().toISOString() : null,
      });

      if (error) {
        toast.error('Ошибка при создании задачи: ' + error.message);
        return;
      }
      toast.success('Задача создана');
      navigate('/tasks');
    } catch (err) {
      toast.error('Ошибка при создании задачи: ' + (err instanceof Error ? err.message : 'ошибка сети'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="section-header">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">Новая задача</h1>
      </div>

      <div className="flex-1 px-4 py-4 space-y-5 max-w-lg mx-auto w-full fade-in overflow-auto">
        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Название задачи *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={TASK_TITLE_MAX}
            placeholder="Подготовить отчёт"
            className="form-input"
          />
        </div>

        {/* Due date */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Срок выполнения</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="form-input"
          />
        </div>

        {/* Goal */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
            <Target size={12} /> Привязать к цели
          </label>
          {goalsLoading ? (
            <div className="form-input text-muted-foreground text-sm">Загрузка целей...</div>
          ) : goals.length === 0 ? (
            <div className="p-3 rounded-xl bg-secondary/60 text-xs text-muted-foreground">
              Нет активных целей. <button onClick={() => navigate('/goals/new')} className="text-primary underline">Создай цель</button>, чтобы привязать задачу.
            </div>
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
          <label className="text-xs text-muted-foreground mb-2 block">
            Сфера жизни *
            {sphereError && <span className="text-destructive ml-1">— обязательное поле</span>}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {SPHERES.map(s => (
              <button
                key={s.id}
                onClick={() => { setSphere(s.id); setSphereError(false); }}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-colors ${
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
            {([
              { val: 'LOW', label: 'Низкий' },
              { val: 'MEDIUM', label: 'Средний' },
              { val: 'HIGH', label: 'Высокий' },
              { val: 'URGENT', label: 'Срочный' },
            ] as const).map(p => (
              <button
                key={p.val}
                onClick={() => setPriority(p.val)}
                className={`pill-btn ${priority === p.val ? 'pill-btn-active' : 'pill-btn-inactive'}`}
              >
                {p.label}
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

        {/* Recurrence */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Повторение</label>
          <div className="flex gap-2 flex-wrap">
            {RECURRENCE_OPTIONS.map(r => (
              <button
                key={r.value}
                onClick={() => setRecurrence(r.value)}
                className={`pill-btn ${recurrence === r.value ? 'pill-btn-active' : 'pill-btn-inactive'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={TASK_DESCRIPTION_MAX}
            rows={2}
            placeholder="Описание задачи..."
            className="form-input resize-none"
          />
        </div>

        {/* Subtasks */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Подзадачи</label>
          {subtasks.map((s, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                value={s}
                onChange={e => { const n = [...subtasks]; n[i] = e.target.value; setSubtasks(n); }}
                maxLength={TASK_SUBTASK_MAX}
                placeholder={`Подзадача ${i + 1}`}
                className="form-input flex-1"
              />
              {subtasks.length > 1 && (
                <button onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))} className="p-2 text-muted-foreground">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button onClick={() => setSubtasks([...subtasks, ''])} className="flex items-center gap-1 text-xs text-primary">
            <Plus size={14} /> Добавить
          </button>
        </div>

        {/* Category */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Категория</label>
          <div className="flex flex-wrap gap-2">
            {TASK_CATEGORIES.map(c => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id === category ? '' : c.id)}
                className={`pill-btn ${category === c.id ? 'pill-btn-active' : 'pill-btn-inactive'}`}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Теги</label>
          <div className="flex flex-wrap gap-2">
            {TAG_PRESETS.map(t => (
              <button
                key={t}
                onClick={() => tags.includes(t) ? setTags(tags.filter(x => x !== t)) : setTags(prev => addUniqueTag(prev, t))}
                className={`pill-btn ${tags.includes(t) ? 'pill-btn-active' : 'pill-btn-inactive'}`}
              >
                #{t}
              </button>
            ))}
            <div className="flex gap-1">
              <input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                maxLength={TASK_TAG_MAX}
                placeholder="+ свой тег"
                className="w-24 text-xs bg-secondary rounded-lg px-2 py-1"
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTag.trim()) addTag(newTag);
                }}
              />
              {newTag.trim() && (
                <button onClick={() => addTag(newTag)} className="text-xs text-primary">
                  ✓
                </button>
              )}
            </div>
          </div>
          {tags.filter(t => !TAG_PRESETS.includes(t)).map(t => (
            <span key={t} className="inline-flex items-center gap-1 mr-1 mt-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
              #{t} <button onClick={() => setTags(tags.filter(x => x !== t))}><X size={10} /></button>
            </span>
          ))}
        </div>

        {/* Icon & Color */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Иконка</label>
            <button onClick={() => setShowIcons(!showIcons)} className="form-input text-center">
              {icon || '🎯'}
            </button>
            {showIcons && (
              <div className="grid grid-cols-8 gap-1 mt-1 p-2 bg-secondary rounded-lg">
                {EMOJI_LIST.map(e => (
                  <button key={e} onClick={() => { setIcon(e); setShowIcons(false); }} className="text-lg p-1 hover:bg-accent rounded">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Цвет</label>
            <button onClick={() => setShowColors(!showColors)} className="form-input text-center">
              <div className="w-6 h-6 rounded-full mx-auto" style={{ background: color || '#1BDEAC' }} />
            </button>
            {showColors && (
              <div className="grid grid-cols-7 gap-1 mt-1 p-2 bg-secondary rounded-lg">
                {COLOR_LIST.map(c => (
                  <button key={c} onClick={() => { setColor(c); setShowColors(false); }} className="w-7 h-7 rounded-full" style={{ background: c }} />
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!title.trim() || saving}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50 transition-opacity"
        >
          {saving ? 'Создаю...' : 'Создать задачу'}
        </button>
      </div>
    </div>
  );
}
