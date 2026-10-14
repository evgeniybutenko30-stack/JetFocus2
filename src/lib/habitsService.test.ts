// Europe/Berlin: a UTC+1/+2 zone with DST. Between 00:00 and 01:00/02:00 local time the
// UTC date (toISOString) is the previous day — exactly where the old streak / stars code
// counted the wrong day — and the DST switches exercise the "24h blocks" bug.
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = 'Europe/Berlin';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => {
  type Result = { data: unknown; error: unknown };
  type Op = [string, unknown[]];
  interface Call { table: string; ops: Op[] }

  const state = { calls: [] as Call[], queue: [] as Result[] };

  class Builder implements PromiseLike<Result> {
    private result: Result | null = null;
    constructor(private readonly call: Call) {}
    private add(op: string, args: unknown[]): this {
      this.call.ops.push([op, args]);
      return this;
    }
    private resolveOnce(): Result {
      if (!this.result) {
        const next = state.queue.shift();
        if (!next) throw new Error(`Unexpected query on ${this.call.table}: ${JSON.stringify(this.call.ops)}`);
        this.result = next;
      }
      return this.result;
    }
    select(...a: unknown[]) { return this.add('select', a); }
    insert(...a: unknown[]) { return this.add('insert', a); }
    update(...a: unknown[]) { return this.add('update', a); }
    delete(...a: unknown[]) { return this.add('delete', a); }
    eq(...a: unknown[]) { return this.add('eq', a); }
    in(...a: unknown[]) { return this.add('in', a); }
    gte(...a: unknown[]) { return this.add('gte', a); }
    order(...a: unknown[]) { return this.add('order', a); }
    maybeSingle(): Promise<Result> {
      this.add('maybeSingle', []);
      return Promise.resolve(this.resolveOnce());
    }
    then<T1 = Result, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.resolveOnce()).then(onfulfilled, onrejected);
    }
  }

  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    state.calls.push(call);
    return new Builder(call);
  };

  return { state, from, awardStars: vi.fn(), revokeStars: vi.fn() };
});

vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from } }));
vi.mock('@/lib/starsService', () => ({ awardStars: mock.awardStars, revokeStars: mock.revokeStars }));

import {
  addLocalDays,
  averageCompletion,
  buildGoogleCalendarUrl,
  calculateStreak,
  computeDailyProgress,
  computeSphereRates,
  createHabit,
  ensureDefaultTags,
  fromLocalDateStr,
  getDayCompletionStats,
  getHabitById,
  incrementCompletion,
  isCompletionDone,
  isHabitActiveToday,
  isHabitScheduledOn,
  isoWeekday,
  makeTagSlug,
  normalizeTargetDays,
  removeCompletionFromList,
  resetCompletion,
  safePercent,
  summarizeStars,
  toHabitErrorMessage,
  toLocalDateStr,
  updateHabit,
  upsertCompletionInList,
  validateHabitPeriod,
  type HabitCompletionRow,
  type HabitRow,
} from './habitsService';

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAYS = [1, 2, 3, 4, 5];

function completion(habitId: string, date: string, count = 1): HabitCompletionRow {
  return { id: `${habitId}-${date}`, user_id: 'u1', habit_id: habitId, date, count, created_at: `${date}T08:00:00Z` };
}

function habit(overrides: Partial<HabitRow> = {}): HabitRow {
  return {
    id: 'h1',
    user_id: 'u1',
    title: 'Читать',
    period_type: 'none',
    period_start: null,
    period_end: null,
    goal_id: null,
    life_sphere: 'health',
    repetitions_per_day: 1,
    target_days: ALL_DAYS,
    icon: 'book',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    ...overrides,
  };
}

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('timezone sanity', () => {
  it('runs in Europe/Berlin', () => {
    // 22:30 UTC on Oct 12 is 00:30 CEST on Oct 13.
    expect(new Date('2026-10-12T22:30:00Z').getHours()).toBe(0);
    expect(new Date('2026-10-12T22:30:00Z').getDate()).toBe(13);
  });
});

