// UTC+3 (the app's main audience): toISOString()-based dates were a day off here.
process.env.TZ = 'Europe/Moscow';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockError = { message: string; code?: string } | null;
interface MockResult { data?: unknown; error?: MockError }
interface Call { table: string; op: string; payload?: unknown; filters: [string, unknown][] }

const { fromMock, awardStarsMock, revokeStarsMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  awardStarsMock: vi.fn(async () => true),
  revokeStarsMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }));
vi.mock('@/lib/starsService', () => ({ awardStars: awardStarsMock, revokeStars: revokeStarsMock }));

import {
  addDaysLocal,
  buildDailyProgress,
  clampProgress,
  compareActions,
  completionTransition,
  daysUntil,
  deleteGoal,
  getGoalById,
  getGoalHealth,
  getMomentum,
  isGoalsTourCompleted,
  markGoalsTourCompleted,
  nextOrderIndex,
  parseBoundedInt,
  planMilestoneDates,
  planStepDates,
  progressAfterActionToggle,
  progressAfterMilestoneToggle,
  toggleGoalAction,
  toggleGoalMilestone,
  toLocalDateStr,
  updateGoal,
  type ActionRow,
  type MilestoneRow,
} from './goalsService';

// ─── Supabase query-builder mock ────────────────────────────────────────────

let calls: Call[] = [];
let responder: (call: Call) => MockResult = () => ({ data: [], error: null });

function makeBuilder(table: string) {
  const call: Call = { table, op: '', filters: [] };
  const builder = {
    select: () => builder,
    insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; },
    update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return builder; },
    delete: () => { call.op = 'delete'; return builder; },
    eq: (col: string, val: unknown) => { call.filters.push([col, val]); return builder; },
    gte: (col: string, val: unknown) => { call.filters.push([col, val]); return builder; },
    order: () => builder,
    maybeSingle: () => builder,
    single: () => builder,
    then: (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) => {
      if (!call.op) call.op = 'select';
      calls.push(call);
      const res = responder(call);
      return Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(resolve, reject);
    },
  };
  return builder;
}

