import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockError = { message: string; code?: string } | null;
interface MockResult { data?: unknown; error?: MockError }
interface Call { table: string; op: string; payload?: unknown; filters: [string, unknown][] }

const m = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from } }));

import { awardStars, isDuplicateAwardError, revokeStars, validateStarsAward } from './starsService';

let calls: Call[] = [];
let responder: (call: Call) => MockResult = () => ({ data: [], error: null });

function makeBuilder(table: string) {
  const call: Call = { table, op: '', filters: [] };
  const builder = {
    select: () => builder,
    insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; },
    delete: () => { call.op = 'delete'; return builder; },
    eq: (col: string, val: unknown) => { call.filters.push([col, val]); return builder; },
    limit: () => builder,
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
  responder = () => ({ data: [], error: null });
  m.from.mockReset();
  m.from.mockImplementation((table: string) => makeBuilder(table));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('validateStarsAward (mirrors the stars_ledger DB guard)', () => {
  it('accepts the amounts the app awards', () => {
    expect(validateStarsAward(1, 'habit_completion', 'habit_h1_2026-10-13')).toBeNull();
    expect(validateStarsAward(1, 'task_completion', 'task_t1')).toBeNull();
    expect(validateStarsAward(1, 'goal_step', 'goal_step_a1')).toBeNull();
    expect(validateStarsAward(50, 'goal_complete', 'goal_complete_g1')).toBeNull();
    expect(validateStarsAward(1000, 'milestone', 'milestone_m1')).toBeNull();
    expect(validateStarsAward(100, 'finance_goal', 'finance_f1')).toBeNull();
  });

  it('rejects per-source caps, non-integers and non-positive amounts', () => {
    expect(validateStarsAward(21, 'habit_completion', 'k')).not.toBeNull();
    expect(validateStarsAward(51, 'goal_complete', 'k')).not.toBeNull();
    expect(validateStarsAward(1001, 'milestone', 'k')).not.toBeNull();
    expect(validateStarsAward(1.5, 'task_completion', 'k')).not.toBeNull();
    expect(validateStarsAward(-1, 'task_completion', 'k')).not.toBeNull();
    expect(validateStarsAward(Number.NaN, 'task_completion', 'k')).not.toBeNull();
  });

  it('rejects unknown sources and bad keys', () => {
    expect(validateStarsAward(1, 'admin', 'k')).toMatch(/unknown/);
    expect(validateStarsAward(1, 'referral', 'k')).toMatch(/unknown/);
    expect(validateStarsAward(1, 'task_completion', '')).not.toBeNull();
    expect(validateStarsAward(1, 'task_completion', '   ')).not.toBeNull();
    expect(validateStarsAward(1, 'task_completion', 'x'.repeat(201))).not.toBeNull();
  });

  it('isDuplicateAwardError detects unique violations only', () => {
    expect(isDuplicateAwardError({ code: '23505' })).toBe(true);
    expect(isDuplicateAwardError({ code: '42501' })).toBe(false);
    expect(isDuplicateAwardError(null)).toBe(false);
  });
});

describe('awardStars', () => {
  it('inserts a new award and returns true', async () => {
    await expect(awardStars('u1', 1, 'task_completion', 'task_t1')).resolves.toBe(true);
    expect(calls.map(c => c.op)).toEqual(['select', 'insert']);
    expect(calls[0].filters).toEqual([['target_user_id', 'u1'], ['reason', 'task_t1']]);
    expect(calls[1].payload).toEqual({ target_user_id: 'u1', delta: 1, source: 'task_completion', reason: 'task_t1' });
  });

  it('does not insert again when the key already exists (even with legacy duplicate rows)', async () => {
    responder = (c) => (c.op === 'select' ? { data: [{ id: 'a' }, { id: 'b' }] } : {});
    await expect(awardStars('u1', 1, 'task_completion', 'task_t1')).resolves.toBe(false);
    expect(calls.map(c => c.op)).toEqual(['select']);
  });

  it('treats a 23505 from the DB guard (lost race) as "already awarded", not as an error', async () => {
    responder = (c) => (c.op === 'insert' ? { error: { message: 'Stars for "task_t1" were already awarded', code: '23505' } } : { data: [] });
    await expect(awardStars('u1', 1, 'task_completion', 'task_t1')).resolves.toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('returns false and logs on other insert errors', async () => {
    responder = (c) => (c.op === 'insert' ? { error: { message: 'permission denied', code: '42501' } } : { data: [] });
    await expect(awardStars('u1', 1, 'task_completion', 'task_t1')).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('does not insert when the duplicate check fails', async () => {
    responder = () => ({ error: { message: 'network' } });
    await expect(awardStars('u1', 1, 'task_completion', 'task_t1')).resolves.toBe(false);
    expect(calls.map(c => c.op)).toEqual(['select']);
  });

  it('never hits the network for invalid awards', async () => {
    await expect(awardStars('', 1, 'task_completion', 'k')).resolves.toBe(false);
    await expect(awardStars('u1', 0, 'milestone', 'k')).resolves.toBe(false);
    await expect(awardStars('u1', 5000, 'milestone', 'k')).resolves.toBe(false);
    await expect(awardStars('u1', 1, 'referral', 'k')).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('never rejects, even if the client throws', async () => {
    m.from.mockImplementation(() => { throw new Error('boom'); });
    await expect(awardStars('u1', 1, 'task_completion', 'task_t1')).resolves.toBe(false);
  });
});

describe('revokeStars', () => {
  it('deletes by user and key and reports success', async () => {
    await expect(revokeStars('u1', 'task_t1')).resolves.toBe(true);
    expect(calls[0]).toMatchObject({ table: 'stars_ledger', op: 'delete', filters: [['target_user_id', 'u1'], ['reason', 'task_t1']] });
  });

  it('reports a failed delete instead of ignoring it', async () => {
    responder = () => ({ error: { message: 'permission denied', code: '42501' } });
    await expect(revokeStars('u1', 'task_t1')).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('never deletes without a user or key', async () => {
    await expect(revokeStars('', 'task_t1')).resolves.toBe(false);
    await expect(revokeStars('u1', '')).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });
});