describe('local date helpers', () => {
  it('toLocalDateStr uses the local day, not the UTC one', () => {
    const earlyMorning = new Date(2026, 9, 13, 0, 30); // Oct 13, 00:30 local = Oct 12 UTC
    expect(earlyMorning.toISOString().slice(0, 10)).toBe('2026-10-12');
    expect(toLocalDateStr(earlyMorning)).toBe('2026-10-13');
  });

  it('addLocalDays shifts calendar days across DST switches', () => {
    // Spring forward: Mar 29 2026 has only 23 hours in Berlin.
    const afterSpring = new Date(2026, 2, 30, 0, 30);
    expect(toLocalDateStr(addLocalDays(afterSpring, -1))).toBe('2026-03-29');
    expect(toLocalDateStr(addLocalDays(afterSpring, -2))).toBe('2026-03-28');
    // Fall back: Oct 25 2026 has 25 hours.
    const afterFall = new Date(2026, 9, 26, 23, 30);
    expect(toLocalDateStr(addLocalDays(afterFall, -1))).toBe('2026-10-25');
    expect(toLocalDateStr(addLocalDays(afterFall, 1))).toBe('2026-10-27');
  });

  it('isoWeekday maps Sunday to 7 and Monday to 1', () => {
    expect(isoWeekday(new Date(2026, 9, 11))).toBe(7); // Sunday
    expect(isoWeekday(new Date(2026, 9, 12))).toBe(1); // Monday
  });

  it('fromLocalDateStr parses to local noon and tolerates garbage', () => {
    const d = fromLocalDateStr('2026-03-29');
    expect(toLocalDateStr(d)).toBe('2026-03-29');
    expect(d.getHours()).toBe(12);
    expect(fromLocalDateStr('nope')).toBeInstanceOf(Date);
  });

  it('normalizeTargetDays drops invalid values, dedupes and sorts numerically', () => {
    expect(normalizeTargetDays([7, 1, 1, 0, 8, 3])).toEqual([1, 3, 7]);
    expect(normalizeTargetDays(null)).toEqual([]);
  });
});

describe('calculateStreak', () => {
  const now = new Date(2026, 9, 14, 15, 0); // Wed Oct 14

  it('counts consecutive completed days including today', () => {
    const c = ['2026-10-12', '2026-10-13', '2026-10-14'].map(d => completion('h1', d));
    expect(calculateStreak('h1', c, ALL_DAYS, 1, now)).toBe(3);
  });

  it('does not break the streak when today is not done yet', () => {
    const c = ['2026-10-12', '2026-10-13'].map(d => completion('h1', d));
    expect(calculateStreak('h1', c, ALL_DAYS, 1, now)).toBe(2);
  });

  it('a missed scheduled day ends the streak', () => {
    const c = ['2026-10-11', '2026-10-12', '2026-10-14'].map(d => completion('h1', d));
    expect(calculateStreak('h1', c, ALL_DAYS, 1, now)).toBe(1);
  });

  it('skips non-target days (weekend gap for a weekdays habit)', () => {
    // Fri Oct 9, Mon Oct 12, Tue Oct 13 → 3, the weekend is not a gap.
    const c = ['2026-10-09', '2026-10-12', '2026-10-13'].map(d => completion('h1', d));
    expect(calculateStreak('h1', c, WEEKDAYS, 1, now)).toBe(3);
  });

  it('only counts days where the daily target was reached', () => {
    const c = [completion('h1', '2026-10-12', 3), completion('h1', '2026-10-13', 1)];
    expect(calculateStreak('h1', c, ALL_DAYS, 3, now)).toBe(0);
    expect(calculateStreak('h1', [completion('h1', '2026-10-13', 3)], ALL_DAYS, 3, now)).toBe(1);
  });

  it('a partial completion today does not break the streak', () => {
    const c = [completion('h1', '2026-10-13', 2), completion('h1', '2026-10-14', 1)];
    expect(calculateStreak('h1', c, ALL_DAYS, 2, now)).toBe(1);
  });

  it('uses the local date shortly after midnight (UTC is still yesterday)', () => {
    const justAfterMidnight = new Date(2026, 9, 14, 0, 20);
    const c = ['2026-10-13', '2026-10-14'].map(d => completion('h1', d));
    expect(calculateStreak('h1', c, ALL_DAYS, 1, justAfterMidnight)).toBe(2);
  });

  it('is not shifted by the spring DST switch', () => {
    const now2 = new Date(2026, 2, 30, 0, 30); // Mon Mar 30, 00:30 CEST
    const c = ['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30'].map(d => completion('h1', d));
    expect(calculateStreak('h1', c, ALL_DAYS, 1, now2)).toBe(4);
  });

  it('ignores other habits and returns 0 without target days', () => {
    const c = [completion('h2', '2026-10-14'), completion('h2', '2026-10-13')];
    expect(calculateStreak('h1', c, ALL_DAYS, 1, now)).toBe(0);
    expect(calculateStreak('h1', [completion('h1', '2026-10-14')], [], 1, now)).toBe(0);
  });
});

