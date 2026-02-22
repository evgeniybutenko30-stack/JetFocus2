import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES, getSphereColor, EMOJI_LIST } from '@/lib/constants';
import { createHabit, createTag, type HabitTagRow } from '@/lib/habitsService';
import type { GoalRow } from '@/lib/goalsService';
import {
  X, ChevronRight, ChevronLeft, Plus, Minus, Check,
  Target, LogIn,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Props {
  goals: GoalRow[];
  tags: HabitTagRow[];
  onClose: () => void;
  onCreated: () => void;
}

type PeriodType = 'none' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: 'none', label: 'Без периода' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
  { value: 'custom', label: 'Свой период' },
];

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
// target_days: 1=Пн..7=Вс

const ICON_OPTIONS = [
  { key: 'sparkle', label: '✨' },
  { key: 'fire', label: '🔥' },
  { key: 'heart', label: '❤️' },
  { key: 'book', label: '📚' },
  { key: 'run', label: '🏃' },
  { key: 'water', label: '💧' },
  { key: 'meditation', label: '🧘' },
  { key: 'money', label: '💰' },
  { key: 'family', label: '👨‍👩‍👧‍👦' },
  { key: 'brain', label: '🧠' },
  { key: 'sleep', label: '😴' },
  { key: 'sport', label: '💪' },
  { key: 'music', label: '🎵' },
  { key: 'art', label: '🎨' },
  { key: 'food', label: '🍎' },
  { key: 'work', label: '💼' },
  { key: 'star', label: '⭐' },
  { key: 'lightning', label: '⚡' },
  { key: 'sun', label: '☀️' },
  { key: 'moon', label: '🌙' },
  { key: 'plant', label: '🌱' },
  { key: 'trophy', label: '🏆' },
  { key: 'phone', label: '📱' },
  { key: 'clock', label: '⏰' },
];

const STEP_TITLES = [
  'Название',
  'Период',
  'Теги',
  'Цель',
  'Сфера',
  'Повторения',
  'Иконка',
  'Дни недели',
];

// ─── Stepper indicator ─────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1 justify-center mb-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === current ? 16 : 6,
            height: 6,
            background: i <= current ? 'hsl(var(--primary))' : 'hsl(var(--border))',
          }}
        />
      ))}
    </div>
  );
}

// ─── Main Wizard ───────────────────────────────────────────────────────────

