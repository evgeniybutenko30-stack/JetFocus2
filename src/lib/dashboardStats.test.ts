import { describe, expect, it } from 'vitest';
import {
  buildDynamicsSeries,
  buildTrendBuckets,
  calculateDayProgressScore,
  computeBalanceSplit,
  computeFinanceSummary,
  computeFocusMinutes,
  computeHabitCompletionRate,
  computeHabitTaskMetrics,
  computePeriodTotals,
  computeSectionScores,
  computeSphereActivityScores,
  computeSphereBalance,
  isGoalAchieved,
  isGoalOnDay,
  isHabitFinished,
  isTaskForDay,
  isTaskOnDay,
  remainingSeconds,
  taskDoneDay,
} from './dashboardStats';
import type { HabitCompletionRow, HabitRow } from './habitsService';
import type { TaskRow } from './tasksService';
import type { GoalRow } from './goalsService';

// Tuesday 13 Oct 2026, 10:00 LOCAL time (tests are timezone-independent: every timestamp
// below is built from local Date parts, exactly like the app's "today").
const NOW = new Date(2026, 9, 13, 10, 0, 0);
const TODAY = '2026-10-13';
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

function localIso(y: number, m: number, d: number, hh = 12, mm = 0): string {
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

function habit(partial: Partial<HabitRow> = {}): HabitRow {
  return {
    id: 'h1',
    user_id: 'u1',
    title: 'Habit',
    period_type: 'none',
    period_start: null,
    period_end: null,
    goal_id: null,
    life_sphere: 'health',
    repetitions_per_day: 1,
    target_days: ALL_DAYS,
    icon: '💪',
    created_at: localIso(2026, 1, 1),
    updated_at: localIso(2026, 1, 1),
    ...partial,
  };
}

function completion(habitId: string, date: string, count = 1): HabitCompletionRow {
  return { id: `${habitId}-${date}`, user_id: 'u1', habit_id: habitId, date, count, created_at: localIso(2026, 10, 13) };
}

function task(partial: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 't1',
    user_id: 'u1',
    title: 'Task',
    sphere: 'career',
    priority: 'MEDIUM',
    status: 'TODO',
    due_date: null,
    completed_at: null,
    created_at: localIso(2026, 10, 1),
    updated_at: localIso(2026, 10, 1),
    ...partial,
  };
}

function goal(partial: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'g1',
    user_id: 'u1',
    title: 'Goal',
    sphere: 'career',
    status: 'active',
    progress: 0,
    is_pinned: false,
    created_at: localIso(2026, 10, 1),
    ...partial,
  };
}

describe('calculateDayProgressScore', () => {
  it('weights habits 40%, tasks 40%, focus 20% and never returns NaN for empty days', () => {
    expect(calculateDayProgressScore({ totalHabitsToday: 0, habitsDoneCount: 0, totalTasksToday: 0, tasksDoneCount: 0, focusMinutesToday: 0 })).toBe(0);
    expect(calculateDayProgressScore({ totalHabitsToday: 2, habitsDoneCount: 1, totalTasksToday: 4, tasksDoneCount: 4, focusMinutesToday: 50 })).toBe(80);
  });

  it('clamps over-counted / corrupt inputs to 0..100', () => {
    expect(calculateDayProgressScore({ totalHabitsToday: 1, habitsDoneCount: 5, totalTasksToday: 1, tasksDoneCount: 3, focusMinutesToday: 999 })).toBe(100);
    expect(calculateDayProgressScore({ totalHabitsToday: 1, habitsDoneCount: Number.NaN, totalTasksToday: 0, tasksDoneCount: 0, focusMinutesToday: -5 })).toBe(0);
  });
});