describe('schedule helpers', () => {
  const wed = new Date(2026, 9, 14, 9, 0);

  it('respects target days', () => {
    expect(isHabitActiveToday(habit({ target_days: [3] }), wed)).toBe(true);
    expect(isHabitActiveToday(habit({ target_days: [1, 2] }), wed)).toBe(false);
  });

  it('respects the custom period', () => {
    const h = habit({ period_type: 'custom', period_start: '2026-10-15', period_end: '2026-10-20' });
    expect(isHabitActiveToday(h, wed)).toBe(false);
    expect(isHabitActiveToday(h, new Date(2026, 9, 20, 23, 0))).toBe(true);
    expect(isHabitActiveToday(h, new Date(2026, 9, 21, 0, 10))).toBe(false);
  });

  it('respectCreatedAt excludes days before the habit existed (local date)', () => {
    // Created 23:30 UTC Oct 13 = 01:30 local Oct 14.
    const h = habit({ created_at: '2026-10-13T23:30:00Z' });
    expect(isHabitScheduledOn(h, new Date(2026, 9, 13, 12), { respectCreatedAt: true })).toBe(false);
    expect(isHabitScheduledOn(h, new Date(2026, 9, 14, 12), { respectCreatedAt: true })).toBe(true);
    expect(isHabitScheduledOn(h, new Date(2026, 9, 13, 12))).toBe(true);
  });

  it('isCompletionDone guards against a zero/invalid target', () => {
    expect(isCompletionDone(1, 0)).toBe(true);
    expect(isCompletionDone(0, 0)).toBe(false);
    expect(isCompletionDone(undefined, 1)).toBe(false);
    expect(isCompletionDone(2, 3)).toBe(false);
  });
});

describe('progress analytics', () => {
  const now = new Date(2026, 9, 14, 12, 0);

  it('does not count days before the habit was created as missed', () => {
    const h = habit({ created_at: '2026-10-14T06:00:00Z' });
    const points = computeDailyProgress([h], [completion('h1', '2026-10-14')], 7, now);
    expect(points).toHaveLength(7);
    expect(points.slice(0, 6).every(p => p.total === 0 && p.value === 0)).toBe(true);
    expect(points[6]).toMatchObject({ done: 1, total: 1, value: 100 });
    // Average over days that had habits — a brand-new account that did everything is 100%, not 14%.
    expect(averageCompletion(points)).toBe(100);
  });

  it('never exceeds 100% when a habit was done on a non-scheduled day', () => {
    const scheduled = habit({ id: 'a', target_days: [3] });
    const offDay = habit({ id: 'b', target_days: [1] });
    const stats = getDayCompletionStats(
      [scheduled, offDay],
      [completion('a', '2026-10-14'), completion('b', '2026-10-14')],
      now,
    );
    expect(stats).toEqual({ done: 1, total: 1 });
  });

  it('yields 0 (not NaN) without habits', () => {
    const points = computeDailyProgress([], [], 30, now);
    expect(points.every(p => p.value === 0)).toBe(true);
    expect(averageCompletion(points)).toBe(0);
    expect(averageCompletion([])).toBe(0);
  });

  it('sphere rates only count the selected window and completed days', () => {
    const h = habit({ id: 'a', life_sphere: 'health', repetitions_per_day: 2 });
    const c = [
      completion('a', '2026-10-14', 2), // done
      completion('a', '2026-10-13', 1), // partial — not done
      completion('a', '2026-09-01', 2), // outside a 7-day window
    ];
    const rates = computeSphereRates([h], c, 7, now);
    expect(rates.get('health')).toEqual({ done: 1, planned: 7 });
    expect(safePercent(1, 7)).toBe(14);
  });

  it('safePercent handles zero and clamps', () => {
    expect(safePercent(3, 0)).toBe(0);
    expect(safePercent(5, 2)).toBe(100);
    expect(safePercent(Number.NaN, 2)).toBe(0);
  });
});

describe('summarizeStars', () => {
  it('buckets by the LOCAL date of created_at', () => {
    const now = new Date(2026, 9, 13, 0, 45); // Oct 13 00:45 local = Oct 12 22:45 UTC
    const s = summarizeStars([
      { delta: 1, created_at: '2026-10-12T22:30:00Z' }, // Oct 13 00:30 local → today
      { delta: 2, created_at: '2026-10-12T20:00:00Z' }, // Oct 12 22:00 local → this week
      { delta: 4, created_at: '2026-10-06T23:00:00Z' }, // Oct 7 01:00 local → day 7 of the week
      { delta: 8, created_at: '2026-10-06T12:00:00Z' }, // Oct 6 → older than 7 days
      { delta: null, created_at: null },
    ], now);
    expect(s).toEqual({ today: 1, week: 7, total: 15 });
  });
});

