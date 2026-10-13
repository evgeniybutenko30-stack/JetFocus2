// Run the date tests in a UTC+3 zone (the app's main audience): this is where
// toISOString()-based "today"/"tomorrow" was a whole day off between 00:00 and 03:00.
process.env.TZ = 'Europe/Moscow';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }));

import {
  addDaysLocal,
  addUniqueTag,
  deleteTask,
  filterTasks,
  groupTasks,
  isoToLocalDateStr,
  isTaskOverdue,
  nextToggleStatus,
  normalizeTag,
  parseTaskSettings,
  resolveCompletedAt,
  sortTasks,
  taskHasTag,
  toLocalDateStr,
  updateTask,
  TASK_TAG_MAX,
  type TaskRow,
  type TaskSettings,
} from './tasksService';

function task(overrides: Partial<TaskRow>): TaskRow {
  return {
    id: 'id',
    user_id: 'u1',
    title: 'Task',
    sphere: 'career',
    priority: 'MEDIUM',
    status: 'TODO',
    due_date: null,
    tags: null,
    category: null,
    goal_id: null,
    completed_at: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

describe('timezone sanity', () => {
  it('runs in Europe/Moscow', () => {
    expect(new Date('2026-10-12T22:30:00Z').getHours()).toBe(1);
  });
});

describe('local date helpers', () => {
  // 01:30 local on Oct 13 is still Oct 12 in UTC.
  const earlyMorning = new Date(2026, 9, 13, 1, 30);

  it('toLocalDateStr uses the local calendar day, not the UTC one', () => {
    expect(earlyMorning.toISOString().slice(0, 10)).toBe('2026-10-12');
    expect(toLocalDateStr(earlyMorning)).toBe('2026-10-13');
  });

  it('addDaysLocal(1) is tomorrow in local time (the old toISOString version returned today)', () => {
    expect(addDaysLocal(1, earlyMorning)).toBe('2026-10-14');
    expect(addDaysLocal(3, earlyMorning)).toBe('2026-10-16');
    expect(addDaysLocal(7, earlyMorning)).toBe('2026-10-20');
  });

  it('addDaysLocal rolls over months and years', () => {
    expect(addDaysLocal(1, new Date(2026, 11, 31, 23, 59))).toBe('2027-01-01');
    expect(addDaysLocal(1, new Date(2028, 1, 28, 12))).toBe('2028-02-29');
  });

  it('isoToLocalDateStr buckets UTC timestamps by local day', () => {
    expect(isoToLocalDateStr('2026-10-12T22:30:00+00:00')).toBe('2026-10-13');
    expect(isoToLocalDateStr('2026-10-12T20:00:00Z')).toBe('2026-10-12');
    expect(isoToLocalDateStr(null)).toBeNull();
    expect(isoToLocalDateStr('not a date')).toBeNull();
  });
});

describe('isTaskOverdue', () => {
  const today = '2026-10-13';
  it('is true only for open tasks due before today', () => {
    expect(isTaskOverdue(task({ due_date: '2026-10-12' }), today)).toBe(true);
    expect(isTaskOverdue(task({ due_date: '2026-10-12', status: 'IN_PROGRESS' }), today)).toBe(true);
    expect(isTaskOverdue(task({ due_date: '2026-10-13' }), today)).toBe(false);
    expect(isTaskOverdue(task({ due_date: '2026-10-14' }), today)).toBe(false);
    expect(isTaskOverdue(task({ due_date: null }), today)).toBe(false);
    expect(isTaskOverdue(task({ due_date: '2026-10-01', status: 'DONE' }), today)).toBe(false);
    expect(isTaskOverdue(task({ due_date: '2026-10-01', status: 'CANCELLED' }), today)).toBe(false);
  });
});

describe('groupTasks', () => {
  it('puts every non-cancelled task in exactly one group', () => {
    const tasks = [
      task({ id: 'overdue', due_date: '2026-10-01' }),
      task({ id: 'today', due_date: '2026-10-13', status: 'IN_PROGRESS' }),
      task({ id: 'future', due_date: '2026-11-01' }),
      task({ id: 'nodate', due_date: null }),
      task({ id: 'done-overdue', due_date: '2026-10-01', status: 'DONE' }),
      task({ id: 'cancelled', due_date: '2026-10-13', status: 'CANCELLED' }),
    ];
    const g = groupTasks(tasks, '2026-10-13');
    expect(g.overdue.map(t => t.id)).toEqual(['overdue']);
    expect(g.today.map(t => t.id)).toEqual(['today']);
    expect(g.later.map(t => t.id)).toEqual(['future', 'nodate']);
    expect(g.done.map(t => t.id)).toEqual(['done-overdue']);
  });

  it('handles an empty list', () => {
    expect(groupTasks([], '2026-10-13')).toEqual({ overdue: [], today: [], later: [], done: [] });
  });
});

describe('nextToggleStatus', () => {
  it('toggles DONE <-> TODO', () => {
    expect(nextToggleStatus('TODO')).toBe('DONE');
    expect(nextToggleStatus('IN_PROGRESS')).toBe('DONE');
    expect(nextToggleStatus('DONE')).toBe('TODO');
  });
});

describe('resolveCompletedAt', () => {
  const now = '2026-10-13T10:00:00.000Z';
  it('keeps the original completion time when an already-done task is re-saved', () => {
    expect(resolveCompletedAt({ status: 'DONE', completed_at: '2026-10-01T08:00:00Z' }, 'DONE', now))
      .toBe('2026-10-01T08:00:00Z');
  });
  it('stamps now when a task becomes done', () => {
    expect(resolveCompletedAt({ status: 'TODO', completed_at: null }, 'DONE', now)).toBe(now);
    expect(resolveCompletedAt({ status: 'DONE', completed_at: null }, 'DONE', now)).toBe(now);
  });
  it('clears it for any open status', () => {
    expect(resolveCompletedAt({ status: 'DONE', completed_at: '2026-10-01T08:00:00Z' }, 'TODO', now)).toBeNull();
    expect(resolveCompletedAt({ status: 'TODO', completed_at: null }, 'IN_PROGRESS', now)).toBeNull();
  });
});

describe('tags', () => {
  it('normalizeTag strips #, trims, lower-cases and maps legacy filter ids', () => {
    expect(normalizeTag('  #Срочно ')).toBe('срочно');
    expect(normalizeTag('Мой тег')).toBe('мой_тег');
    expect(normalizeTag('urgent')).toBe('срочно');
    expect(normalizeTag('#потом')).toBe('позже');
  });

  it('taskHasTag matches the presets stored by the task form against filter keys', () => {
    const t = task({ tags: ['Срочно', 'Мой тег'] });
    expect(taskHasTag(t, 'срочно')).toBe(true);
    expect(taskHasTag(t, 'urgent')).toBe(true); // filter saved by an older version
    expect(taskHasTag(t, 'мой_тег')).toBe(true);
    expect(taskHasTag(t, 'важно')).toBe(false);
    expect(taskHasTag(task({ tags: null }), 'срочно')).toBe(false);
    expect(taskHasTag(t, '')).toBe(false);
  });

  it('addUniqueTag ignores empty and duplicate tags and caps the length', () => {
    expect(addUniqueTag([], '   ')).toEqual([]);
    expect(addUniqueTag(['Срочно'], 'срочно')).toEqual(['Срочно']);
    expect(addUniqueTag(['Срочно'], '#Важно ')).toEqual(['Срочно', 'Важно']);
    const long = addUniqueTag([], 'x'.repeat(100));
    expect(long[0]).toHaveLength(TASK_TAG_MAX);
    const tags = ['a'];
    expect(addUniqueTag(tags, 'a')).toBe(tags);
  });
});

describe('filterTasks / sortTasks', () => {
  const tasks = [
    task({ id: 'a', sphere: 'health', priority: 'LOW', due_date: '2026-10-20', category: 'work', tags: ['Срочно'], created_at: '2026-10-01T00:00:00Z' }),
    task({ id: 'b', sphere: 'career', priority: 'URGENT', due_date: null, goal_id: 'g1', created_at: '2026-10-03T00:00:00Z' }),
    task({ id: 'c', sphere: 'career', priority: 'HIGH', due_date: '2026-10-10', status: 'DONE', created_at: '2026-10-02T00:00:00Z' }),
    task({ id: 'x', status: 'CANCELLED' }),
  ];

  it('never lists cancelled tasks and applies each filter', () => {
    expect(filterTasks(tasks, {}).map(t => t.id)).toEqual(['a', 'b', 'c']);
    expect(filterTasks(tasks, { sphere: 'career' }).map(t => t.id)).toEqual(['b', 'c']);
    expect(filterTasks(tasks, { goalId: 'g1' }).map(t => t.id)).toEqual(['b']);
    expect(filterTasks(tasks, { status: 'DONE' }).map(t => t.id)).toEqual(['c']);
    expect(filterTasks(tasks, { category: 'work' }).map(t => t.id)).toEqual(['a']);
    expect(filterTasks(tasks, { tag: 'срочно' }).map(t => t.id)).toEqual(['a']);
    expect(filterTasks(tasks, { hideDone: true }).map(t => t.id)).toEqual(['a', 'b']);
  });

  it('sorts without mutating the input', () => {
    const input = filterTasks(tasks, {});
    const snapshot = input.map(t => t.id);
    expect(sortTasks(input, 'due_date').map(t => t.id)).toEqual(['c', 'a', 'b']);
    expect(sortTasks(input, 'priority').map(t => t.id)).toEqual(['b', 'c', 'a']);
    expect(sortTasks(input, 'sphere').map(t => t.id)).toEqual(['b', 'c', 'a']);
    expect(sortTasks(input, 'created_at').map(t => t.id)).toEqual(['b', 'c', 'a']);
    expect(input.map(t => t.id)).toEqual(snapshot);
  });
});

describe('parseTaskSettings', () => {
  const defaults: TaskSettings = {
    sortBy: 'due_date',
    hideDone: false,
    categories: [{ val: 'work', label: 'Работа' }],
    tags: [{ val: 'срочно', label: '#срочно' }],
  };

  it('falls back to defaults for missing or corrupt data', () => {
    expect(parseTaskSettings(null, defaults)).toBe(defaults);
    expect(parseTaskSettings('{oops', defaults)).toBe(defaults);
    expect(parseTaskSettings('42', defaults)).toBe(defaults);
  });

  it('validates every field and re-normalises tag keys', () => {
    const raw = JSON.stringify({
      sortBy: 'evil',
      hideDone: 'yes',
      categories: [{ val: 'home', label: 'Дом' }, { val: 'home', label: 'dup' }, { val: 1, label: 'bad' }],
      tags: [{ val: 'urgent', label: '#срочно' }, { val: 'срочно', label: 'dup' }],
    });
    expect(parseTaskSettings(raw, defaults)).toEqual({
      sortBy: 'due_date',
      hideDone: false,
      categories: [{ val: 'home', label: 'Дом' }],
      tags: [{ val: 'срочно', label: '#срочно' }],
    });
  });

  it('keeps valid stored values', () => {
    const stored: TaskSettings = { ...defaults, sortBy: 'priority', hideDone: true };
    expect(parseTaskSettings(JSON.stringify(stored), defaults)).toEqual(stored);
  });
});

// ─── Supabase writes: zero affected rows must not look like success ──────────

function mockQueryResult(result: { data: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['update', 'delete', 'eq', 'select']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  fromMock.mockReturnValue(builder);
  return calls;
}

describe('updateTask / deleteTask', () => {
  beforeEach(() => fromMock.mockReset());

  it('updateTask succeeds when a row was updated and scopes the query to the owner', async () => {
    const calls = mockQueryResult({ data: [{ id: 't1' }], error: null });
    await expect(updateTask('t1', 'u1', { status: 'DONE' })).resolves.toEqual({ error: null });
    expect(fromMock).toHaveBeenCalledWith('tasks');
    expect(calls).toContainEqual({ method: 'eq', args: ['id', 't1'] });
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', 'u1'] });
  });

  it('updateTask reports NOT_FOUND when no row matched (deleted / foreign task)', async () => {
    mockQueryResult({ data: [], error: null });
    const { error } = await updateTask('t1', 'u1', { status: 'DONE' });
    expect(error?.code).toBe('NOT_FOUND');
  });

  it('updateTask forwards database errors', async () => {
    mockQueryResult({ data: null, error: { message: 'permission denied', code: '42501' } });
    await expect(updateTask('t1', 'u1', { title: 'x' })).resolves.toEqual({
      error: { message: 'permission denied', code: '42501' },
    });
  });

  it('deleteTask reports NOT_FOUND when nothing was deleted', async () => {
    mockQueryResult({ data: [], error: null });
    const { error } = await deleteTask('t1', 'u1');
    expect(error?.code).toBe('NOT_FOUND');
  });

  it('deleteTask succeeds when the row was deleted', async () => {
    const calls = mockQueryResult({ data: [{ id: 't1' }], error: null });
    await expect(deleteTask('t1', 'u1')).resolves.toEqual({ error: null });
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', 'u1'] });
  });
});