describe('isTaskForDay / taskDoneDay', () => {
  it('uses the LOCAL day of created_at for tasks without a due date (00:30 local is still "today")', () => {
    const t = task({ created_at: localIso(2026, 10, 13, 0, 30) });
    expect(isTaskForDay(t, TODAY)).toBe(true);
    expect(isTaskForDay(t, '2026-10-12')).toBe(false);
  });

  it('prefers due_date and excludes cancelled tasks', () => {
    expect(isTaskForDay(task({ due_date: TODAY, created_at: localIso(2026, 9, 1) }), TODAY)).toBe(true);
    expect(isTaskForDay(task({ due_date: '2026-10-14', created_at: localIso(2026, 10, 13) }), TODAY)).toBe(false);
    expect(isTaskForDay(task({ status: 'CANCELLED', due_date: TODAY }), TODAY)).toBe(false);
  });

  it('counts a done task on the local completion day, falling back to due date', () => {
    expect(taskDoneDay(task({ status: 'DONE', completed_at: localIso(2026, 10, 12, 23, 50), due_date: TODAY }))).toBe('2026-10-12');
    expect(taskDoneDay(task({ status: 'DONE', completed_at: null, due_date: TODAY }))).toBe(TODAY);
    expect(taskDoneDay(task({ status: 'TODO', completed_at: localIso(2026, 10, 12) }))).toBeNull();
  });
});

describe('computeHabitTaskMetrics', () => {
  it('only counts habits scheduled today (weekday + period) and done only at the daily target', () => {
    const habits = [
      habit({ id: 'daily' }),
      habit({ id: 'reps', repetitions_per_day: 3 }),
      habit({ id: 'mondays', target_days: [1] }), // today is Tuesday
      habit({ id: 'ended', period_type: 'custom', period_start: '2026-09-01', period_end: '2026-10-01' }),
    ];
    const completions = [completion('daily', TODAY), completion('reps', TODAY, 2), completion('daily', '2026-10-12')];
    const tasks = [
      task({ id: 'a', due_date: TODAY, status: 'DONE' }),
      task({ id: 'b', due_date: TODAY, status: 'IN_PROGRESS' }),
      task({ id: 'c', due_date: TODAY, status: 'CANCELLED' }),
      task({ id: 'd', due_date: '2026-10-12', status: 'TODO' }),
    ];
    expect(computeHabitTaskMetrics(habits, completions, tasks, NOW)).toEqual({
      totalHabitsToday: 2,
      habitsDoneCount: 1,
      habitsTodoCount: 1,
      totalTasksToday: 2,
      tasksDoneCount: 1,
      tasksTodoCount: 1,
    });
  });

  it('returns zeros for a brand-new user', () => {
    expect(computeHabitTaskMetrics([], [], [], NOW)).toEqual({
      totalHabitsToday: 0, habitsDoneCount: 0, habitsTodoCount: 0, totalTasksToday: 0, tasksDoneCount: 0, tasksTodoCount: 0,
    });
  });
});

describe('computeFinanceSummary', () => {
  it('matches the Finance page balance: opening balances + ops, hidden / foreign accounts excluded, transfers neutral', () => {
    const accounts = [
      { id: 'card', balance: 10000, currency: '₽', hideFromTotal: false },
      { id: 'hidden', balance: 50000, currency: '₽', hideFromTotal: true },
      { id: 'usd', balance: 700, currency: '$', hideFromTotal: false },
    ];
    const ops = [
      { type: 'INCOME' as const, amount: 5000, date: TODAY, accountId: 'card' },
      { type: 'EXPENSE' as const, amount: 1500, date: TODAY, accountId: 'card' },
      { type: 'EXPENSE' as const, amount: 300, date: '2026-10-01' }, // no account → counts
      { type: 'EXPENSE' as const, amount: 999, date: TODAY, accountId: 'hidden' },
      { type: 'TRANSFER' as const, amount: 2000, date: TODAY, accountId: 'card', toAccountId: 'hidden' },
    ];
    expect(computeFinanceSummary(ops, accounts, TODAY)).toEqual({
      todayIncome: 5000,
      todayExpense: 1500 + 999,
      // 10000 + 5000 - 1500 - 300 - 2000 (moved to a hidden account)
      balanceTotal: 11200,
    });
  });

  it('ignores corrupt amounts instead of turning totals into NaN', () => {
    const r = computeFinanceSummary([{ type: 'INCOME', amount: Number.NaN, date: TODAY }], [], TODAY);
    expect(r).toEqual({ todayIncome: 0, todayExpense: 0, balanceTotal: 0 });
  });
});