beforeEach(() => {
  calls = [];
  responder = () => ({ data: [{ id: 'x' }], error: null });
  fromMock.mockReset();
  fromMock.mockImplementation((table: string) => makeBuilder(table));
  awardStarsMock.mockClear();
  revokeStarsMock.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ops = () => calls.map(c => `${c.op}:${c.table}`);

function action(overrides: Partial<ActionRow> = {}): ActionRow {
  return {
    id: 'a1', goal_id: 'g1', user_id: 'u1', title: 'Step', status: 'todo', impact: 10,
    created_at: '2026-10-01T10:00:00Z', due_date: null, ...overrides,
  };
}

function milestone(id: string, status: 'todo' | 'done', overrides: Partial<MilestoneRow> = {}): MilestoneRow {
  return {
    id, goal_id: 'g1', user_id: 'u1', title: id, status, order_index: 0, reward_points: 25,
    created_at: '2026-10-01T10:00:00Z', ...overrides,
  };
}

// ─── Dates ──────────────────────────────────────────────────────────────────

describe('local date helpers', () => {
  it('runs in UTC+3', () => {
    expect(new Date('2026-10-12T22:30:00Z').getHours()).toBe(1);
  });

  it('toLocalDateStr uses the local day (01:30 local is still the previous day in UTC)', () => {
    const earlyMorning = new Date(2026, 9, 13, 1, 30);
    expect(earlyMorning.toISOString().slice(0, 10)).toBe('2026-10-12');
    expect(toLocalDateStr(earlyMorning)).toBe('2026-10-13');
  });

  it('addDaysLocal crosses month and year boundaries by calendar days', () => {
    expect(toLocalDateStr(addDaysLocal(new Date(2026, 9, 31, 23, 50), 1))).toBe('2026-11-01');
    expect(toLocalDateStr(addDaysLocal(new Date(2026, 11, 31, 0, 10), 1))).toBe('2027-01-01');
    expect(toLocalDateStr(addDaysLocal(new Date(2026, 2, 1), -1))).toBe('2026-02-28');
  });

  it('daysUntil counts whole calendar days and rejects garbage', () => {
    expect(daysUntil('2026-10-13', '2026-10-13')).toBe(0);
    expect(daysUntil('2026-10-20', '2026-10-13')).toBe(7);
    expect(daysUntil('2026-10-10', '2026-10-13')).toBe(-3);
    expect(daysUntil('2026-11-01T00:00:00Z', '2026-10-31')).toBe(1);
    expect(daysUntil(null, '2026-10-13')).toBeNull();
    expect(daysUntil('', '2026-10-13')).toBeNull();
    expect(daysUntil('soon', '2026-10-13')).toBeNull();
  });
});

// ─── Numbers & progress ─────────────────────────────────────────────────────

describe('clampProgress / parseBoundedInt', () => {
  it('keeps progress an integer in [0, 100]', () => {
    expect(clampProgress(42.6)).toBe(43);
    expect(clampProgress(130)).toBe(100);
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(undefined)).toBe(0);
    expect(clampProgress('55')).toBe(55);
  });

  it('parses form numbers with fallback and bounds', () => {
    expect(parseBoundedInt('15', 5, 1, 100)).toBe(15);
    expect(parseBoundedInt('abc', 5, 1, 100)).toBe(5);
    expect(parseBoundedInt('', 25, 1, 1000)).toBe(25);
    expect(parseBoundedInt('-40', 5, 1, 100)).toBe(1);
    expect(parseBoundedInt('5000', 25, 1, 1000)).toBe(1000);
    expect(parseBoundedInt(' 7 ', 5, 1, 100)).toBe(7);
  });
});

describe('progressAfterActionToggle', () => {
  it('adds impact on completion and caps at 100', () => {
    expect(progressAfterActionToggle(20, 5, true)).toBe(25);
    expect(progressAfterActionToggle(98, 5, true)).toBe(100);
  });

  it('un-checking returns the impact, so check/uncheck cycles cannot inflate progress', () => {
    let p = 40;
    for (let i = 0; i < 3; i++) {
      p = progressAfterActionToggle(p, 10, true);
      p = progressAfterActionToggle(p, 10, false);
    }
    expect(p).toBe(40);
    expect(progressAfterActionToggle(3, 10, false)).toBe(0);
  });

  it('ignores negative / non-numeric impact and bad stored progress', () => {
    expect(progressAfterActionToggle(50, -30, true)).toBe(50);
    expect(progressAfterActionToggle(50, Number.NaN, true)).toBe(50);
    expect(progressAfterActionToggle(Number.NaN, 10, true)).toBe(10);
    expect(progressAfterActionToggle(150, 10, false)).toBe(90);
  });
});

describe('progressAfterMilestoneToggle', () => {
  const ms = (done: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ status: i < done ? 'done' : 'todo' }));

  it('is a no-op without milestones (no NaN from 0/0)', () => {
    expect(progressAfterMilestoneToggle(30, [], true)).toBe(30);
    expect(progressAfterMilestoneToggle(30, [], false)).toBe(30);
  });

  it('pure milestone goals follow k/n both ways', () => {
    expect(progressAfterMilestoneToggle(0, ms(1, 4), true)).toBe(25);
    expect(progressAfterMilestoneToggle(25, ms(2, 4), true)).toBe(50);
    expect(progressAfterMilestoneToggle(50, ms(1, 4), false)).toBe(25);
    expect(progressAfterMilestoneToggle(25, ms(0, 4), false)).toBe(0);
  });

  it('completing a milestone never lowers progress earned by steps', () => {
    expect(progressAfterMilestoneToggle(60, ms(1, 4), true)).toBe(60);
  });

  it('un-completing never raises progress', () => {
    expect(progressAfterMilestoneToggle(10, ms(2, 4), false)).toBe(10);
  });

  it('reaches exactly 100 when the last milestone is done', () => {
    expect(progressAfterMilestoneToggle(66, ms(3, 3), true)).toBe(100);
  });
});

describe('completionTransition', () => {
  it('completes once at 100%', () => {
    expect(completionTransition('active', 100)).toEqual({ patch: { status: 'completed', is_achieved: true }, justCompleted: true });
    expect(completionTransition('completed', 100)).toEqual({ patch: null, justCompleted: false });
  });

  it('re-activates a completed goal that dropped below 100%', () => {
    expect(completionTransition('completed', 90)).toEqual({ patch: { status: 'active', is_achieved: false }, justCompleted: false });
  });

  it('leaves other statuses alone below 100%', () => {
    expect(completionTransition('paused', 40)).toEqual({ patch: null, justCompleted: false });
  });
});

describe('ordering helpers', () => {
  it('nextOrderIndex appends after the max even after deletions', () => {
    expect(nextOrderIndex([])).toBe(0);
    expect(nextOrderIndex([{ order_index: 0 }, { order_index: 2 }])).toBe(3);
  });

  it('compareActions sorts by due date, undated last, then by creation', () => {
    const list = [
      action({ id: 'none', due_date: null }),
      action({ id: 'late', due_date: '2026-10-20' }),
      action({ id: 'early-b', due_date: '2026-10-14', created_at: '2026-10-02T00:00:00Z' }),
      action({ id: 'early-a', due_date: '2026-10-14', created_at: '2026-10-01T00:00:00Z' }),
    ];
    expect([...list].sort(compareActions).map(a => a.id)).toEqual(['early-a', 'early-b', 'late', 'none']);
  });
});