export default function HabitNewWizard({ goals, tags, onClose, onCreated }: Props) {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [periodType, setPeriodType] = useState<PeriodType>('none');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [localTags, setLocalTags] = useState<HabitTagRow[]>(tags);
  const [goalId, setGoalId] = useState('');
  const [sphere, setSphere] = useState('');
  const [reps, setReps] = useState(1);
  const [icon, setIcon] = useState('sparkle');
  const [targetDays, setTargetDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);

  const totalSteps = STEP_TITLES.length;

  function toggleDay(d: number) {
    setTargetDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()
    );
  }

  function toggleTag(id: string) {
    setSelectedTagIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleCreateTag() {
    if (!user?.id || !newTagName.trim()) return;
    const { data, error } = await createTag(user.id, newTagName.trim());
    if (error) { toast.error(error); return; }
    if (data) {
      setLocalTags(prev => [...prev, data]);
      setSelectedTagIds(prev => [...prev, data.id]);
      setNewTagName('');
      setShowNewTagInput(false);
    }
  }

  function canGoNext(): boolean {
    switch (step) {
      case 0: return title.trim().length >= 2;
      case 4: return sphere !== '';
      case 7: return targetDays.length > 0;
      default: return true;
    }
  }

  async function handleSubmit() {
    if (!user?.id) { setShowGuestPrompt(true); return; }
    if (!sphere || !title.trim()) return;

    setSubmitting(true);
    const { error } = await createHabit({
      user_id: user.id,
      title: title.trim(),
      period_type: periodType,
      period_start: periodType === 'custom' ? periodStart || null : null,
      period_end: periodType === 'custom' ? periodEnd || null : null,
      goal_id: goalId || null,
      life_sphere: sphere,
      repetitions_per_day: reps,
      target_days: targetDays,
      icon,
    }, selectedTagIds);

    setSubmitting(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Привычка создана! 🎉');
    onCreated();
  }

  // ── Step content ──────────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      // ── Step 0: Title ────────────────────────────────────────────────────
      case 0:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Дай привычке понятное название</p>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Например: Читать 20 минут"
              className="w-full bg-secondary rounded-xl px-4 py-3.5 text-sm outline-none border border-transparent focus:border-primary/50 transition-colors"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {['Читать 20 минут', 'Выпить 2 стакана воды', 'Медитация 10 мин', 'Прогулка 30 мин'].map(example => (
                <button key={example}
                  onClick={() => setTitle(example)}
                  className="px-3 py-1.5 bg-secondary text-muted-foreground text-xs rounded-full hover:bg-accent hover:text-foreground transition-colors">
                  {example}
                </button>
              ))}
            </div>
          </div>
        );

      // ── Step 1: Period ────────────────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">На какой период эта привычка?</p>
            <div className="grid grid-cols-2 gap-2">
              {PERIOD_OPTIONS.map(opt => (
                <button key={opt.value}
                  onClick={() => setPeriodType(opt.value)}
                  className={`py-3 rounded-xl text-sm font-medium transition-all ${
                    periodType === opt.value
                      ? 'text-primary-foreground scale-[1.02] shadow-md'
                      : 'bg-secondary text-foreground hover:bg-accent'
                  }`}
                  style={periodType === opt.value ? { background: 'hsl(var(--primary))' } : {}}>
                  {opt.label}
                </button>
              ))}
            </div>
            {periodType === 'custom' && (
              <div className="space-y-2 pt-1">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Начало</label>
                  <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                    className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none border border-transparent focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Конец</label>
                  <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                    min={periodStart}
                    className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none border border-transparent focus:border-primary/50" />
                </div>
              </div>
            )}
          </div>
        );

      // ── Step 2: Tags ──────────────────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Когда выполняется привычка?</p>
            <div className="flex flex-wrap gap-2">
              {localTags.map(t => (
                <button key={t.id}
                  onClick={() => toggleTag(t.id)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedTagIds.includes(t.id)
                      ? 'text-primary-foreground scale-[1.02]'
                      : 'bg-secondary text-foreground hover:bg-accent'
                  }`}
                  style={selectedTagIds.includes(t.id) ? { background: 'hsl(var(--primary))' } : {}}>
                  {t.name}
                  {selectedTagIds.includes(t.id) && <Check size={12} className="inline ml-1.5" />}
                </button>
              ))}
              <button
                onClick={() => setShowNewTagInput(!showNewTagInput)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm bg-secondary text-muted-foreground hover:bg-accent transition-colors">
                <Plus size={13} /> Создать тег
              </button>
            </div>
            {showNewTagInput && (
              <div className="flex gap-2 mt-2">
                <input
                  autoFocus
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
                  placeholder="Название тега"
                  className="flex-1 bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-transparent focus:border-primary/50"
                />
                <button onClick={handleCreateTag}
                  disabled={!newTagName.trim()}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 transition-all"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                  Добавить
                </button>
              </div>
            )}
          </div>
        );

      // ── Step 3: Goal ──────────────────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Привяжи к цели (необязательно)</p>
            <button
              onClick={() => setGoalId('')}
              className={`w-full py-3 rounded-xl text-sm font-medium text-left px-4 transition-all ${
                !goalId ? 'text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-accent'
              }`}
              style={!goalId ? { background: 'hsl(var(--primary))' } : {}}>
              Без цели
            </button>
            {goals.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="text-3xl mb-2">🎯</div>
                <p className="text-sm text-muted-foreground mb-3">У тебя нет целей</p>
                <button
                  onClick={() => { onClose(); navigate('/goals/new'); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                  <Target size={14} /> Создать цель
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {goals.map(g => (
                  <button key={g.id}
                    onClick={() => setGoalId(g.id === goalId ? '' : g.id)}
                    className={`w-full py-3 rounded-xl text-sm font-medium text-left px-4 transition-all flex items-center gap-2 ${
                      goalId === g.id ? 'text-primary-foreground' : 'bg-secondary text-foreground hover:bg-accent'
                    }`}
                    style={goalId === g.id ? { background: 'hsl(var(--primary))' } : {}}>
                    <Target size={13} className="flex-shrink-0" />
                    <span className="truncate">{g.title}</span>
                    {goalId === g.id && <Check size={14} className="ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      // ── Step 4: Sphere ────────────────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Выбери сферу жизни <span className="text-destructive">*</span></p>
            <div className="grid grid-cols-2 gap-2">
              {SPHERES.map(s => {
                const color = getSphereColor(s.id as Parameters<typeof getSphereColor>[0]);
                const active = sphere === s.id;
                return (
                  <button key={s.id}
                    onClick={() => setSphere(s.id)}
                    className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-medium transition-all text-left ${
                      active ? 'scale-[1.02] text-white' : 'bg-secondary text-foreground hover:bg-accent'
                    }`}
                    style={active ? { background: color, boxShadow: `0 4px 16px ${color}40` } : {}}>
                    <span className="text-xl">{s.icon}</span>
                    <span>{s.name}</span>
                    {active && <Check size={14} className="ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>
        );

      // ── Step 5: Reps ──────────────────────────────────────────────────────
      case 5:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Сколько раз в день выполняется привычка?</p>
            <div className="flex items-center justify-center gap-5 py-4">
              <button
                onClick={() => setReps(Math.max(1, reps - 1))}
                className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground hover:bg-accent transition-colors">
                <Minus size={18} />
              </button>
              <div className="w-20 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold"
                style={{ background: 'hsl(var(--primary)/0.15)', color: 'hsl(var(--primary))' }}>
                {reps}
              </div>
              <button
                onClick={() => setReps(Math.min(20, reps + 1))}
                className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground hover:bg-accent transition-colors">
                <Plus size={18} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {reps === 1 ? 'Одно выполнение в день' : `${reps} выполнения в день`}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[1, 2, 3, 5, 8, 10].map(n => (
                <button key={n} onClick={() => setReps(n)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    reps === n ? 'text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-accent'
                  }`}
                  style={reps === n ? { background: 'hsl(var(--primary))' } : {}}>
                  ×{n}
                </button>
              ))}
            </div>
          </div>
        );

      // ── Step 6: Icon ──────────────────────────────────────────────────────
      case 6:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Выбери иконку</p>
            <div className="grid grid-cols-6 gap-2">
              {ICON_OPTIONS.map(opt => (
                <button key={opt.key}
                  onClick={() => setIcon(opt.key)}
                  className={`h-12 rounded-xl text-2xl flex items-center justify-center transition-all ${
                    icon === opt.key
                      ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'bg-secondary hover:bg-accent hover:scale-105'
                  }`}
                  style={icon === opt.key ? { background: 'hsl(var(--primary)/0.15)' } : {}}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        );

      // ── Step 7: Target days ───────────────────────────────────────────────
      case 7:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Выбери дни недели для выполнения</p>
            <div className="flex gap-2 justify-center">
              {DAY_LABELS.map((label, i) => {
                const day = i + 1; // 1=Пн..7=Вс
                const active = targetDays.includes(day);
                return (
                  <button key={day}
                    onClick={() => toggleDay(day)}
                    className={`w-10 h-10 rounded-xl text-xs font-semibold transition-all ${
                      active ? 'text-primary-foreground scale-105' : 'bg-secondary text-muted-foreground hover:bg-accent'
                    }`}
                    style={active ? { background: 'hsl(var(--primary))' } : {}}>
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 justify-center pt-1">
              <button
                onClick={() => setTargetDays([1, 2, 3, 4, 5, 6, 7])}
                className="px-4 py-2 bg-secondary text-muted-foreground text-xs rounded-xl hover:bg-accent transition-colors">
                Каждый день
              </button>
              <button
                onClick={() => setTargetDays([1, 2, 3, 4, 5])}
                className="px-4 py-2 bg-secondary text-muted-foreground text-xs rounded-xl hover:bg-accent transition-colors">
                Будни
              </button>
              <button
                onClick={() => setTargetDays([6, 7])}
                className="px-4 py-2 bg-secondary text-muted-foreground text-xs rounded-xl hover:bg-accent transition-colors">
                Выходные
              </button>
            </div>
            {targetDays.length === 0 && (
              <p className="text-xs text-destructive text-center">Выбери хотя бы один день</p>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  if (!user?.id) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-sm rounded-3xl p-6 animate-scale-in text-center"
          style={{ background: 'hsl(var(--card))' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-3">
            <LogIn size={28} className="text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-1">Войдите для создания привычек</h2>
          <p className="text-sm text-muted-foreground mb-5">Данные гостя не сохраняются в облаке.</p>
          <button onClick={() => { onClose(); navigate('/auth'); }}
            className="w-full py-3 rounded-xl font-semibold text-sm"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
            Войти или зарегистрироваться
          </button>
          <button onClick={onClose} className="w-full py-2.5 mt-2 text-muted-foreground text-sm">
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden animate-fade-in"
        style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border)/0.4)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border/60" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
              Шаг {step + 1} из {totalSteps}
            </p>
            <h2 className="text-lg font-bold">{STEP_TITLES[step]}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Progress dots */}
        <div className="px-5">
          <StepDots total={totalSteps} current={step} />
        </div>

        {/* Step content */}
        <div className="px-5 pb-5 overflow-y-auto" style={{ maxHeight: '55vh' }}>
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="px-5 pb-6 pt-2 flex gap-2 border-t border-border/30">
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-accent transition-colors">
              <ChevronLeft size={16} /> Назад
            </button>
          ) : (
            <button onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-secondary text-muted-foreground text-sm font-medium hover:bg-accent transition-colors">
              Отмена
            </button>
          )}

          {step < totalSteps - 1 ? (
            <button
              onClick={() => canGoNext() && setStep(s => s + 1)}
              disabled={!canGoNext()}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              Далее <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || !canGoNext() || !sphere || title.trim().length < 2}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              {submitting ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <><Check size={16} /> Создать привычку</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