describe('form helpers', () => {
  it('validateHabitPeriod mirrors the DB custom_period_check', () => {
    expect(validateHabitPeriod('none', '', '')).toBeNull();
    expect(validateHabitPeriod('week', '', '')).toBeNull();
    expect(validateHabitPeriod('custom', '', '2026-10-20')).not.toBeNull();
    expect(validateHabitPeriod('custom', '2026-10-21', '2026-10-20')).not.toBeNull();
    expect(validateHabitPeriod('custom', '2026-10-20', '2026-10-20')).toBeNull();
  });

  it('makeTagSlug keeps cyrillic and never returns an empty slug', () => {
    expect(makeTagSlug('  Утро Рано! ')).toBe('утро_рано');
    const a = makeTagSlug('🔥🔥');
    const b = makeTagSlug('💧');
    expect(a).toMatch(/^tag_[0-9a-z]+$/);
    expect(a).not.toBe(b);
    expect(makeTagSlug('🔥🔥')).toBe(a);
  });

  it('toHabitErrorMessage does not report a check-constraint as an access problem', () => {
    expect(toHabitErrorMessage({ message: 'new row for relation "habits" violates check constraint "custom_period_check"' }))
      .toBe('Некорректные данные. Проверьте заполненные поля.');
    expect(toHabitErrorMessage({ message: 'new row violates row-level security policy for table "habits"' }))
      .toBe('Нарушение правил доступа. Убедитесь, что вы авторизованы.');
    expect(toHabitErrorMessage({ message: 'duplicate key value violates unique constraint' }))
      .toBe('Такая запись уже существует.');
    expect(toHabitErrorMessage({ message: 'TypeError: Failed to fetch' })).toMatch(/Нет соединения/);
    expect(toHabitErrorMessage(null)).toBe('Неизвестная ошибка');
  });
});

describe('completion cache helpers', () => {
  it('upsert replaces the row for the same habit+date', () => {
    const list = [completion('a', '2026-10-14', 1), completion('b', '2026-10-14', 1)];
    const next = upsertCompletionInList(list, completion('a', '2026-10-14', 2));
    expect(next).toHaveLength(2);
    expect(next.find(c => c.habit_id === 'a')?.count).toBe(2);
    expect(list.find(c => c.habit_id === 'a')?.count).toBe(1); // not mutated
  });

  it('remove drops only that habit+date', () => {
    const list = [completion('a', '2026-10-14'), completion('a', '2026-10-13'), completion('b', '2026-10-14')];
    expect(removeCompletionFromList(list, 'a', '2026-10-14').map(c => c.id)).toEqual(['a-2026-10-13', 'b-2026-10-14']);
  });
});