describe('focus helpers', () => {
  it('sums only the given user and day, in whole minutes', () => {
    const sessions = [
      { userId: 'u1', date: TODAY, durationSeconds: 1500 },
      { userId: 'u1', date: TODAY, durationSeconds: 59 },
      { userId: 'u2', date: TODAY, durationSeconds: 1500 },
      { userId: 'u1', date: '2026-10-12', durationSeconds: 1500 },
      { userId: 'u1', date: TODAY, durationSeconds: -100 },
    ];
    expect(computeFocusMinutes(sessions, 'u1', TODAY)).toBe(25);
  });

  it('remainingSeconds is timestamp based and never negative', () => {
    const endsAt = 1_000_000;
    expect(remainingSeconds(endsAt, endsAt - 25 * 60 * 1000)).toBe(1500);
    expect(remainingSeconds(endsAt, endsAt - 1)).toBe(1);
    expect(remainingSeconds(endsAt, endsAt + 60_000)).toBe(0);
  });
});

describe('computeSphereBalance / computeHabitCompletionRate', () => {
  it('scores done / scheduled habit-days (partial days do not count) on a 0..10 scale', () => {
    // Created 10 days ago (local), scheduled every day → 10 scheduled days in the window.
    const h = habit({ id: 'h', life_sphere: 'health', repetitions_per_day: 2, created_at: localIso(2026, 10, 4, 9) });
    const completions = [
      completion('h', '2026-10-13', 2),
      completion('h', '2026-10-12', 2),
      completion('h', '2026-10-11', 1), // partial
      completion('h', '2026-10-10', 2),
      completion('h', '2026-10-09', 2),
      completion('h', '2026-10-08', 2),
    ];
    const balance = computeSphereBalance([h], completions, 30, NOW);
    expect(balance.health).toBe(5); // 5 of 10 days
    expect(balance.career).toBe(0);
    expect(Object.keys(balance)).toHaveLength(8);
    expect(computeHabitCompletionRate([h], completions, 30, NOW)).toBe(50);
  });

  it('is 0 (not NaN) without habits', () => {
    expect(computeSphereBalance([], [], 30, NOW).health).toBe(0);
    expect(computeHabitCompletionRate([], [], 7, NOW)).toBe(0);
  });
});

describe('buildDynamicsSeries', () => {
  it('returns one point per local day ending today with local weekdays', () => {
    const series = buildDynamicsSeries(7, [], [], [], [], NOW);
    expect(series).toHaveLength(7);
    expect(series[6]).toMatchObject({ date: TODAY, weekday: 2 }); // Tuesday
    expect(series[0]).toMatchObject({ date: '2026-10-07', weekday: 3 }); // Wednesday
    expect(series.every(p => p.score === 0)).toBe(true);
  });

  it('counts done habits, completed tasks and focus minutes per day, capped at 100', () => {
    const habits = [habit({ id: 'a' }), habit({ id: 'b', repetitions_per_day: 2 })];
    const completions = [completion('a', TODAY), completion('b', TODAY, 1), completion('a', '2026-10-12')];
    const tasks = [
      task({ id: 't1', status: 'DONE', completed_at: localIso(2026, 10, 13, 0, 15) }),
      task({ id: 't2', status: 'DONE', completed_at: localIso(2026, 10, 12, 23, 45) }),
    ];
    const sessions = [{ date: TODAY, durationSeconds: 30 * 60 }];
    const series = buildDynamicsSeries(2, habits, completions, tasks, sessions, NOW);
    expect(series[1]).toMatchObject({ date: TODAY, habits: 1, tasks: 1, focusMins: 30, score: 10 + 15 + 30 });
    expect(series[0]).toMatchObject({ date: '2026-10-12', habits: 1, tasks: 1, focusMins: 0, score: 25 });

    const busy = buildDynamicsSeries(1, [], [], Array.from({ length: 10 }, (_, i) => task({ id: `x${i}`, status: 'DONE', completed_at: localIso(2026, 10, 13) })), [], NOW);
    expect(busy[0].score).toBe(100);
  });
});

