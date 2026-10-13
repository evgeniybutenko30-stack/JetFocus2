import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { ArrowLeft, RotateCcw, Trash2, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getSphereById, getTodayStr } from '@/lib/constants';
import type { FinanceOperation, SphereType } from '@/lib/types';
import { useDashboardData, useInvalidateMetrics } from '@/hooks/use-metrics';
import { deleteTask, updateTask, type TaskRow } from '@/lib/tasksService';
import { clampProgress, type GoalRow } from '@/lib/goalsService';
import { isCompletionDone, type HabitCompletionRow, type HabitRow } from '@/lib/habitsService';
import { revokeStars } from '@/lib/starsService';
import { isGoalAchieved, isGoalOnDay, isHabitFinished, isTaskOnDay } from '@/lib/dashboardStats';

type SectionType = 'habits' | 'tasks' | 'goals' | 'finance';

const NO_OPS: FinanceOperation[] = [];

/** Sphere from a DB string (unknown values fall back to the first sphere inside getSphereById). */
function sphereIcon(sphere: string | null | undefined): string {
  return getSphereById(sphere as SphereType).icon;
}

export default function ArchivePage() {
  const userId = useAuthStore(s => s.user?.id ?? null);
  const loadProfile = useAuthStore(s => s.loadProfile);
  const navigate = useNavigate();
  const invalidateMetrics = useInvalidateMetrics();
  const [section, setSection] = useState<SectionType>('tasks');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  // Habits / tasks / goals live in Supabase (the old Dexie tables are no longer written).
  const { data, isError, refetch, isGuest } = useDashboardData(null);
  const { habits, completions, tasks: allTasks, goals: allGoals } = data;
  const allOps = useLiveQuery(
    () => (userId ? db.financeOperations.where('userId').equals(userId).toArray() : Promise.resolve(NO_OPS)),
    [userId],
    NO_OPS,
  );

  const today = getTodayStr();
  const habitById = useMemo(() => new Map<string, HabitRow>(habits.map(h => [h.id, h])), [habits]);
  const doneTasks = allTasks.filter(t => t.status === 'DONE' || t.status === 'CANCELLED');
  const archivedHabits = habits.filter(h => isHabitFinished(h, today));
  const achievedGoals = allGoals.filter(isGoalAchieved);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const weekStart = startOfWeek(start, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(end, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [calendarMonth]);

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // Items for a date
  const tasksOn = (dateStr: string): TaskRow[] => allTasks.filter(t => isTaskOnDay(t, dateStr));
  const completionsOn = (dateStr: string): HabitCompletionRow[] =>
    completions.filter(c => c.date === dateStr && habitById.has(c.habit_id) && (c.count ?? 0) > 0);
  const goalsOn = (dateStr: string): GoalRow[] => allGoals.filter(g => isGoalOnDay(g, dateStr));
  const opsOn = (dateStr: string): FinanceOperation[] => allOps.filter(o => o.date === dateStr);

  function countForDate(dateStr: string): number {
    switch (section) {
      case 'tasks': return tasksOn(dateStr).length;
      case 'habits': return completionsOn(dateStr).length;
      case 'goals': return goalsOn(dateStr).length;
      case 'finance': return opsOn(dateStr).length;
      default: return 0;
    }
  }

  const selectedCount = selectedDate ? countForDate(selectedDate) : 0;

  async function restoreTask(task: TaskRow) {
    if (!userId || pendingTaskId) return;
    setPendingTaskId(task.id);
    try {
      const { error } = await updateTask(task.id, userId, { status: 'TODO', completed_at: null });
      if (error) { toast.error('Не удалось восстановить задачу: ' + error.message); return; }
      // Same rule as the Tasks page: un-completing a task takes its completion star back.
      if (task.status === 'DONE') {
        try {
          await revokeStars(userId, `task_${task.id}`);
          await loadProfile();
        } catch (e) {
          console.warn('[archive] stars update failed:', e);
        }
      }
      toast.success('Задача восстановлена');
      invalidateMetrics();
    } catch (e) {
      toast.error('Не удалось восстановить задачу: ' + (e instanceof Error ? e.message : 'ошибка сети'));
    } finally {
      setPendingTaskId(null);
    }
  }

  async function removeTask(task: TaskRow) {
    if (!userId || pendingTaskId) return;
    if (!window.confirm(`Удалить задачу «${task.title}»?`)) return;
    setPendingTaskId(task.id);
    try {
      const { error } = await deleteTask(task.id, userId);
      if (error) { toast.error('Не удалось удалить задачу: ' + error.message); return; }
      toast.success('Задача удалена');
      invalidateMetrics();
    } catch (e) {
      toast.error('Не удалось удалить задачу: ' + (e instanceof Error ? e.message : 'ошибка сети'));
    } finally {
      setPendingTaskId(null);
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="section-header">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">📦 Архив</h1>
      </div>

      <div className="flex-1 px-4 py-3 max-w-lg mx-auto w-full space-y-4 fade-in">
        {isGuest && (
          <div className="glass-card p-3 text-sm text-muted-foreground">
            Войдите в аккаунт, чтобы видеть архив.{' '}
            <button onClick={() => navigate('/auth')} className="text-primary font-medium">Войти</button>
          </div>
        )}
        {isError && (
          <div className="glass-card p-3 flex items-center justify-between gap-2 text-sm">
            <span className="text-destructive">Не удалось загрузить архив</span>
            <button onClick={() => refetch()} className="flex items-center gap-1 text-primary text-xs font-medium"><RefreshCw size={12} /> Повторить</button>
          </div>
        )}
        {/* Section tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {([
            { k: 'tasks' as const, l: '✅ Задачи' },
            { k: 'habits' as const, l: '🔄 Привычки' },
            { k: 'goals' as const, l: '🎯 Цели' },
            { k: 'finance' as const, l: '💰 Финансы' },
          ]).map(t => (
            <button key={t.k} onClick={() => { setSection(t.k); setSelectedDate(null); }}
              className={`pill-btn whitespace-nowrap ${section === t.k ? 'pill-btn-active' : 'pill-btn-inactive'}`}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Calendar */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="p-1"><ChevronLeft size={18} /></button>
            <span className="text-sm font-semibold capitalize">{format(calendarMonth, 'LLLL yyyy', { locale: ru })}</span>
            <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="p-1"><ChevronRight size={18} /></button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {weekDays.map(d => (
              <div key={d} className="text-[10px] text-muted-foreground font-medium py-1">{d}</div>
            ))}
            {calendarDays.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              const hasData = countForDate(dateStr) > 0;
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`py-2 rounded-lg text-xs relative transition-all ${
                    !isCurrentMonth ? 'opacity-30' : ''
                  } ${isSelected ? 'bg-primary text-primary-foreground' : isToday ? 'ring-1 ring-primary' : ''} ${
                    hasData && !isSelected ? 'bg-primary/10' : ''
                  }`}
                >
                  <span className="font-medium">{format(day, 'd')}</span>
                  {hasData && !isSelected && <div className="w-1 h-1 rounded-full bg-primary mx-auto mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected date items */}
        {selectedDate && (
          <div>
            <p className="text-sm font-semibold mb-2">
              {format(new Date(selectedDate + 'T12:00:00'), 'd MMMM yyyy', { locale: ru })}
              <span className="text-muted-foreground ml-2">({selectedCount} записей)</span>
            </p>
            {selectedCount === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Нет записей за этот день</p>}

            <div className="space-y-2">
              {section === 'tasks' && tasksOn(selectedDate).map(t => {
                const closed = t.status === 'DONE' || t.status === 'CANCELLED';
                const pending = pendingTaskId === t.id;
                return (
                  <div key={t.id} className="glass-card p-3 flex items-center gap-3">
                    <span className="text-sm">{sphereIcon(t.sphere)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm break-words ${t.status === 'DONE' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</p>
                      <p className="text-[10px] text-muted-foreground">{t.status === 'DONE' ? 'Выполнено' : t.status === 'CANCELLED' ? 'Отменено' : 'В работе'}</p>
                    </div>
                    {pending && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                    {closed && (
                      <button onClick={() => restoreTask(t)} disabled={!!pendingTaskId} className="p-1.5 text-primary disabled:opacity-40" aria-label="Восстановить задачу"><RotateCcw size={14} /></button>
                    )}
                    <button onClick={() => removeTask(t)} disabled={!!pendingTaskId} className="p-1.5 text-destructive disabled:opacity-40" aria-label="Удалить задачу"><Trash2 size={14} /></button>
                  </div>
                );
              })}
              {section === 'habits' && completionsOn(selectedDate).map(c => {
                const habit = habitById.get(c.habit_id);
                const done = !!habit && isCompletionDone(c.count, habit.repetitions_per_day);
                return (
                  <div key={c.id} className="glass-card p-3 flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${done ? 'bg-primary' : 'bg-secondary'}`} />
                    <span className="text-sm flex-1 min-w-0 truncate">{habit?.icon ? `${habit.icon} ` : ''}{habit?.title ?? 'Привычка'}</span>
                    <span className="text-xs text-muted-foreground">{done ? '✓' : `${c.count}/${habit?.repetitions_per_day ?? 1}`}</span>
                  </div>
                );
              })}
              {section === 'goals' && goalsOn(selectedDate).map(g => (
                <div key={g.id} className="glass-card p-3 flex items-center gap-3">
                  <span className="text-sm">{sphereIcon(g.sphere)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium break-words">{g.title}</p>
                    <p className="text-[10px] text-muted-foreground">{clampProgress(g.progress)}%</p>
                  </div>
                </div>
              ))}
              {section === 'finance' && opsOn(selectedDate).map(o => (
                <div key={o.id} className="glass-card p-3 flex items-center gap-3">
                  <span className="text-sm">{sphereIcon(o.sphere)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{o.category}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{o.description || ''}</p>
                  </div>
                  <span className={`text-sm font-bold whitespace-nowrap ${o.type === 'INCOME' ? 'text-primary' : o.type === 'EXPENSE' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {o.type === 'INCOME' ? '+' : o.type === 'EXPENSE' ? '-' : '⇄ '}{((Number.isFinite(o.amount) ? o.amount : 0) / 100).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary when no date selected */}
        {!selectedDate && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold">{doneTasks.length}</p>
                <p className="text-xs text-muted-foreground">Завершённых задач</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold">{archivedHabits.length}</p>
                <p className="text-xs text-muted-foreground">Архивных привычек</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold">{achievedGoals.length}</p>
                <p className="text-xs text-muted-foreground">Достигнуто целей</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold">{allOps.length}</p>
                <p className="text-xs text-muted-foreground">Финансовых операций</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">Нажмите на дату в календаре для просмотра</p>
          </div>
        )}
      </div>
    </div>
  );
}