describe('buildGoogleCalendarUrl', () => {
  const now = new Date(2026, 9, 14, 0, 30); // local Oct 14 (UTC Oct 13)

  function parse(url: string) {
    return new URL(url).searchParams;
  }

  it('daily habit repeats daily, all-day event ends the next (exclusive) day', () => {
    const p = parse(buildGoogleCalendarUrl(habit({ title: 'Вода & сок' }), now));
    expect(p.get('recur')).toBe('RRULE:FREQ=DAILY');
    expect(p.get('dates')).toBe('20261014/20261015');
    expect(p.get('text')).toBe('Вода & сок');
  });

  it('weekday habit repeats on its days and stops at the period end', () => {
    const h = habit({ target_days: [1, 3, 5], period_type: 'custom', period_start: '2026-10-01', period_end: '2026-12-31' });
    expect(parse(buildGoogleCalendarUrl(h, now)).get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261231');
  });
});

// ─── Supabase flows (mocked client) ──────────────────────────────────────────

function queue(...results: { data?: unknown; error?: unknown }[]) {
  mock.state.queue.push(...results.map(r => ({ data: r.data ?? null, error: r.error ?? null })));
}

function opsOf(index: number): string[] {
  return mock.state.calls[index].ops.map(([op]) => op);
}

function hasOp(index: number, op: string, ...args: unknown[]): boolean {
  return mock.state.calls[index].ops.some(([o, a]) => o === op && args.every((v, i) => a[i] === v));
}

describe('incrementCompletion', () => {
  beforeEach(() => {
    mock.state.calls.length = 0;
    mock.state.queue.length = 0;
    mock.awardStars.mockReset().mockResolvedValue(true);
    mock.revokeStars.mockReset().mockResolvedValue(undefined);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 14, 0, 30)); // local Oct 14, UTC Oct 13
  });
  afterEach(() => {
    vi.useRealTimers();
    expect(mock.state.queue).toHaveLength(0); // every queued response was consumed
  });

  it('inserts the first completion for the LOCAL date and awards a star on reaching the target', async () => {
    queue({ data: null }, { data: completion('h1', '2026-10-14', 1) });
    const r = await incrementCompletion('u1', 'h1', 1);
    expect(r).toMatchObject({ starsAwarded: 1, justCompleted: true, error: null });
    expect(hasOp(0, 'eq', 'date', '2026-10-14')).toBe(true);
    expect(opsOf(1)).toContain('insert');
    expect(mock.awardStars).toHaveBeenCalledWith('u1', 1, 'habit_completion', 'habit_h1_2026-10-14');
  });

  it('a lost insert race (unique violation) is retried as an update instead of failing', async () => {
    queue(
      { data: null },
      { error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
      { data: completion('h1', '2026-10-14', 1) },
      { data: completion('h1', '2026-10-14', 2) },
    );
    const r = await incrementCompletion('u1', 'h1', 2);
    expect(r.error).toBeNull();
    expect(r.data?.count).toBe(2);
    expect(r.justCompleted).toBe(true);
    expect(opsOf(3)).toContain('update');
    expect(hasOp(3, 'eq', 'count', 1)).toBe(true); // compare-and-swap on the read value
  });

  it('a concurrent change (CAS miss) re-reads and does not over-increment past the target', async () => {
    queue(
      { data: completion('h1', '2026-10-14', 1) },
      { data: null }, // CAS update matched nothing: someone else incremented
      { data: completion('h1', '2026-10-14', 2) },
    );
    const r = await incrementCompletion('u1', 'h1', 2);
    expect(r).toMatchObject({ starsAwarded: 0, justCompleted: false, error: null });
    expect(r.data?.count).toBe(2);
    expect(mock.awardStars).not.toHaveBeenCalled();
  });

  it('does not award a star for an intermediate repetition', async () => {
    queue({ data: completion('h1', '2026-10-14', 1) }, { data: completion('h1', '2026-10-14', 2) });
    const r = await incrementCompletion('u1', 'h1', 3);
    expect(r).toMatchObject({ starsAwarded: 0, justCompleted: false, error: null });
    expect(mock.awardStars).not.toHaveBeenCalled();
  });

  it('reports a failed read instead of guessing "no completion yet"', async () => {
    queue({ error: { message: 'TypeError: Failed to fetch' } });
    const r = await incrementCompletion('u1', 'h1', 1);
    expect(r.error).toMatch(/Нет соединения/);
    expect(mock.state.calls).toHaveLength(1);
  });

  it('gives up with an error (not a false success) when the write keeps missing', async () => {
    queue(
      { data: completion('h1', '2026-10-14', 1) }, { data: null },
      { data: completion('h1', '2026-10-14', 1) }, { data: null },
      { data: completion('h1', '2026-10-14', 1) }, { data: null },
    );
    const r = await incrementCompletion('u1', 'h1', 3);
    expect(r.error).not.toBeNull();
    expect(r.data).toBeNull();
  });
});

describe('resetCompletion', () => {
  beforeEach(() => {
    mock.state.calls.length = 0;
    mock.state.queue.length = 0;
    mock.revokeStars.mockReset().mockResolvedValue(undefined);
  });

  it('deletes the completion first, then revokes the star', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 14, 0, 30)); // local Oct 14, UTC Oct 13
    try {
      queue({ data: { id: 'c1' } }, { data: null });
      const r = await resetCompletion('u1', 'h1');
      expect(r.error).toBeNull();
      expect(hasOp(0, 'eq', 'date', '2026-10-14')).toBe(true);
      expect(opsOf(1)).toContain('delete');
      expect(hasOp(1, 'eq', 'user_id', 'u1')).toBe(true);
      // Same key format as incrementCompletion's award (habit_<id>_<local date>).
      expect(mock.revokeStars).toHaveBeenCalledTimes(1);
      expect(mock.revokeStars).toHaveBeenCalledWith('u1', 'habit_h1_2026-10-14');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the star when the delete fails', async () => {
    queue({ data: { id: 'c1' } }, { error: { message: 'permission denied for table habit_completions' } });
    const r = await resetCompletion('u1', 'h1');
    expect(r.error).not.toBeNull();
    expect(mock.revokeStars).not.toHaveBeenCalled();
  });

  it('a failed read is an error, not a silent "reset"', async () => {
    queue({ error: { message: 'boom' } });
    expect((await resetCompletion('u1', 'h1')).error).toBe('boom');
  });
});