describe('buildTrendBuckets / computePeriodTotals', () => {
  const habits = [habit({ id: 'h' })];
  const completions = Array.from({ length: 365 }, (_, i) => {
    const d = new Date(2026, 9, 13 - i, 12);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return completion('h', ds);
  });

  it('daily buckets for short periods, ending today', () => {
    const buckets = buildTrendBuckets(7, habits, completions, [], NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets.every(b => b.habits === 1)).toBe(true);
    expect(buckets[6].end.getDate()).toBe(13);
  });

  it('long periods are bucketed but every day is counted exactly once (no sampling)', () => {
    const buckets = buildTrendBuckets(365, habits, completions, [], NOW);
    expect(buckets.length).toBeLessThanOrEqual(21);
    expect(buckets.reduce((s, b) => s + b.habits, 0)).toBe(365);
  });

  it('period totals are inclusive local-day ranges', () => {
    const tasks = [
      task({ id: 'in', status: 'DONE', completed_at: localIso(2026, 10, 7, 0, 5) }),
      task({ id: 'out', status: 'DONE', completed_at: localIso(2026, 10, 6, 23, 55) }),
      task({ id: 'open', status: 'TODO' }),
    ];
    expect(computePeriodTotals(habits, completions, tasks, '2026-10-07', TODAY)).toEqual({ habitsDone: 7, tasksDone: 1 });
  });
});

describe('sphere scores and balance split', () => {
  it('activity scores use only the period and cap at 100', () => {
    const habits = [habit({ id: 'h', life_sphere: 'health' })];
    const completions = [completion('h', TODAY), completion('h', '2026-10-12'), completion('h', '2026-09-01')];
    const tasks = [task({ status: 'DONE', sphere: 'career', completed_at: localIso(2026, 10, 13) })];
    const goals = [goal({ sphere: 'career', progress: 40 }), goal({ id: 'g2', sphere: 'career', progress: Number.NaN })];
    const scores = computeSphereActivityScores(habits, completions, tasks, goals, '2026-10-07', TODAY);
    expect(scores.health).toBe(4); // 2 done days × 2
    expect(scores.career).toBe(3 + 20); // 1 task × 3 + avg(40, 0)
    expect(scores.finance).toBe(0);
  });

  it('balance split is 50/50 without data instead of "100% social"', () => {
    expect(computeBalanceSplit(0, 0)).toEqual({ personalPercent: 50, socialPercent: 50, hasData: false });
    expect(computeBalanceSplit(30, 10)).toEqual({ personalPercent: 75, socialPercent: 25, hasData: true });
    expect(computeBalanceSplit(Number.NaN, 5)).toEqual({ personalPercent: 0, socialPercent: 100, hasData: true });
  });

  it('section scores: average of goal progress and done-task share, 0..10', () => {
    const scores = computeSectionScores(
      [goal({ sphere: 'career', progress: 60 })],
      [habit({ life_sphere: 'health' })],
      [task({ sphere: 'career', status: 'DONE' }), task({ id: 't2', sphere: 'career', status: 'TODO' }), task({ id: 't3', sphere: 'career', status: 'CANCELLED' })],
    );
    expect(scores.career).toBe(6); // (60 + 50) / 2 / 10 → 5.5 → 6
    expect(scores.health).toBe(0);
    expect(scores.finance).toBe(0);
  });
});

describe('archive helpers', () => {
  it('matches tasks / goals by due date or LOCAL creation day', () => {
    expect(isTaskOnDay(task({ due_date: null, created_at: localIso(2026, 10, 13, 0, 10) }), TODAY)).toBe(true);
    expect(isTaskOnDay(task({ due_date: TODAY, created_at: localIso(2026, 1, 1) }), TODAY)).toBe(true);
    expect(isGoalOnDay(goal({ target_date: TODAY }), TODAY)).toBe(true);
    expect(isGoalOnDay(goal({ target_date: null, deadline: TODAY }), TODAY)).toBe(true);
    expect(isGoalOnDay(goal({ created_at: localIso(2026, 10, 12, 23, 59) }), TODAY)).toBe(false);
  });

  it('a habit is "archived" only when its fixed period is over', () => {
    expect(isHabitFinished({ period_type: 'custom', period_end: '2026-10-12' }, TODAY)).toBe(true);
    expect(isHabitFinished({ period_type: 'custom', period_end: TODAY }, TODAY)).toBe(false);
    expect(isHabitFinished({ period_type: 'none', period_end: '2020-01-01' }, TODAY)).toBe(false);
  });

  it('isGoalAchieved accepts the current and legacy markers', () => {
    expect(isGoalAchieved({ status: 'completed' })).toBe(true);
    expect(isGoalAchieved({ status: 'active', is_achieved: true })).toBe(true);
    expect(isGoalAchieved({ status: 'paused', is_achieved: false })).toBe(false);
  });
});
