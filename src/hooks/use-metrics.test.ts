import { beforeEach, describe, expect, it, vi } from 'vitest';

type DbError = { message: string; code?: string };
type Result = { data: unknown; error: DbError | null };

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Result>,
  focusSessions: [] as unknown[],
  ops: [] as unknown[],
  accounts: [] as unknown[],
}));

vi.mock('@/lib/supabase', () => {
  class Query implements PromiseLike<Result> {
    constructor(private table: string) {}
    select() { return this; }
    eq() { return this; }
    gte() { return this; }
    order() { return this; }
    then<T1 = Result, T2 = never>(
      onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(h.tables[this.table] ?? { data: [], error: null }).then(onFulfilled, onRejected);
    }
  }
  return { supabase: { from: (table: string) => new Query(table) } };
});
vi.mock('@/lib/db', () => {
  const table = (rows: () => unknown[]) => ({ where: () => ({ equals: () => ({ toArray: async () => rows() }) }) });
  return {
    db: {
      focusSessions: table(() => h.focusSessions),
      financeOperations: table(() => h.ops),
      financeAccounts: table(() => h.accounts),
    },
  };
});
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => null }));

import { loadDayMetrics } from './use-metrics';

const NOW = new Date(2026, 9, 13, 10, 0, 0); // Tuesday, local
const TODAY = '2026-10-13';

function localIso(d: number, hh = 12, mm = 0): string {
  return new Date(2026, 9, d, hh, mm).toISOString();
}

beforeEach(() => {
  h.tables = {
    habits: {
      data: [
        { id: 'h1', target_days: [1, 2, 3, 4, 5, 6, 7], repetitions_per_day: 1, period_type: 'none', period_start: null, period_end: null, life_sphere: 'health', created_at: localIso(1) },
        // Period already over: must not count as "today" any more.
        { id: 'h2', target_days: [1, 2, 3, 4, 5, 6, 7], repetitions_per_day: 1, period_type: 'custom', period_start: '2026-09-01', period_end: '2026-10-01', life_sphere: 'health', created_at: localIso(1) },
      ],
      error: null,
    },
    habit_completions: { data: [{ id: 'c1', habit_id: 'h1', date: TODAY, count: 1 }], error: null },
    tasks: {
      data: [
        // No due date, created 00:30 LOCAL today: belongs to today in every timezone.
        { id: 't1', status: 'TODO', due_date: null, created_at: localIso(13, 0, 30) },
        { id: 't2', status: 'DONE', due_date: TODAY, created_at: localIso(1) },
      ],
      error: null,
    },
    goals: {
      data: [
        { id: 'g1', status: 'active' },
        { id: 'g2', status: 'paused' },
        { id: 'g3', status: 'completed', is_achieved: true },
        { id: 'g4', status: 'archived' },
        { id: 'g5', status: 'active' },
      ],
      error: null,
    },
  };
  h.focusSessions = [
    { userId: 'u1', date: TODAY, durationSeconds: 1500 },
    { userId: 'someone-else', date: TODAY, durationSeconds: 1500 },
  ];
  h.ops = [{ type: 'INCOME', amount: 10000, date: TODAY, userId: 'u1' }];
  h.accounts = [{ id: 'a1', balance: 5000, currency: '₽', hideFromTotal: false }];
});

describe('loadDayMetrics', () => {
  it('counts only active goals and respects habit periods and local task days', async () => {
    const m = await loadDayMetrics('u1', NOW);
    expect(m.goalsActiveCount).toBe(2);
    expect(m.totalHabitsToday).toBe(1);
    expect(m.habitsDoneCount).toBe(1);
    expect(m.totalTasksToday).toBe(2);
    expect(m.tasksDoneCount).toBe(1);
    expect(m.tasksTodoCount).toBe(1);
    expect(m.focusMinutesToday).toBe(25);
    expect(m.todayIncome).toBe(10000);
    expect(m.balanceTotal).toBe(15000);
    // 0.4 * 1 + 0.4 * 0.5 + 0.2 * 1
    expect(m.dayProgressScore).toBe(80);
  });

  it('throws on a failed core read so React Query keeps the last good numbers', async () => {
    h.tables.tasks = { data: null, error: { message: 'network down' } };
    await expect(loadDayMetrics('u1', NOW)).rejects.toThrow('network down');
  });

  it('tolerates a failed goals read (secondary counter)', async () => {
    h.tables.goals = { data: null, error: { message: 'relation "goals" does not exist' } };
    const m = await loadDayMetrics('u1', NOW);
    expect(m.goalsActiveCount).toBe(0);
    expect(m.totalHabitsToday).toBe(1);
  });
});
