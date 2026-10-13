import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES, getSphereColor } from '@/lib/constants';
import {
  getHabitById, updateHabit, deleteHabit, ensureDefaultTags, validateHabitPeriod,
  HABIT_TITLE_MAX,
  type HabitTagRow, type HabitPeriodType,
} from '@/lib/habitsService';
import { ArrowLeft, Trash2, Check, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────────────

type PeriodType = HabitPeriodType;
type LoadState = 'loading' | 'ready' | 'not_found' | 'error' | 'guest';

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: 'none', label: 'Без периода' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
  { value: 'custom', label: 'Свой период' },
];

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const ICON_OPTIONS = [
  { key: 'sparkle', label: '✨' }, { key: 'fire', label: '🔥' },
  { key: 'heart', label: '❤️' }, { key: 'book', label: '📚' },
  { key: 'run', label: '🏃' }, { key: 'water', label: '💧' },
  { key: 'meditation', label: '🧘' }, { key: 'money', label: '💰' },
  { key: 'family', label: '👨‍👩‍👧‍👦' }, { key: 'brain', label: '🧠' },
  { key: 'sleep', label: '😴' }, { key: 'sport', label: '💪' },
  { key: 'music', label: '🎵' }, { key: 'art', label: '🎨' },
  { key: 'food', label: '🍎' }, { key: 'work', label: '💼' },
  { key: 'star', label: '⭐' }, { key: 'lightning', label: '⚡' },
  { key: 'sun', label: '☀️' }, { key: 'moon', label: '🌙' },
  { key: 'plant', label: '🌱' }, { key: 'trophy', label: '🏆' },
  { key: 'phone', label: '📱' }, { key: 'clock', label: '⏰' },
];

// ─── Delete Confirm ────────────────────────────────────────────────────────