describe('habit CRUD', () => {
  beforeEach(() => {
    mock.state.calls.length = 0;
    mock.state.queue.length = 0;
  });

  it('updateHabit reports a habit that no longer exists instead of "saved"', async () => {
    queue({ data: [] });
    const r = await updateHabit('h1', 'u1', { title: 'x' });
    expect(r.error).not.toBeNull();
  });

  it('updateHabit only removes/adds the changed tag links', async () => {
    queue(
      { data: [{ id: 'h1' }] },
      { data: [{ tag_id: 'keep' }, { tag_id: 'drop' }] },
      { data: null }, // delete
      { data: null }, // insert
    );
    const r = await updateHabit('h1', 'u1', { title: 'x' }, ['keep', 'add']);
    expect(r).toEqual({ error: null });
    expect(hasOp(2, 'in')).toBe(true);
    expect(mock.state.calls[2].ops.find(([o]) => o === 'in')?.[1]).toEqual(['tag_id', ['drop']]);
    expect(mock.state.calls[3].ops.find(([o]) => o === 'insert')?.[1]).toEqual([[{ habit_id: 'h1', tag_id: 'add' }]]);
  });

  it('updateHabit surfaces a tag write failure as a warning', async () => {
    queue({ data: [{ id: 'h1' }] }, { data: [] }, { error: { message: 'boom' } });
    const r = await updateHabit('h1', 'u1', { title: 'x' }, ['add']);
    expect(r.error).toBeNull();
    expect(r.warning).toBeTruthy();
  });

  it('createHabit returns the habit with a warning when tag links fail (no duplicate on retry)', async () => {
    queue({ data: habit() }, { error: { message: 'boom' } });
    const r = await createHabit({
      user_id: 'u1', title: 'Читать', period_type: 'none', period_start: null, period_end: null,
      goal_id: null, life_sphere: 'health', repetitions_per_day: 1, target_days: ALL_DAYS, icon: 'book',
    }, ['t1', 't1']);
    expect(r.error).toBeNull();
    expect(r.data?.id).toBe('h1');
    expect(r.warning).toBeTruthy();
    expect(mock.state.calls[1].ops.find(([o]) => o === 'insert')?.[1]).toEqual([[{ habit_id: 'h1', tag_id: 't1' }]]);
  });

  it('getHabitById treats a malformed id as not found without querying', async () => {
    const r = await getHabitById('not-a-uuid', 'u1');
    expect(r).toEqual({ data: null, error: null });
    expect(mock.state.calls).toHaveLength(0);
  });

  it('ensureDefaultTags never re-inserts defaults after a failed read', async () => {
    queue({ error: { message: 'boom' } });
    await expect(ensureDefaultTags('u1')).rejects.toThrow('boom');
    expect(mock.state.calls).toHaveLength(1);
  });

  it('ensureDefaultTags tolerates a concurrent insert of the defaults', async () => {
    const tags = [
      { id: '1', user_id: 'u1', name: 'Утро', slug: 'morning', created_at: '' },
      { id: '2', user_id: 'u1', name: 'Вечер', slug: 'evening', created_at: '' },
      { id: '3', user_id: 'u1', name: 'Быстро', slug: 'quick', created_at: '' },
    ];
    queue({ data: [] }, { error: { code: '23505', message: 'duplicate key' } }, { data: tags });
    await expect(ensureDefaultTags('u1')).resolves.toHaveLength(3);
  });

  it('ensureDefaultTags skips the insert when all defaults exist', async () => {
    queue({ data: [{ id: '1', user_id: 'u1', name: 'Утро', slug: 'morning', created_at: '' },
      { id: '2', user_id: 'u1', name: 'Вечер', slug: 'evening', created_at: '' },
      { id: '3', user_id: 'u1', name: 'Быстро', slug: 'quick', created_at: '' }] });
    await expect(ensureDefaultTags('u1')).resolves.toHaveLength(3);
    expect(mock.state.calls).toHaveLength(1);
  });
});