// ─── Health / momentum / daily series ───────────────────────────────────────

describe('activity analytics', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const log = (daysAgo: number, delta = 5) => ({
    created_at: new Date(now - daysAgo * 86_400_000).toISOString(),
    delta_value: delta,
  });

  it('health: recent activity → healthy, 3–6 days → risk, older/none → stalled', () => {
    expect(getGoalHealth([log(1)], 40, now)).toBe('healthy');
    expect(getGoalHealth([log(5)], 40, now)).toBe('risk');
    expect(getGoalHealth([log(10)], 40, now)).toBe('stalled');
    expect(getGoalHealth([], 40, now)).toBe('stalled');
    expect(getGoalHealth([], 100, now)).toBe('healthy');
  });

  it('momentum compares the last 7 days with the 7 before', () => {
    expect(getMomentum([log(1, 10), log(9, 2)], now)).toEqual({ state: 'up', value: 10 });
    expect(getMomentum([log(1, 1), log(9, 10)], now)).toEqual({ state: 'down', value: 1 });
    expect(getMomentum([], now)).toEqual({ state: 'stable', value: 0 });
  });

  it('buildDailyProgress sums by local day and ends today', () => {
    const today = new Date(2026, 9, 13, 1, 30); // early morning in UTC+3
    const series = buildDailyProgress(
      [
        { date: '2026-10-13', delta_value: 3 },
        { date: '2026-10-13', delta_value: 2 },
        { date: '2026-10-11', delta_value: 4 },
        { date: '2026-09-01', delta_value: 99 },
      ],
      3,
      today,
    );
    expect(series).toEqual([
      { date: '2026-10-11', value: 4 },
      { date: '2026-10-12', value: 0 },
      { date: '2026-10-13', value: 5 },
    ]);
  });
});

// ─── Wizard plan dates ──────────────────────────────────────────────────────

describe('wizard plan dates', () => {
  const today = new Date(2026, 9, 13, 1, 30); // Tue, early morning local

  it('spreads milestones up to and ending on the deadline', () => {
    expect(planMilestoneDates(4, '2026-11-10', today)).toEqual(['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10']);
  });

  it('never schedules milestones after a near deadline', () => {
    const dates = planMilestoneDates(4, '2026-10-16', today);
    expect(dates[dates.length - 1]).toBe('2026-10-16');
    expect(dates.every(d => d <= '2026-10-16')).toBe(true);
  });

  it('collapses a past or invalid deadline to today', () => {
    expect(planMilestoneDates(2, '2026-10-01', today)).toEqual(['2026-10-13', '2026-10-13']);
    expect(planMilestoneDates(1, 'nope', today)).toEqual(['2026-10-13']);
    expect(planMilestoneDates(0, '2026-11-10', today)).toEqual([]);
  });

  it('step dates fall on the selected LOCAL weekdays', () => {
    // Mon/Wed/Fri starting tomorrow (Wed 14th)
    const dates = planStepDates([1, 3, 5], 14, 10, null, today);
    expect(dates).toEqual(['2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26']);
    dates.forEach(d => {
      const [y, m, day] = d.split('-').map(Number);
      expect([1, 3, 5]).toContain(new Date(y, m - 1, day).getDay());
    });
  });

  it('step dates respect the max count and the deadline', () => {
    expect(planStepDates([0, 1, 2, 3, 4, 5, 6], 14, 3, null, today)).toHaveLength(3);
    expect(planStepDates([0, 1, 2, 3, 4, 5, 6], 14, 14, '2026-10-15', today)).toEqual(['2026-10-14', '2026-10-15']);
    expect(planStepDates([], 14, 10, null, today)).toEqual([]);
  });
});

// ─── Storage ────────────────────────────────────────────────────────────────

describe('tour flag storage', () => {
  it('survives a throwing localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    expect(() => markGoalsTourCompleted()).not.toThrow();
    expect(isGoalsTourCompleted()).toBe(false);
  });

  it('round-trips when storage works', () => {
    window.localStorage.removeItem('goals_tour_completed');
    expect(isGoalsTourCompleted()).toBe(false);
    markGoalsTourCompleted();
    expect(isGoalsTourCompleted()).toBe(true);
  });
});

// ─── Supabase-backed operations ─────────────────────────────────────────────

describe('getGoalById', () => {
  it('treats a malformed id as "not found" instead of a retryable error', async () => {
    responder = () => ({ error: { message: 'invalid input syntax for type uuid', code: '22P02' } });
    await expect(getGoalById('abc', 'u1')).resolves.toEqual({ data: null, error: null });
  });

  it('scopes the query to the owner', async () => {
    responder = () => ({ data: null });
    await getGoalById('g1', 'u1');
    expect(calls[0].filters).toEqual([['id', 'g1'], ['user_id', 'u1']]);
  });
});