function DeleteConfirm({ busy, onConfirm, onCancel }: { busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => { if (!busy) onCancel(); }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-3xl p-6 animate-scale-in text-center"
        style={{ background: 'hsl(var(--card))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-4xl mb-3">🗑️</div>
        <h3 className="text-base font-bold mb-2">Удалить привычку?</h3>
        <p className="text-sm text-muted-foreground mb-5">
          Всё, включая историю выполнений, будет удалено навсегда.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={busy}
            className="flex-1 py-3 rounded-xl text-sm font-medium bg-secondary disabled:opacity-50">Отмена</button>
          <button onClick={onConfirm} disabled={busy}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'hsl(var(--destructive))' }}>
            {busy ? 'Удаление…' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function HabitEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [allTags, setAllTags] = useState<HabitTagRow[]>([]);

  // Form state
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('sparkle');
  const [sphere, setSphere] = useState('');
  const [periodType, setPeriodType] = useState<PeriodType>('none');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reps, setReps] = useState(1);
  const [targetDays, setTargetDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) { setLoadState('guest'); return; }
    if (!id) { setLoadState('not_found'); return; }

    // Ignore a response that arrives after unmount / after navigating to another habit.
    let cancelled = false;

    async function load(habitId: string, uid: string) {
      setLoadState('loading');
      try {
        const [{ data: habit, error }, tags] = await Promise.all([
          getHabitById(habitId, uid),
          // Tags are optional for editing — a failure must not block the form.
          ensureDefaultTags(uid).catch((): HabitTagRow[] => []),
        ]);
        if (cancelled) return;
        if (error) { setLoadState('error'); return; }
        if (!habit) { setLoadState('not_found'); return; }

        const habitTags = habit.tags ?? [];
        const known = new Set(tags.map(t => t.id));
        setAllTags([...tags, ...habitTags.filter(t => !known.has(t.id))]);
        setTitle(habit.title);
        setIcon(habit.icon);
        setSphere(habit.life_sphere);
        setPeriodType(habit.period_type);
        setPeriodStart(habit.period_start ?? '');
        setPeriodEnd(habit.period_end ?? '');
        setReps(habit.repetitions_per_day);
        setTargetDays(habit.target_days ?? [1, 2, 3, 4, 5, 6, 7]);
        setSelectedTagIds(habitTags.map(t => t.id));
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    }

    void load(id, userId);
    return () => { cancelled = true; };
  }, [id, userId, reloadKey]);

  /** Back within the app; a deep-linked page (no in-app history) goes to the list. */
  function goBack() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/habits');
  }

  function toggleDay(d: number) {
    setTargetDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => prev.includes(tagId) ? prev.filter(x => x !== tagId) : [...prev, tagId]);
  }

  const periodError = validateHabitPeriod(periodType, periodStart, periodEnd);

  function invalidateHabits() {
    qc.invalidateQueries({ queryKey: ['habits'] });
    qc.invalidateQueries({ queryKey: ['habit_completions'] });
  }

  async function handleSave() {
    if (!id || !userId || !title.trim() || !sphere || targetDays.length === 0 || saving) return;
    if (periodError) { toast.error(periodError); return; }
    setSaving(true);
    try {
      const { error, warning } = await updateHabit(id, userId, {
        title: title.trim().slice(0, HABIT_TITLE_MAX),
        icon,
        life_sphere: sphere,
        period_type: periodType,
        period_start: periodType === 'custom' ? periodStart || null : null,
        period_end: periodType === 'custom' ? periodEnd || null : null,
        repetitions_per_day: reps,
        target_days: targetDays,
      }, selectedTagIds);

      if (error) { toast.error(error); return; }
      invalidateHabits();
      toast.success('Привычка сохранена');
      if (warning) toast.warning(warning);
      navigate('/habits');
    } catch {
      toast.error('Не удалось сохранить привычку. Проверьте соединение.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || !userId || deleting) return;
    setDeleting(true);
    try {
      const { error } = await deleteHabit(id, userId);
      if (error) { toast.error(error); return; }
      invalidateHabits();
      toast.success('Привычка удалена');
      navigate('/habits');
    } catch {
      toast.error('Не удалось удалить привычку. Проверьте соединение.');
    } finally {
      setDeleting(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <div className="flex flex-col min-h-screen pb-20">
        <div className="flex items-center px-4 h-14 border-b border-border/30">
          <div className="h-5 w-40 bg-secondary rounded animate-pulse" />
        </div>
        <div className="px-4 pt-4 space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-secondary rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (loadState !== 'ready') {
    const message = loadState === 'guest'
      ? { emoji: '🔒', title: 'Войдите в аккаунт', text: 'Редактировать привычки можно после входа.' }
      : loadState === 'not_found'
        ? { emoji: '🔍', title: 'Привычка не найдена', text: 'Возможно, она была удалена.' }
        : { emoji: '⚠️', title: 'Ошибка загрузки', text: 'Не удалось загрузить привычку. Проверьте соединение.' };
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pb-28 px-6 text-center">
        <div className="text-4xl mb-3">{message.emoji}</div>
        <h3 className="text-base font-semibold mb-1">{message.title}</h3>
        <p className="text-sm text-muted-foreground mb-5">{message.text}</p>
        <div className="flex gap-2">
          {loadState === 'error' && (
            <button onClick={() => setReloadKey(k => k + 1)}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
              Повторить
            </button>
          )}
          <button onClick={() => navigate(loadState === 'guest' ? '/auth' : '/habits')}
            className="px-5 py-2.5 bg-secondary text-foreground rounded-xl text-sm font-medium">
            {loadState === 'guest' ? 'Войти' : 'К привычкам'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-24">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border/30">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold">Редактировать</h1>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-6 max-w-lg mx-auto w-full overflow-y-auto">

        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Название *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={HABIT_TITLE_MAX}
            className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none border border-transparent focus:border-primary/50 transition-colors"
            placeholder="Название привычки"
          />
        </div>

        {/* Icon */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-medium">Иконка</label>
          <div className="grid grid-cols-8 gap-1.5">
            {ICON_OPTIONS.map(opt => (
              <button key={opt.key}
                onClick={() => setIcon(opt.key)}
                className={`h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                  icon === opt.key
                    ? 'scale-110 ring-2 ring-primary ring-offset-1 ring-offset-background'
                    : 'bg-secondary hover:bg-accent'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sphere */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-medium">Сфера жизни *</label>
          <div className="grid grid-cols-2 gap-2">
            {SPHERES.map(s => {
              const color = getSphereColor(s.id as Parameters<typeof getSphereColor>[0]);
              const active = sphere === s.id;
              return (
                <button key={s.id}
                  onClick={() => setSphere(s.id)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl text-sm font-medium transition-all text-left ${
                    active ? 'text-white' : 'bg-secondary text-foreground hover:bg-accent'
                  }`}
                  style={active ? { background: color } : {}}>
                  <span>{s.icon}</span>
                  <span>{s.name}</span>
                  {active && <Check size={13} className="ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Period */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-medium">Период</label>
          <div className="grid grid-cols-3 gap-2">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.value}
                onClick={() => setPeriodType(opt.value)}
                className={`py-2.5 rounded-xl text-xs font-medium transition-all ${
                  periodType === opt.value ? 'text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-accent'
                }`}
                style={periodType === opt.value ? { background: 'hsl(var(--primary))' } : {}}>
                {opt.label}
              </button>
            ))}
          </div>
          {periodType === 'custom' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">Начало</label>
                <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                  className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">Конец</label>
                <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                  min={periodStart}
                  className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
            </div>
          )}
          {periodError && (
            <p className="text-xs text-destructive mt-1.5">{periodError}</p>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-medium">Теги</label>
          <div className="flex flex-wrap gap-2">
            {allTags.map(t => (
              <button key={t.id}
                onClick={() => toggleTag(t.id)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  selectedTagIds.includes(t.id) ? 'text-primary-foreground' : 'bg-secondary text-foreground hover:bg-accent'
                }`}
                style={selectedTagIds.includes(t.id) ? { background: 'hsl(var(--primary))' } : {}}>
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Reps */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-medium">Повторений в день</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setReps(Math.max(1, reps - 1))}
              className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center hover:bg-accent transition-colors">
              <Minus size={16} />
            </button>
            <div className="w-16 h-10 rounded-xl flex items-center justify-center text-base font-bold"
              style={{ background: 'hsl(var(--primary)/0.15)', color: 'hsl(var(--primary))' }}>
              {reps}
            </div>
            <button onClick={() => setReps(Math.min(20, reps + 1))}
              className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center hover:bg-accent transition-colors">
              <Plus size={16} />
            </button>
            <span className="text-sm text-muted-foreground">раз</span>
          </div>
        </div>

        {/* Target days */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-medium">Дни недели</label>
          <div className="flex gap-2">
            {DAY_LABELS.map((label, i) => {
              const day = i + 1;
              const active = targetDays.includes(day);
              return (
                <button key={day}
                  onClick={() => toggleDay(day)}
                  className={`flex-1 h-10 rounded-xl text-xs font-semibold transition-all ${
                    active ? 'text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-accent'
                  }`}
                  style={active ? { background: 'hsl(var(--primary))' } : {}}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !sphere || targetDays.length === 0 || periodError !== null}
            className="w-full py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
            {saving ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                Сохранение...
              </div>
            ) : 'Сохранить'}
          </button>
          <button onClick={goBack}
            className="w-full py-3 rounded-xl text-sm font-medium bg-secondary text-foreground hover:bg-accent transition-colors">
            Отмена
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirm
          busy={deleting}
          onConfirm={() => { void handleDelete(); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
