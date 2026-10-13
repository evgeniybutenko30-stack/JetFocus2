/**
 * Pure aggregations for the Today dashboard («Моя динамика»), Statistics, Sections and
 * Archive pages.
 *
 * Habits, tasks and goals live in Supabase (habitsService / tasksService / goalsService);
 * finance operations and focus sessions live in Dexie. A "day" is always the user's LOCAL
 * calendar date 'yyyy-MM-dd' (see getTodayStr) — never derive it via toISOString(), which
 * yields the UTC date (wrong between 00:00 and 03:00 in Moscow).
 */
import { SPHERES } from '@/lib/constants';
import {
  addLocalDays,
  computeSphereRates,
  isCompletionDone,
  isHabitScheduledOn,
  safePercent,
  toLocalDateStr,
  type HabitCompletionRow,
  type HabitRow,
} from '@/lib/habitsService';
import { isoToLocalDateStr, type TaskRow } from '@/lib/tasksService';
import type { GoalRow } from '@/lib/goalsService';
import { computeTotalBalance } from '@/lib/financeUtils';
import type { FinanceAccount, FinanceOperation, FocusSession } from '@/lib/types';

type TaskLike = Pick<TaskRow, 'status' | 'due_date' | 'created_at' | 'completed_at'>;

function finiteOr0(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

// ─── Today metrics ──────────────────────────────────────────────────────────

/** Weighted day score 0..100: 40% habits, 40% tasks, 20% focus (25 min = full). */
export function calculateDayProgressScore(metrics: {
  totalHabitsToday: number;
  habitsDoneCount: number;
  totalTasksToday: number;
  tasksDoneCount: number;
  focusMinutesToday: number;
}): number {
  const ratio = (done: number, total: number) =>
    total > 0 ? Math.min(Math.max(finiteOr0(done) / total, 0), 1) : 0;
  const habits = ratio(metrics.habitsDoneCount, metrics.totalHabitsToday);
  const tasks = ratio(metrics.tasksDoneCount, metrics.totalTasksToday);
  const focus = Math.min(Math.max(finiteOr0(metrics.focusMinutesToday) / 25, 0), 1);
  return Math.round((0.4 * habits + 0.4 * tasks + 0.2 * focus) * 100);
}

/** A task belongs to `day` when it is due that day, or has no due date and was created that (local) day. */
export function isTaskForDay(task: TaskLike, day: string): boolean {
  if (task.status === 'CANCELLED') return false;
  if (task.due_date) return task.due_date === day;
  return isoToLocalDateStr(task.created_at) === day;
}

/** The local day a DONE task counts for: when it was completed, falling back to its due date. */
export function taskDoneDay(task: TaskLike): string | null {
  if (task.status !== 'DONE') return null;
  return isoToLocalDateStr(task.completed_at) ?? task.due_date ?? null;
}

export interface HabitTaskDayMetrics {
  totalHabitsToday: number;
  habitsDoneCount: number;
  habitsTodoCount: number;
  totalTasksToday: number;
  tasksDoneCount: number;
  tasksTodoCount: number;
}

/** Habits / tasks counters for the day of `now` (same schedule rules as the Habits page). */
export function computeHabitTaskMetrics(
  habits: HabitRow[],
  completions: Pick<HabitCompletionRow, 'habit_id' | 'date' | 'count'>[],
  tasks: TaskLike[],
  now: Date = new Date(),
): HabitTaskDayMetrics {
  const today = toLocalDateStr(now);
  const countByHabit = new Map<string, number>();
  completions.forEach(c => {
    if (c.date === today) countByHabit.set(c.habit_id, (countByHabit.get(c.habit_id) ?? 0) + finiteOr0(c.count));
  });

  const habitsToday = habits.filter(h => isHabitScheduledOn(h, now));
  const habitsDoneCount = habitsToday.filter(h => isCompletionDone(countByHabit.get(h.id), h.repetitions_per_day)).length;

  const tasksToday = tasks.filter(t => isTaskForDay(t, today));
  const tasksDoneCount = tasksToday.filter(t => t.status === 'DONE').length;
  const tasksTodoCount = tasksToday.filter(t => t.status === 'TODO' || t.status === 'IN_PROGRESS').length;

  return {
    totalHabitsToday: habitsToday.length,
    habitsDoneCount,
    habitsTodoCount: habitsToday.length - habitsDoneCount,
    totalTasksToday: tasksToday.length,
    tasksDoneCount,
    tasksTodoCount,
  };
}

export interface FinanceSummary {
  todayIncome: number;
  todayExpense: number;
  /**
   * «Общий баланс» in ₽ kopecks — the same number the Finance page shows (account opening
   * balances plus operations, hidden / foreign-currency accounts excluded).
   */
  balanceTotal: number;
}

export function computeFinanceSummary(
  ops: Pick<FinanceOperation, 'type' | 'amount' | 'date' | 'accountId' | 'toAccountId'>[],
  accounts: Pick<FinanceAccount, 'id' | 'balance' | 'currency' | 'hideFromTotal'>[],
  today: string,
): FinanceSummary {
  let todayIncome = 0;
  let todayExpense = 0;
  for (const op of ops) {
    if (op.date !== today) continue;
    const amount = finiteOr0(op.amount);
    if (op.type === 'INCOME') todayIncome += amount;
    else if (op.type === 'EXPENSE') todayExpense += amount;
  }
  return { todayIncome, todayExpense, balanceTotal: computeTotalBalance(accounts, ops) };
}

/** Whole focus minutes of `userId` on `day`. */
export function computeFocusMinutes(
  sessions: Pick<FocusSession, 'userId' | 'date' | 'durationSeconds'>[],
  userId: string,
  day: string,
): number {
  const seconds = sessions
    .filter(s => s.userId === userId && s.date === day)
    .reduce((sum, s) => sum + Math.max(0, finiteOr0(s.durationSeconds)), 0);
  return Math.floor(seconds / 60);
}

/** Seconds left until `endsAt` (ms timestamp). Timestamp-based, so it never drifts in background tabs. */
export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

// ─── Sphere balance («Весы» / «Цветок») ──────────────────────────────────────

/**
 * Per-sphere completion level 0..10 over the last `days` days: done habit-days divided by
 * scheduled habit-days (spheres without habits are 0).
 */
export function computeSphereBalance(
  habits: HabitRow[],
  completions: HabitCompletionRow[],
  days = 30,
  now: Date = new Date(),
): Record<string, number> {
  const rates = computeSphereRates(habits, completions, days, now);
  const values: Record<string, number> = {};
  SPHERES.forEach(s => {
    const r = rates.get(s.id);
    values[s.id] = r && r.planned > 0 ? Math.min(10, Math.max(0, Math.round((r.done / r.planned) * 10))) : 0;
  });
  return values;
}

/**
 * Share (0..100) of scheduled habit-days over the last `days` days on which the daily target
 * was reached. Days before a habit existed or outside its period are not counted as missed.
 */
export function computeHabitCompletionRate(
  habits: HabitRow[],
  completions: HabitCompletionRow[],
  days: number,
  now: Date = new Date(),
): number {
  let done = 0;
  let planned = 0;
  computeSphereRates(habits, completions, days, now).forEach(r => {
    done += r.done;
    planned += r.planned;
  });
  return safePercent(done, planned);
}

// ─── Dynamics chart («Динамика») ────────────────────────────────────────────

export interface DynamicsPoint {
  /** Local 'yyyy-MM-dd'. */
  date: string;
  /** 0 = Sunday … 6 = Saturday (local). */
  weekday: number;
  habits: number;
  tasks: number;
  focusMins: number;
  /** Day index 0..100. */
  score: number;
}

function doneCompletionsByDay(
  habits: Pick<HabitRow, 'id' | 'repetitions_per_day'>[],
  completions: Pick<HabitCompletionRow, 'habit_id' | 'date' | 'count'>[],
): Map<string, number> {
  const reps = new Map(habits.map(h => [h.id, h.repetitions_per_day]));
  const byDay = new Map<string, number>();
  completions.forEach(c => {
    if (!reps.has(c.habit_id)) return;
    if (!isCompletionDone(c.count, reps.get(c.habit_id) ?? 1)) return;
    byDay.set(c.date, (byDay.get(c.date) ?? 0) + 1);
  });
  return byDay;
}

function doneTasksByDay(tasks: TaskLike[]): Map<string, number> {
  const byDay = new Map<string, number>();
  tasks.forEach(t => {
    const day = taskDoneDay(t);
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  });
  return byDay;
}

/** One point per local day for the last `days` days (oldest first, ending today). */
export function buildDynamicsSeries(
  days: number,
  habits: Pick<HabitRow, 'id' | 'repetitions_per_day'>[],
  completions: Pick<HabitCompletionRow, 'habit_id' | 'date' | 'count'>[],
  tasks: TaskLike[],
  sessions: Pick<FocusSession, 'date' | 'durationSeconds'>[],
  now: Date = new Date(),
): DynamicsPoint[] {
  const habitsByDay = doneCompletionsByDay(habits, completions);
  const tasksByDay = doneTasksByDay(tasks);
  const focusSecByDay = new Map<string, number>();
  sessions.forEach(s => {
    focusSecByDay.set(s.date, (focusSecByDay.get(s.date) ?? 0) + Math.max(0, finiteOr0(s.durationSeconds)));
  });

  const n = Math.max(0, Math.floor(days));
  return Array.from({ length: n }, (_, i) => {
    const d = addLocalDays(now, -(n - 1 - i));
    const date = toLocalDateStr(d);
    const habitsDone = habitsByDay.get(date) ?? 0;
    const tasksDone = tasksByDay.get(date) ?? 0;
    const focusMins = Math.floor((focusSecByDay.get(date) ?? 0) / 60);
    const score = Math.min(habitsDone * 10 + tasksDone * 15 + Math.min(focusMins, 60), 100);
    return { date, weekday: d.getDay(), habits: habitsDone, tasks: tasksDone, focusMins, score };
  });
}

// ─── Statistics ─────────────────────────────────────────────────────────────

export interface TrendBucket {
  /** First / last local day of the bucket (Date at local noon). */
  start: Date;
  end: Date;
  habits: number;
  tasks: number;
}

/**
 * Habit / task completions over the last `days` days, aggregated into buckets (1 day each
 * for up to 30 days, ~20 buckets for longer periods). The last bucket always ends today.
 * Every day of the period is counted exactly once (no sampling).
 */
export function buildTrendBuckets(
  days: number,
  habits: Pick<HabitRow, 'id' | 'repetitions_per_day'>[],
  completions: Pick<HabitCompletionRow, 'habit_id' | 'date' | 'count'>[],
  tasks: TaskLike[],
  now: Date = new Date(),
): TrendBucket[] {
  const n = Math.max(0, Math.floor(days));
  const step = n > 30 ? Math.ceil(n / 20) : 1;
  const habitsByDay = doneCompletionsByDay(habits, completions);
  const tasksByDay = doneTasksByDay(tasks);

  const buckets: TrendBucket[] = [];
  for (let endOffset = 0; endOffset < n; endOffset += step) {
    const startOffset = Math.min(endOffset + step - 1, n - 1);
    const bucket: TrendBucket = {
      start: addLocalDays(now, -startOffset),
      end: addLocalDays(now, -endOffset),
      habits: 0,
      tasks: 0,
    };
    for (let off = endOffset; off <= startOffset; off++) {
      const day = toLocalDateStr(addLocalDays(now, -off));
      bucket.habits += habitsByDay.get(day) ?? 0;
      bucket.tasks += tasksByDay.get(day) ?? 0;
    }
    buckets.push(bucket);
  }
  return buckets.reverse();
}

/** Inclusive local-day range check for 'yyyy-MM-dd' strings. */
function inRange(day: string | null | undefined, from: string, to: string): day is string {
  return !!day && day >= from && day <= to;
}

export interface PeriodTotals {
  habitsDone: number;
  tasksDone: number;
}

/** Done habit-days and completed tasks between `from` and `to` (local days, inclusive). */
export function computePeriodTotals(
  habits: Pick<HabitRow, 'id' | 'repetitions_per_day'>[],
  completions: Pick<HabitCompletionRow, 'habit_id' | 'date' | 'count'>[],
  tasks: TaskLike[],
  from: string,
  to: string,
): PeriodTotals {
  let habitsDone = 0;
  doneCompletionsByDay(habits, completions).forEach((count, day) => {
    if (inRange(day, from, to)) habitsDone += count;
  });
  const tasksDone = tasks.filter(t => inRange(taskDoneDay(t), from, to)).length;
  return { habitsDone, tasksDone };
}

export function isGoalAchieved(goal: Pick<GoalRow, 'status' | 'is_achieved'>): boolean {
  return goal.status === 'completed' || goal.status === 'achieved' || goal.is_achieved === true;
}

function clampPercent(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/**
 * Activity score 0..100 per sphere for the period: 2 points per done habit-day, 3 per
 * completed task, plus the average progress of the sphere's goals.
 */
export function computeSphereActivityScores(
  habits: Pick<HabitRow, 'id' | 'repetitions_per_day' | 'life_sphere'>[],
  completions: Pick<HabitCompletionRow, 'habit_id' | 'date' | 'count'>[],
  tasks: (TaskLike & Pick<TaskRow, 'sphere'>)[],
  goals: Pick<GoalRow, 'sphere' | 'progress'>[],
  from: string,
  to: string,
): Record<string, number> {
  const habitById = new Map(habits.map(h => [h.id, h]));
  const habitDone: Record<string, number> = {};
  completions.forEach(c => {
    const h = habitById.get(c.habit_id);
    if (!h || !inRange(c.date, from, to) || !isCompletionDone(c.count, h.repetitions_per_day)) return;
    habitDone[h.life_sphere] = (habitDone[h.life_sphere] ?? 0) + 1;
  });
  const taskDone: Record<string, number> = {};
  tasks.forEach(t => {
    if (inRange(taskDoneDay(t), from, to)) taskDone[t.sphere] = (taskDone[t.sphere] ?? 0) + 1;
  });

  const scores: Record<string, number> = {};
  SPHERES.forEach(s => {
    const sGoals = goals.filter(g => g.sphere === s.id);
    const goalAvg = sGoals.length > 0 ? sGoals.reduce((sum, g) => sum + clampPercent(g.progress), 0) / sGoals.length : 0;
    const score = (habitDone[s.id] ?? 0) * 2 + (taskDone[s.id] ?? 0) * 3 + goalAvg;
    scores[s.id] = Math.min(Math.round(score), 100);
  });
  return scores;
}

/** Personal vs social share in %. Without any data the split is 50/50 and `hasData` is false. */
export function computeBalanceSplit(personal: number, social: number): {
  personalPercent: number;
  socialPercent: number;
  hasData: boolean;
} {
  const p = Math.max(0, finiteOr0(personal));
  const s = Math.max(0, finiteOr0(social));
  const total = p + s;
  if (total <= 0) return { personalPercent: 50, socialPercent: 50, hasData: false };
  const personalPercent = Math.round((p / total) * 100);
  return { personalPercent, socialPercent: 100 - personalPercent, hasData: true };
}

/** «Сферы жизни» wheel value 0..10: average of goal progress and share of completed tasks. */
export function computeSectionScores(
  goals: Pick<GoalRow, 'sphere' | 'progress'>[],
  habits: Pick<HabitRow, 'life_sphere'>[],
  tasks: Pick<TaskRow, 'sphere' | 'status'>[],
): Record<string, number> {
  const scores: Record<string, number> = {};
  SPHERES.forEach(s => {
    const sGoals = goals.filter(g => g.sphere === s.id);
    const sHabits = habits.filter(h => h.life_sphere === s.id);
    const sTasks = tasks.filter(t => t.sphere === s.id && t.status !== 'CANCELLED');
    if (sGoals.length + sHabits.length + sTasks.length === 0) { scores[s.id] = 0; return; }
    const goalScore = sGoals.length > 0 ? sGoals.reduce((sum, g) => sum + clampPercent(g.progress), 0) / sGoals.length : 0;
    const doneRatio = sTasks.length > 0 ? (sTasks.filter(t => t.status === 'DONE').length / sTasks.length) * 100 : 0;
    scores[s.id] = Math.min(10, Math.round((goalScore + doneRatio) / 2 / 10));
  });
  return scores;
}

// ─── Archive ────────────────────────────────────────────────────────────────

/** Tasks shown for a calendar day in the archive: due that day or created that (local) day. */
export function isTaskOnDay(task: Pick<TaskRow, 'due_date' | 'created_at'>, day: string): boolean {
  return task.due_date === day || isoToLocalDateStr(task.created_at) === day;
}

/** Goals shown for a calendar day in the archive: deadline that day or created that (local) day. */
export function isGoalOnDay(goal: Pick<GoalRow, 'target_date' | 'deadline' | 'created_at'>, day: string): boolean {
  return (goal.target_date ?? goal.deadline) === day || isoToLocalDateStr(goal.created_at) === day;
}

/** Habits whose fixed period is over (they are no longer scheduled) — the "archived" habits. */
export function isHabitFinished(habit: Pick<HabitRow, 'period_type' | 'period_end'>, today: string): boolean {
  return habit.period_type !== 'none' && !!habit.period_end && habit.period_end < today;
}