describe('updateGoal', () => {
  it('reports an update that matched no row instead of a false success', async () => {
    responder = () => ({ data: [] });
    const { error } = await updateGoal('g1', 'u1', { is_pinned: true });
    expect(error?.code).toBe('not_found');
  });
});

describe('deleteGoal', () => {
  it('deletes the goal row first, so a failure cannot lose its milestones/steps', async () => {
    responder = c => (c.table === 'goals' ? { error: { message: 'network' } } : { data: [] });
    const { error } = await deleteGoal('g1', 'u1');
    expect(error?.message).toBe('network');
    expect(ops()).toEqual(['delete:goals']);
  });

  it('falls back to deleting children when the FK has no cascade', async () => {
    let goalAttempts = 0;
    responder = c => {
      if (c.table !== 'goals') return { data: [] };
      goalAttempts += 1;
      return goalAttempts === 1 ? { error: { message: 'fk', code: '23503' } } : { data: [{ id: 'g1' }] };
    };
    const { error } = await deleteGoal('g1', 'u1');
    expect(error).toBeNull();
    expect(ops().slice(0, 4)).toEqual(['delete:goals', 'delete:goal_milestones', 'delete:goal_actions', 'delete:goals']);
    expect(calls.every(c => c.filters.some(([col, v]) => col === 'user_id' && v === 'u1'))).toBe(true);
  });

  it('reports a goal that does not exist', async () => {
    responder = () => ({ data: [] });
    const { error } = await deleteGoal('g1', 'u1');
    expect(error?.code).toBe('not_found');
  });
});

describe('toggleGoalAction', () => {
  const goal = { id: 'g1', progress: 95, status: 'active', is_achieved: false };

  it('does not touch the goal when saving the step fails (no false success)', async () => {
    responder = c => (c.table === 'goal_actions' ? { error: { message: 'offline' } } : { data: [{ id: 'x' }] });
    const res = await toggleGoalAction(goal, action(), 'u1');
    expect(res.error?.message).toBe('offline');
    expect(res.progress).toBe(95);
    expect(ops()).toEqual(['update:goal_actions']);
    expect(awardStarsMock).not.toHaveBeenCalled();
  });

  it('completes the goal at 100% and awards step + completion stars', async () => {
    const res = await toggleGoalAction(goal, action({ impact: 10 }), 'u1');
    expect(res).toMatchObject({ error: null, progress: 100, status: 'completed', isAchieved: true, justCompleted: true });
    const goalUpdate = calls.find(c => c.op === 'update' && c.table === 'goals');
    expect(goalUpdate?.payload).toEqual({ progress: 100, status: 'completed', is_achieved: true });
    expect(awardStarsMock).toHaveBeenCalledWith('u1', 1, 'goal_step', 'goal_step_a1');
    expect(awardStarsMock).toHaveBeenCalledWith('u1', 50, 'goal_complete', 'goal_complete_g1');
  });

  it('un-checking subtracts the impact, revokes the star and re-activates the goal', async () => {
    const done = { id: 'g1', progress: 100, status: 'completed', is_achieved: true };
    const res = await toggleGoalAction(done, action({ status: 'done', impact: 10 }), 'u1');
    expect(res).toMatchObject({ error: null, progress: 90, status: 'active', isAchieved: false, justCompleted: false });
    expect(revokeStarsMock).toHaveBeenCalledWith('u1', 'goal_step_a1');
    expect(awardStarsMock).not.toHaveBeenCalled();
  });

  it('rolls the step back when the goal update fails', async () => {
    responder = c => (c.table === 'goals' ? { error: { message: 'denied' } } : { data: [{ id: 'x' }] });
    const res = await toggleGoalAction(goal, action(), 'u1');
    expect(res.error?.message).toBe('denied');
    const actionUpdates = calls.filter(c => c.table === 'goal_actions' && c.op === 'update').map(c => c.payload);
    expect(actionUpdates).toEqual([{ status: 'done' }, { status: 'todo' }]);
    expect(awardStarsMock).not.toHaveBeenCalled();
  });
});

describe('toggleGoalMilestone', () => {
  it('caps milestone stars at the ledger limit and returns the updated list', async () => {
    const goal = { id: 'g1', progress: 0, status: 'active', is_achieved: false };
    const list = [milestone('m1', 'todo', { reward_points: 5000 }), milestone('m2', 'todo')];
    const res = await toggleGoalMilestone(goal, list, list[0], 'u1');
    expect(res.error).toBeNull();
    expect(res.progress).toBe(50);
    expect(res.milestones.map(m => m.status)).toEqual(['done', 'todo']);
    expect(awardStarsMock).toHaveBeenCalledWith('u1', 1000, 'milestone', 'milestone_m1');
  });
});
