import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { SPHERES, getSphereColor, getTodayStr } from '@/lib/constants';
import {
  listHabits, listCompletions, listTags, ensureDefaultTags,
  incrementCompletion, resetCompletion, getStarsSummary, calculateStreak, isHabitActiveToday,
  HabitsTableMissingError,
  type HabitWithTags, type HabitCompletionRow, type HabitTagRow, type StarsSummary,
} from '@/lib/habitsService';
import { listGoals, type GoalRow } from '@/lib/goalsService';
import {
  Plus, Calendar as CalendarIcon, TrendingUp, List, ChevronLeft, ChevronRight,
  Flame, RotateCcw, MoreHorizontal, Pencil, Trash2, Target, Search, X, Copy, ExternalLink,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek,
  addMonths, subMonths, subDays, startOfISOWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { toast } from 'sonner';
import HabitNewWizard from './HabitNew';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabType = 'habits' | 'calendar' | 'progress';

// ─── Colors (using getSphereColor from constants) ─────────────────────────────

function sphereColor(sphere: string): string {
  return getSphereColor(sphere as Parameters<typeof getSphereColor>[0]);
}

// ─── Stars Block ─────────────────────────────────────────────────────────────

function StarsBlock({ stars }: { stars: StarsSummary }) {
  return (
    <div className="mx-4 mb-3 rounded-2xl p-3 flex items-center gap-3"
      style={{ background: 'hsl(var(--secondary)/0.7)', border: '1px solid hsl(var(--border)/0.4)' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
        style={{ background: 'hsl(38 92% 50% / 0.15)' }}>
        ⭐
      </div>
      <div className="flex gap-4 flex-1">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">Сегодня</span>
          <span className="text-sm font-bold text-foreground">{stars.today}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">7 дней</span>
          <span className="text-sm font-bold text-foreground">{stars.week}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">Всего</span>
          <span className="text-sm font-bold" style={{ color: 'hsl(38 92% 50%)' }}>{stars.total}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Habit Card ───────────────────────────────────────────────────────────────

const ICON_DISPLAY_MAP: Record<string, string> = {
  sparkle: '✨', fire: '🔥', heart: '❤️', book: '📚', run: '🏃', water: '💧',
  meditation: '🧘', money: '💰', family: '👨‍👩‍👧‍👦', brain: '🧠', sleep: '😴',
  sport: '💪', music: '🎵', art: '🎨', food: '🍎', work: '💼',
  star: '⭐', lightning: '⚡', sun: '☀️', moon: '🌙', plant: '🌱',
  trophy: '🏆', phone: '📱', clock: '⏰',
};

function HabitCard({
  habit, completion, streak, onIncrement, onReset, onEdit, onDelete, onAddToCalendar,
}: {
  habit: HabitWithTags;
  completion?: HabitCompletionRow;
  streak: number;
  onIncrement: () => void;
  onReset: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddToCalendar: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const color = sphereColor(habit.life_sphere);
  const sphere = SPHERES.find(s => s.id === habit.life_sphere);
  const count = completion?.count ?? 0;
  const maxCount = habit.repetitions_per_day;
  const isDone = count >= maxCount;
  const progress = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const iconDisplay = ICON_DISPLAY_MAP[habit.icon] ?? habit.icon ?? '✨';

  function openMenu() {
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setMenuOpen(true);
  }

  function closeMenu() {
    setMenuOpen(false);
    setMenuPos(null);
  }

  async function handleClick() {
    if (isDone) return;
    setPressed(true);
    setTimeout(() => setPressed(false), 400);
    onIncrement();
  }

  return (
    <>
      <div
        className={`relative rounded-[20px] p-4 flex items-center gap-3 transition-all duration-300 ${
          pressed ? 'scale-[1.02]' : isDone ? 'opacity-80 scale-[0.99]' : 'hover:scale-[1.01]'
        }`}
        style={{
          background: `hsl(var(--secondary)/0.7)`,
          boxShadow: isDone ? `0 2px 16px ${color}25` : `0 2px 12px ${color}10`,
          border: `1px solid ${color}22`,
          overflow: 'visible',
        }}
      >
        {/* Left accent */}
        <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
          style={{ backgroundColor: color }} />

        {/* Progress bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-[20px] overflow-hidden"
          style={{ background: 'hsl(var(--border)/0.2)' }}>
          <div className="h-full transition-all duration-500 rounded-full"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
        </div>

        {/* Icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
          style={{ backgroundColor: `${color}18` }}>
          {iconDisplay}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {habit.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {streak > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] font-medium text-orange-500">
                <Flame size={10} /> {streak}
              </span>
            )}
            {sphere && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: `${color}20`, color }}>
                {sphere.icon} {sphere.name}
              </span>
            )}
            {habit.tags.slice(0, 2).map(t => (
              <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-border/30 text-muted-foreground">
                {t.name}
              </span>
            ))}
            <span className="text-[10px] text-muted-foreground ml-auto">{count}/{maxCount}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Menu button */}
          <button
            ref={menuBtnRef}
            onClick={openMenu}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-border/30 transition-all"
          >
            <MoreHorizontal size={14} />
          </button>

          {/* Complete button */}
          <button
            onClick={handleClick}
            disabled={isDone}
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
              isDone ? 'scale-100' : 'hover:scale-105 active:scale-95'
            }`}
            style={{
              backgroundColor: isDone ? color : `${color}18`,
              border: `2px solid ${isDone ? color : `${color}40`}`,
              boxShadow: isDone ? `0 0 14px ${color}50` : 'none',
            }}
          >
            <span className="text-sm font-bold" style={{ color: isDone ? 'white' : color }}>
              {isDone ? '✓' : count > 0 ? `${count}` : '○'}
            </span>
          </button>
        </div>
      </div>

      {/* Fixed-position menu portal — never clipped by parent overflow */}
      {menuOpen && menuPos && (
        <>
          <div className="fixed inset-0 z-[500]" onClick={closeMenu} />
          <div
            className="fixed z-[501] rounded-2xl shadow-2xl border border-border/40 py-1"
            style={{
              top: menuPos.top,
              right: menuPos.right,
              minWidth: 200,
              background: 'hsl(var(--card))',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { closeMenu(); onEdit(); }}
              className="flex items-center gap-3 px-4 py-3 text-sm w-full text-left hover:bg-accent transition-colors font-medium text-foreground"
            >
              <Pencil size={15} className="text-muted-foreground flex-shrink-0" />
              Редактировать
            </button>
            <button
              onClick={() => { closeMenu(); onAddToCalendar(); }}
              className="flex items-center gap-3 px-4 py-3 text-sm w-full text-left hover:bg-accent transition-colors font-medium text-foreground"
            >
              <ExternalLink size={15} className="text-muted-foreground flex-shrink-0" />
              Добавить в Google Календарь
            </button>
            <div className="h-px mx-3 my-1" style={{ background: 'hsl(var(--border)/0.5)' }} />
            <button
              onClick={() => { closeMenu(); onReset(); }}
              className="flex items-center gap-3 px-4 py-3 text-sm w-full text-left hover:bg-accent transition-colors text-muted-foreground"
            >
              <RotateCcw size={15} className="flex-shrink-0" />
              Сбросить выполнение
            </button>
            <button
              onClick={() => { closeMenu(); onDelete(); }}
              className="flex items-center gap-3 px-4 py-3 text-sm w-full text-left hover:bg-destructive/10 transition-colors font-medium text-destructive"
            >
              <Trash2 size={15} className="flex-shrink-0" />
              Удалить привычку
            </button>
          </div>
        </>
      )}
    </>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyHabits({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4 text-4xl"
        style={{ background: 'hsl(var(--secondary)/0.8)', border: '1px solid hsl(var(--border)/0.4)' }}>
        🌱
      </div>
      <h3 className="text-base font-semibold mb-1">Нет привычек</h3>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        Создай первую привычку и начни<br />строить систему своей жизни
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-105"
        style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
      >
        <Plus size={16} /> Создать привычку
      </button>
    </div>
  );
}

// ─── Calendar Bottom Sheet ────────────────────────────────────────────────────

function CalendarDaySheet({
  date, habits, completions, onClose, onIncrement,
}: {
  date: Date;
  habits: HabitWithTags[];
  completions: HabitCompletionRow[];
  onClose: () => void;
  onIncrement: (habitId: string, reps: number) => void;
}) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const todayStr = getTodayStr();
  const isToday = dateStr === todayStr;

  // Filter habits active on this day
  const dow = date.getDay() === 0 ? 7 : date.getDay();
  const dayHabits = habits.filter(h => h.target_days.includes(dow));

  return (
    <div className="fixed inset-0 z-[300] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-auto rounded-t-3xl overflow-hidden animate-fade-in"
        style={{ background: 'hsl(var(--card))', maxHeight: '70vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border/60" />
        </div>
        <div className="px-5 pb-2 flex items-center justify-between">
          <h3 className="text-base font-bold">
            {format(date, 'd MMMM', { locale: ru })}
          </h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-8" style={{ maxHeight: '55vh' }}>
          {dayHabits.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              В этот день привычек нет
            </div>
          ) : (
            <div className="space-y-2">
              {dayHabits.map(habit => {
                const comp = completions.find(c => c.habit_id === habit.id && c.date === dateStr);
                const count = comp?.count ?? 0;
                const isDone = count >= habit.repetitions_per_day;
                const color = sphereColor(habit.life_sphere);
                const iconMap: Record<string, string> = {
                  sparkle: '✨', fire: '🔥', heart: '❤️', book: '📚', run: '🏃', water: '💧',
                  meditation: '🧘', money: '💰', family: '👨‍👩‍👧‍👦', brain: '🧠', sleep: '😴',
                  sport: '💪', music: '🎵', art: '🎨', food: '🍎', work: '💼',
                };

                return (
                  <div key={habit.id}
                    className="flex items-center gap-3 p-3 rounded-2xl transition-all"
                    style={{
                      background: `hsl(var(--secondary)/0.6)`,
                      border: `1px solid ${color}20`,
                    }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ backgroundColor: `${color}18` }}>
                      {iconMap[habit.icon] ?? habit.icon ?? '✨'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{habit.title}</p>
                      <p className="text-[11px] text-muted-foreground">{count}/{habit.repetitions_per_day}</p>
                    </div>
                    {isToday && (
                      <button
                        onClick={() => onIncrement(habit.id, habit.repetitions_per_day)}
                        disabled={isDone}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                        style={{
                          backgroundColor: isDone ? color : `${color}18`,
                          border: `1.5px solid ${isDone ? color : `${color}40`}`,
                        }}
                      >
                        <span className="text-xs font-bold" style={{ color: isDone ? 'white' : color }}>
                          {isDone ? '✓' : '+'}
                        </span>
                      </button>
                    )}
                    {!isToday && (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: isDone ? color : 'hsl(var(--secondary))', border: `1.5px solid ${isDone ? color : 'hsl(var(--border))'}` }}>
                        <span className="text-xs font-bold" style={{ color: isDone ? 'white' : 'hsl(var(--muted-foreground))' }}>
                          {isDone ? '✓' : '○'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({ habitTitle, onConfirm, onCancel }: {
  habitTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-3xl p-6 animate-scale-in"
        style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border)/0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 text-3xl"
            style={{ background: 'hsl(var(--destructive)/0.1)' }}>
            🗑️
          </div>
          <h3 className="text-base font-bold mb-1">Удалить привычку?</h3>
          <p className="text-sm text-muted-foreground">
            «{habitTitle}» и все данные о выполнении будут удалены навсегда.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-secondary text-foreground">
            Отмена
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'hsl(var(--destructive))', color: 'white' }}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

async function fireConfetti() {
  try {
    const confetti = (await import('canvas-confetti')).default;
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.7 },
      colors: ['#1BDEAC', '#10b981', '#f59e0b', '#a855f7'],
      scalar: 0.8,
    });
  } catch { /* нет confetti — ничего */ }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const SQL_SCRIPT = `-- Запусти этот SQL в Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard → твой проект → SQL Editor

CREATE TABLE IF NOT EXISTS public.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  period_type text NOT NULL DEFAULT 'none'
    CHECK (period_type IN ('none','week','month','quarter','year','custom')),
  period_start date, period_end date,
  goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  life_sphere text NOT NULL,
  repetitions_per_day int NOT NULL DEFAULT 1 CHECK (repetitions_per_day >= 1 AND repetitions_per_day <= 20),
  target_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  icon text NOT NULL DEFAULT 'sparkle',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS habits_all ON public.habits;
CREATE POLICY habits_all ON public.habits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.habit_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL, slug text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, slug)
);
ALTER TABLE public.habit_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS habit_tags_all ON public.habit_tags;
CREATE POLICY habit_tags_all ON public.habit_tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.habit_tag_links (
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.habit_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (habit_id, tag_id)
);
ALTER TABLE public.habit_tag_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS habit_tag_links_all ON public.habit_tag_links;
CREATE POLICY habit_tag_links_all ON public.habit_tag_links FOR ALL
  USING (EXISTS (SELECT 1 FROM public.habits h WHERE h.id = habit_id AND h.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.habits h WHERE h.id = habit_id AND h.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.habit_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  date date NOT NULL,
  count int NOT NULL DEFAULT 1 CHECK (count >= 1 AND count <= 20),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, habit_id, date)
);
ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS habit_completions_all ON public.habit_completions;
CREATE POLICY habit_completions_all ON public.habit_completions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.stars_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('habit_completion')),
  source_id uuid NOT NULL,
  stars int NOT NULL DEFAULT 1 CHECK (stars > 0 AND stars <= 20),
  date date NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.stars_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stars_ledger_all ON public.stars_ledger;
CREATE POLICY stars_ledger_all ON public.stars_ledger FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`;

function MigrationBanner() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(SQL_SCRIPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col min-h-screen pb-28 px-4 pt-6">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="text-5xl mb-3">🗄️</div>
        <h2 className="text-xl font-bold text-foreground mb-2">Нужна настройка базы данных</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Таблицы привычек ещё не созданы в Supabase.
          Скопируй SQL ниже и запусти его в{' '}
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Supabase Dashboard → SQL Editor
          </a>
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-3 mb-5">
        {[
          { num: '1', text: 'Открой Supabase Dashboard → SQL Editor' },
          { num: '2', text: 'Создай новый запрос (New query)' },
          { num: '3', text: 'Вставь SQL из поля ниже' },
          { num: '4', text: 'Нажми Run (▶)' },
          { num: '5', text: 'Вернись сюда и обнови страницу' },
        ].map(step => (
          <div key={step.num} className="flex items-start gap-3 p-3 rounded-xl"
            style={{ background: 'hsl(var(--secondary)/0.6)' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              {step.num}
            </div>
            <span className="text-sm text-foreground">{step.text}</span>
          </div>
        ))}
      </div>

      {/* SQL Block */}
      <div className="rounded-2xl overflow-hidden border border-border mb-4">
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ background: 'hsl(var(--secondary))' }}>
          <span className="text-xs font-mono text-muted-foreground">SQL миграция привычек</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: copied ? 'hsl(160 59% 40% / 0.2)' : 'hsl(var(--primary)/0.15)',
              color: copied ? 'hsl(160 59% 40%)' : 'hsl(var(--primary))',
            }}>
            {copied ? <><span>✓</span> Скопировано!</> : <><Copy size={12} /> Скопировать SQL</>}
          </button>
        </div>
        <div className="p-4 overflow-auto max-h-64"
          style={{ background: 'hsl(var(--card))' }}>
          <pre className="text-[11px] text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">
            {SQL_SCRIPT}
          </pre>
        </div>
      </div>

      <a
        href="https://supabase.com/dashboard"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold transition-all"
        style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
        Открыть Supabase Dashboard
      </a>

      <p className="text-xs text-muted-foreground text-center mt-4">
        После запуска SQL обнови страницу — раздел привычек заработает
      </p>
    </div>
  );
}

export default function HabitsPage() {

  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = getTodayStr();

  const [tab, setTab] = useState<TabType>('habits');
  const [selectedSphere, setSelectedSphere] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNewWizard, setShowNewWizard] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedCalDay, setSelectedCalDay] = useState<Date | null>(null);
  const [progressPeriod, setProgressPeriod] = useState<7 | 30>(7);
  const [deleteTarget, setDeleteTarget] = useState<HabitWithTags | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: habits = [], isLoading: habitsLoading, error: habitsError } = useQuery({
    queryKey: ['habits', user?.id],
    queryFn: () => listHabits(user!.id).then(r => r.data),
    enabled: !!user?.id,
  });

  const { data: completions = [], isLoading: compLoading } = useQuery({
    queryKey: ['habit_completions', user?.id],
    queryFn: () => listCompletions(user!.id).then(r => r.data),
    enabled: !!user?.id,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['habit_tags', user?.id],
    queryFn: () => ensureDefaultTags(user!.id),
    enabled: !!user?.id,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals', user?.id],
    queryFn: () => listGoals(user!.id).then(r => r.data),
    enabled: !!user?.id,
  });

  const { data: stars = { today: 0, week: 0, total: 0 } } = useQuery({
    queryKey: ['stars_summary', user?.id],
    queryFn: () => getStarsSummary(user!.id),
    enabled: !!user?.id,
  });

  // Today habits
  const todayHabits = useMemo(() => habits.filter(isHabitActiveToday), [habits]);

  // Filtered
  const filteredHabits = useMemo(() => {
    let list = todayHabits;
    if (selectedSphere) list = list.filter(h => h.life_sphere === selectedSphere);
    if (selectedTagId) list = list.filter(h => h.tags.some(t => t.id === selectedTagId));
    if (selectedGoalId) list = list.filter(h => h.goal_id === selectedGoalId);
    if (searchQuery) list = list.filter(h => h.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return list;
  }, [todayHabits, selectedSphere, selectedTagId, selectedGoalId, searchQuery]);

  const futureHabits = useMemo(() => {
    let list = habits.filter(h => !isHabitActiveToday(h));
    if (selectedSphere) list = list.filter(h => h.life_sphere === selectedSphere);
    if (selectedTagId) list = list.filter(h => h.tags.some(t => t.id === selectedTagId));
    if (selectedGoalId) list = list.filter(h => h.goal_id === selectedGoalId);
    if (searchQuery) list = list.filter(h => h.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return list;
  }, [habits, selectedSphere, selectedTagId, selectedGoalId, searchQuery]);

  const todayDoneCount = useMemo(() =>
    todayHabits.filter(h => {
      const c = completions.find(c => c.habit_id === h.id && c.date === today);
      return (c?.count ?? 0) >= h.repetitions_per_day;
    }).length,
    [todayHabits, completions, today]
  );

  function getCompletion(habitId: string, dateStr?: string) {
    return completions.find(c => c.habit_id === habitId && c.date === (dateStr ?? today));
  }

  function getStreak(habit: HabitWithTags) {
    return calculateStreak(habit.id, completions, habit.target_days);
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['habit_completions'] });
    qc.invalidateQueries({ queryKey: ['stars_summary'] });
  }

  const handleIncrement = useCallback(async (habit: HabitWithTags) => {
    if (!user?.id) return;
    const { starsAwarded, error } = await incrementCompletion(user.id, habit.id, habit.repetitions_per_day);
    if (error) { toast.error(error); return; }
    invalidate();

    const newCount = (getCompletion(habit.id)?.count ?? 0) + 1;
    if (starsAwarded > 0 && newCount >= habit.repetitions_per_day) {
      await fireConfetti();
      toast.success(`${habit.title} выполнено! +${starsAwarded}⭐`, { duration: 2000 });
    } else if (starsAwarded > 0) {
      toast.success(`+${starsAwarded}⭐`, { duration: 1500 });
    }
  }, [user?.id, completions]);

  const handleReset = useCallback(async (habitId: string) => {
    if (!user?.id) return;
    const { error } = await resetCompletion(user.id, habitId);
    if (error) { toast.error(error); return; }
    invalidate();
    toast('Выполнение сброшено', { icon: '↩️' });
  }, [user?.id]);

  const handleAddToCalendar = useCallback((habit: HabitWithTags) => {
    // Build Google Calendar recurring event URL
    const title = encodeURIComponent(habit.title);
    const details = encodeURIComponent(`Привычка: ${habit.title}`);
    // Use today as start, repeat weekly
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${dateStr}/${dateStr}&recur=RRULE:FREQ=WEEKLY`;
    window.open(url, '_blank');
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || !user?.id) return;
    const { deleteHabit } = await import('@/lib/habitsService');
    const { error } = await deleteHabit(deleteTarget.id, user.id);
    if (error) { toast.error(error); return; }
    qc.invalidateQueries({ queryKey: ['habits'] });
    toast.success('Привычка удалена');
    setDeleteTarget(null);
  }, [deleteTarget, user?.id]);

  // ── Calendar data ────────────────────────────────────────────────────────────

  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const weekStart = startOfWeek(start, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(end, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [calendarMonth]);

  const weekHeaders = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // ── Progress chart data ───────────────────────────────────────────────────────

  const progressData = useMemo(() => {
    const days = progressPeriod;
    return Array.from({ length: days }, (_, i) => {
      const d = subDays(new Date(), days - 1 - i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayCompletions = completions.filter(c => c.date === dateStr);
      const done = dayCompletions.filter(c => {
        const habit = habits.find(h => h.id === c.habit_id);
        return habit && c.count >= habit.repetitions_per_day;
      }).length;
      const total = habits.filter(h => {
        const dow = d.getDay() === 0 ? 7 : d.getDay();
        return h.target_days.includes(dow);
      }).length || 1;
      return {
        label: format(d, days <= 7 ? 'EEE' : 'd', { locale: ru }),
        value: Math.round((done / total) * 100),
        done,
        total,
      };
    });
  }, [completions, habits, progressPeriod]);

  const avgCompletion = progressData.length > 0
    ? Math.round(progressData.reduce((s, d) => s + d.value, 0) / progressData.length)
    : 0;

  const sphereStats = useMemo(() => {
    return SPHERES.map(sphere => {
      const sh = habits.filter(h => h.life_sphere === sphere.id);
      const totalDone = completions.filter(c => sh.some(h => h.id === c.habit_id)).length;
      const totalPlanned = sh.length * Math.max(progressPeriod, 1);
      const pct = totalPlanned > 0 ? Math.min(100, Math.round((totalDone / totalPlanned) * 100)) : 0;
      return { sphere, pct, count: sh.length };
    }).sort((a, b) => b.pct - a.pct);
  }, [habits, completions, progressPeriod]);

  const strongest = sphereStats.find(s => s.count > 0);
  const weakest = sphereStats.filter(s => s.count > 0).at(-1);

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (habitsLoading || compLoading) {
    return (
      <div className="flex flex-col min-h-screen pb-28">
        <div className="px-4 pt-5 pb-3 flex items-center justify-between">
          <div>
            <div className="h-5 w-32 bg-secondary rounded-lg animate-pulse mb-1" />
            <div className="h-3 w-20 bg-secondary rounded animate-pulse" />
          </div>
          <div className="w-9 h-9 bg-secondary rounded-xl animate-pulse" />
        </div>
        <div className="px-4 space-y-3 mt-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-secondary rounded-[20px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }


  // ── Migration Banner ──────────────────────────────────────────────────────────

  const isMigrationError = habitsError instanceof HabitsTableMissingError;

  if (isMigrationError) {
    return <MigrationBanner />;
  }

  // ── Error ─────────────────────────────────────────────────────────────────────

  if (habitsError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pb-28 px-6 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="text-base font-semibold mb-1">Ошибка загрузки</h3>
        <p className="text-sm text-muted-foreground mb-5">Не удалось загрузить привычки. Проверьте соединение.</p>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['habits'] })}
          className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
          Повторить
        </button>
      </div>
    );
  }



  // ── Tabs ──────────────────────────────────────────────────────────────────────

  const tabs = [
    { key: 'habits' as TabType, label: 'Привычки', icon: <List size={13} /> },
    { key: 'calendar' as TabType, label: 'Календарь', icon: <CalendarIcon size={13} /> },
    { key: 'progress' as TabType, label: 'Аналитика', icon: <TrendingUp size={13} /> },
  ];

  return (
    <div className="flex flex-col min-h-screen pb-28">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Привычки</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {todayDoneCount}/{todayHabits.length} сегодня
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 100); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <Search size={16} />
          </button>
          <button
            onClick={() => setShowNewWizard(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────── */}
      {showSearch && (
        <div className="px-4 pb-2 animate-fade-in">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск привычек..."
              className="w-full pl-8 pr-8 py-2.5 rounded-xl text-sm outline-none bg-secondary border border-transparent focus:border-primary/40 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Stars ──────────────────────────────────────────────────── */}
      <StarsBlock stars={stars} />

      {/* ── Sticky Filters ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 pb-2 pt-1"
        style={{ background: 'hsl(var(--background)/0.95)', backdropFilter: 'blur(12px)' }}>

        {/* Sphere pills */}
        <div className="px-4 pb-1">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setSelectedSphere('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                !selectedSphere ? 'text-primary-foreground scale-105' : 'bg-secondary text-muted-foreground'
              }`}
              style={!selectedSphere ? { background: 'hsl(var(--primary))' } : {}}
            >
              Все
            </button>
            {SPHERES.map(s => {
              const c = sphereColor(s.id as Parameters<typeof getSphereColor>[0]);
              const active = selectedSphere === s.id;
              return (
                <button key={s.id}
                  onClick={() => setSelectedSphere(active ? '' : s.id)}
                  className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    active ? 'text-white scale-105' : 'bg-secondary text-muted-foreground'
                  }`}
                  style={active ? { backgroundColor: c } : {}}>
                  <span>{s.icon}</span>{s.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tags + Goals */}
        <div className="px-4">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {goals.length > 0 && goals.map((g: GoalRow) => (
              <button key={g.id}
                onClick={() => setSelectedGoalId(selectedGoalId === g.id ? '' : g.id)}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedGoalId === g.id ? 'bg-primary text-primary-foreground scale-105' : 'bg-secondary text-muted-foreground'
                }`}>
                <Target size={9} /> {g.title}
              </button>
            ))}
            {tags.map((t: HabitTagRow) => (
              <button key={t.id}
                onClick={() => setSelectedTagId(selectedTagId === t.id ? '' : t.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedTagId === t.id ? 'bg-primary text-primary-foreground scale-105' : 'bg-secondary text-muted-foreground'
                }`}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab switcher ────────────────────────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="flex bg-secondary rounded-xl p-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                tab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB: Habits ─────────────────────────────────────────────── */}
      {tab === 'habits' && (
        <div className="flex-1 px-4 space-y-2">
          {filteredHabits.length === 0 && futureHabits.length === 0 && habits.length === 0 ? (
            <EmptyHabits onAdd={() => setShowNewWizard(true)} />
          ) : (
            <>
              {/* Today */}
              {(filteredHabits.length > 0 || todayHabits.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 py-1 mb-2">
                    <span className="text-sm font-semibold text-foreground/80">Сегодня</span>
                    <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                      {filteredHabits.length}
                    </span>
                  </div>
                  {filteredHabits.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">Нет привычек по выбранным фильтрам</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredHabits.map(h => (
                        <HabitCard
                          key={h.id}
                          habit={h}
                          completion={getCompletion(h.id)}
                          streak={getStreak(h)}
                          onIncrement={() => handleIncrement(h)}
                          onReset={() => handleReset(h.id)}
                          onEdit={() => navigate(`/habits/${h.id}/edit`)}
                          onDelete={() => setDeleteTarget(h)}
                          onAddToCalendar={() => handleAddToCalendar(h)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Future / other days */}
              {futureHabits.length > 0 && (
                <div className="pt-2">
                  <div className="flex items-center gap-2 py-1 mb-2">
                    <span className="text-sm font-semibold text-foreground/60">Другие дни</span>
                    <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                      {futureHabits.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {futureHabits.map(h => (
                      <HabitCard
                        key={h.id}
                        habit={h}
                        completion={getCompletion(h.id)}
                        streak={getStreak(h)}
                        onIncrement={() => handleIncrement(h)}
                        onReset={() => handleReset(h.id)}
                        onEdit={() => navigate(`/habits/${h.id}/edit`)}
                        onDelete={() => setDeleteTarget(h)}
                        onAddToCalendar={() => handleAddToCalendar(h)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB: Calendar ───────────────────────────────────────────── */}
      {tab === 'calendar' && (
        <div className="flex-1 px-4 space-y-4">
          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
              className="p-2 rounded-xl bg-secondary hover:bg-accent transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold capitalize">
              {format(calendarMonth, 'LLLL yyyy', { locale: ru })}
            </span>
            <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
              className="p-2 rounded-xl bg-secondary hover:bg-accent transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Week headers */}
          <div className="grid grid-cols-7 gap-1">
            {weekHeaders.map(d => (
              <div key={d} className="text-[10px] text-muted-foreground font-medium text-center py-1">{d}</div>
            ))}

            {/* Days */}
            {calendarDays.map((day, i) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
              const isToday = dateStr === today;
              const dow = day.getDay() === 0 ? 7 : day.getDay();

              const dayHabits = habits.filter(h => h.target_days.includes(dow));
              const doneCnt = dayHabits.filter(h => {
                const c = completions.find(c => c.habit_id === h.id && c.date === dateStr);
                return (c?.count ?? 0) >= h.repetitions_per_day;
              }).length;
              const totalCnt = dayHabits.length;
              const isFull = totalCnt > 0 && doneCnt === totalCnt;
              const isPartial = doneCnt > 0 && doneCnt < totalCnt;

              return (
                <button key={i}
                  onClick={() => isCurrentMonth && setSelectedCalDay(day)}
                  className={`relative flex flex-col items-center py-2 rounded-xl text-xs transition-all ${
                    !isCurrentMonth ? 'opacity-20 pointer-events-none' : 'hover:bg-accent active:scale-95'
                  } ${isFull ? 'ring-1 ring-emerald-500/50' : ''} ${isToday ? 'ring-2 ring-primary' : ''}`}
                  style={{
                    background: isFull
                      ? 'hsl(160 59% 40% / 0.12)'
                      : isPartial ? 'hsl(38 92% 50% / 0.08)' : '',
                  }}>
                  <span className={`font-semibold text-[11px] ${isToday ? 'text-primary' : ''}`}>
                    {format(day, 'd')}
                  </span>
                  {totalCnt > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${isFull ? 'bg-emerald-400' : isPartial ? 'bg-amber-400' : 'bg-border/60'}`} />
                    </div>
                  )}
                  {doneCnt > 0 && (
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      {doneCnt}/{totalCnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Per-habit week strip — always starts from Monday */}
          {habits.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Эта неделя (Пн–Вс)</p>
              {habits.slice(0, 8).map(h => {
                const color = sphereColor(h.life_sphere);
                // Get Monday of current week (ISO week starts Monday)
                const monday = startOfISOWeek(new Date());
                const weekDays = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(monday.getTime() + i * 24 * 60 * 60 * 1000);
                  const dateStr = format(d, 'yyyy-MM-dd');
                  const isToday = dateStr === today;
                  const c = completions.find(comp => comp.habit_id === h.id && comp.date === dateStr);
                  const active = h.target_days.includes(i + 1); // 1=Mon..7=Sun
                  return {
                    label: weekHeaders[i],
                    done: (c?.count ?? 0) >= h.repetitions_per_day,
                    count: c?.count ?? 0,
                    active,
                    isToday,
                    isFuture: d > new Date(),
                  };
                });

                return (
                  <div key={h.id} className="rounded-xl p-3"
                    style={{ background: 'hsl(var(--secondary)/0.5)', border: `1px solid ${color}15` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{ICON_DISPLAY_MAP[h.icon] ?? h.icon ?? '✨'}</span>
                      <span className="text-xs font-medium flex-1 truncate">{h.title}</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {weekDays.map((d, i) => (
                        <div key={i} className="flex flex-col items-center gap-0.5">
                          <span className={`text-[9px] font-medium ${d.isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                            {d.label}
                          </span>
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                            style={{
                              backgroundColor: d.done ? color : d.active ? 'hsl(var(--secondary))' : 'transparent',
                              border: d.isToday ? `2px solid hsl(var(--primary))` : d.active && !d.done ? `1.5px solid ${color}40` : 'none',
                              opacity: d.isFuture ? 0.4 : 1,
                              boxShadow: d.done ? `0 0 6px ${color}50` : 'none',
                            }}
                          >
                            {d.done && <span className="text-white text-[8px] font-bold">✓</span>}
                            {!d.done && d.count > 0 && <span className="text-[8px] font-bold" style={{ color }}>{d.count}</span>}
                            {!d.active && !d.done && <span className="text-[8px] text-muted-foreground/40">–</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Progress ───────────────────────────────────────────── */}
      {tab === 'progress' && (
        <div className="flex-1 px-4 space-y-4">
          {/* Period toggle */}
          <div className="flex justify-center gap-2">
            {([7, 30] as const).map(p => (
              <button key={p} onClick={() => setProgressPeriod(p)}
                className={`px-5 py-2 rounded-full text-xs font-semibold transition-all ${
                  progressPeriod === p ? 'text-primary-foreground scale-105' : 'bg-secondary text-muted-foreground'
                }`}
                style={progressPeriod === p ? { background: 'hsl(var(--primary))' } : {}}>
                {p === 7 ? '7 дней' : '30 дней'}
              </button>
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Среднее', value: `${avgCompletion}%`, sub: 'выполнение', accent: true },
              { label: 'Привычек', value: `${habits.length}`, sub: 'всего активных' },
              { label: 'Звёзд', value: `${stars.total}`, sub: 'накоплено' },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl p-3"
                style={{ background: 'hsl(var(--secondary)/0.6)', border: '1px solid hsl(var(--border)/0.3)' }}>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold mt-0.5" style={s.accent ? { color: 'hsl(var(--primary))' } : {}}>
                  {s.value}
                </p>
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-2xl p-4" style={{ background: 'hsl(var(--secondary)/0.4)' }}>
            <p className="text-xs font-semibold mb-1 text-muted-foreground">Выполнение, %</p>
            {progressData.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart data={progressData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="habGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(162 85% 49%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(162 85% 49%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, 'Выполнение']}
                    contentStyle={{ background: 'hsl(var(--card))', border: 'none', borderRadius: 10, fontSize: 11 }}
                    cursor={{ stroke: 'hsl(var(--primary)/0.3)', strokeWidth: 1 }}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(162 85% 49%)" strokeWidth={2}
                    fill="url(#habGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[110px] text-center">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Недостаточно данных — отметь привычки<br />несколько дней подряд
                </p>
              </div>
            )}
          </div>

          {/* Sphere ratings */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'hsl(var(--secondary)/0.4)' }}>
            <p className="text-xs font-semibold text-muted-foreground">Рейтинг сфер</p>
            {sphereStats.filter(s => s.count > 0).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Нет привычек ни в одной сфере
              </p>
            ) : (
              sphereStats.filter(s => s.count > 0).map(({ sphere, pct }) => {
                const color = sphereColor(sphere.id as Parameters<typeof getSphereColor>[0]);
                return (
                  <div key={sphere.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs flex items-center gap-1.5">
                        <span>{sphere.icon}</span>
                        <span className="font-medium">{sphere.name}</span>
                        <span className="text-muted-foreground text-[10px]">{sphereStats.find(s => s.sphere.id === sphere.id)?.count} привычек</span>
                      </span>
                      <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--secondary))' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}70, ${color})` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* AI Insight */}
          {strongest && weakest && strongest.sphere.id !== weakest.sphere.id && (
            <div className="rounded-2xl p-4"
              style={{ background: 'hsl(var(--secondary)/0.6)', border: '1px solid hsl(var(--border)/0.4)' }}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2">💡 Инсайт</p>
              <p className="text-xs text-foreground/90 leading-relaxed">
                Сильнейшая сфера — <span className="font-semibold">{strongest.sphere.icon} {strongest.sphere.name}</span> ({strongest.pct}%).
                {weakest.pct < 50 && (
                  <> Уделяй больше внимания <span className="font-semibold">{weakest.sphere.icon} {weakest.sphere.name}</span> ({weakest.pct}%) — там есть потенциал роста.</>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────── */}
      {showNewWizard && (
        <HabitNewWizard
          goals={goals}
          tags={tags}
          onClose={() => setShowNewWizard(false)}
          onCreated={() => {
            setShowNewWizard(false);
            qc.invalidateQueries({ queryKey: ['habits'] });
            qc.invalidateQueries({ queryKey: ['habit_tags'] });
          }}
        />
      )}

      {selectedCalDay && (
        <CalendarDaySheet
          date={selectedCalDay}
          habits={habits}
          completions={completions}
          onClose={() => setSelectedCalDay(null)}
          onIncrement={async (habitId, reps) => {
            if (!user?.id) return;
            const habit = habits.find(h => h.id === habitId);
            if (!habit) return;
            await handleIncrement(habit);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          habitTitle={deleteTarget.title}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
