/**
 * Tasks Service — единый слой доступа к данным модуля «Задачи».
 */
import { supabase } from '@/lib/supabase';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  sphere: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: string | null;
  tags?: string[] | null;
  category?: string | null;
  goal_id?: string | null;
  recurrence?: string | null;
  icon?: string | null;
  color?: string | null;
  subtasks?: { id: string; title: string; done: boolean }[] | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceError {
  message: string;
  code?: string;
}

/** Input limits shared by the create / edit forms. */
export const TASK_TITLE_MAX = 200;
export const TASK_DESCRIPTION_MAX = 2000;
export const TASK_SUBTASK_MAX = 200;
export const TASK_TAG_MAX = 30;
export const TASK_TAGS_LIMIT = 20;

const NOT_FOUND_ERROR: ServiceError = {
  message: 'Задача не найдена или у вас нет к ней доступа',
  code: 'NOT_FOUND',
};

function toServiceError(err: unknown): ServiceError {
  if (err && typeof err === 'object' && 'message' in err) {
    const { message, code } = err as { message: string; code?: unknown };
    return typeof code === 'string' ? { message, code } : { message };
  }
  return { message: 'Неизвестная ошибка' };
}

export async function listTasks(userId: string): Promise<{ data: TaskRow[]; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: toServiceError(error) };
  return { data: data ?? [], error: null };
}

export async function getTaskById(taskId: string, userId: string): Promise<{ data: TaskRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { data: null, error: toServiceError(error) };
  return { data: data ?? null, error: null };
}

export async function createTask(
  payload: Omit<TaskRow, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ data: TaskRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select('*')
    .maybeSingle();
  if (error) return { data: null, error: toServiceError(error) };
  return { data: data ?? null, error: null };
}

/**
 * Updates the caller's own task. An UPDATE that matches no row (task deleted on another
 * device, foreign id filtered out by RLS) is NOT an error for PostgREST, so the affected
 * rows are returned and checked — otherwise the UI would report a false success.
 */
export async function updateTask(
  taskId: string,
  userId: string,
  payload: Partial<Omit<TaskRow, 'id' | 'user_id' | 'created_at'>>,
): Promise<{ error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select('id');
  if (error) return { error: toServiceError(error) };
  if (!data || data.length === 0) return { error: NOT_FOUND_ERROR };
  return { error: null };
}

/** Deletes the caller's own task; deleting nothing is reported (see updateTask). */
export async function deleteTask(taskId: string, userId: string): Promise<{ error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId)
    .select('id');
  if (error) return { error: toServiceError(error) };
  if (!data || data.length === 0) return { error: NOT_FOUND_ERROR };
  return { error: null };
}

// ─── Pure helpers (dates, grouping, filters) ────────────────────────────────
//
// The app represents "a day" as the user's LOCAL calendar date 'yyyy-MM-dd'
// (see getTodayStr in constants.ts). `due_date` is a Postgres `date` column and is
// compared as such. Never derive a day via toISOString(): it yields the UTC date,
// which is the wrong day around midnight (e.g. 00:00–03:00 in Moscow).

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar date of `date` as 'yyyy-MM-dd'. */
export function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local date `days` days after `from` (DST-safe: shifts the calendar day, not 24h blocks). */
export function addDaysLocal(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return toLocalDateStr(d);
}

/** Local calendar date of an ISO timestamp (e.g. `completed_at`, stored as UTC timestamptz). */
export function isoToLocalDateStr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toLocalDateStr(d);
}

function isClosed(status: TaskStatus): boolean {
  return status === 'DONE' || status === 'CANCELLED';
}

/** A task is overdue when its due date is strictly before today and it is still open. */
export function isTaskOverdue(task: Pick<TaskRow, 'due_date' | 'status'>, today: string): boolean {
  return !!task.due_date && task.due_date < today && !isClosed(task.status);
}

export interface TaskGroups {
  overdue: TaskRow[];
  today: TaskRow[];
  later: TaskRow[];
  done: TaskRow[];
}

/** Splits tasks into the list sections. Every non-cancelled task lands in exactly one group. */
export function groupTasks(tasks: TaskRow[], today: string): TaskGroups {
  const groups: TaskGroups = { overdue: [], today: [], later: [], done: [] };
  for (const t of tasks) {
    if (t.status === 'CANCELLED') continue;
    if (t.status === 'DONE') groups.done.push(t);
    else if (!t.due_date || t.due_date > today) groups.later.push(t);
    else if (t.due_date === today) groups.today.push(t);
    else groups.overdue.push(t);
  }
  return groups;
}

/** Status after tapping the completion checkbox. */
export function nextToggleStatus(status: TaskStatus): 'TODO' | 'DONE' {
  return status === 'DONE' ? 'TODO' : 'DONE';
}

/**
 * `completed_at` to store when a task is saved with `nextStatus`.
 * Re-saving an already completed task keeps its original completion time
 * (otherwise every edit would move the completion to "now" in the progress chart).
 */
export function resolveCompletedAt(
  prev: Pick<TaskRow, 'status' | 'completed_at'>,
  nextStatus: TaskStatus,
  nowIso: string,
): string | null {
  if (nextStatus !== 'DONE') return null;
  if (prev.status === 'DONE' && prev.completed_at) return prev.completed_at;
  return nowIso;
}

// Legacy English filter ids → the Russian presets the task form actually stores.
const TAG_ALIASES: Record<string, string> = {
  urgent: 'срочно',
  important: 'важно',
  later: 'позже',
  'потом': 'позже',
};

/** Canonical tag key: no leading '#', trimmed, lower-case, spaces → '_'. */
export function normalizeTag(tag: string): string {
  const key = tag.trim().replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, '_');
  return TAG_ALIASES[key] ?? key;
}

/** Whether a task carries the tag `tagKey` (compared by normalizeTag on both sides). */
export function taskHasTag(task: Pick<TaskRow, 'tags'>, tagKey: string): boolean {
  const wanted = normalizeTag(tagKey);
  if (!wanted) return false;
  return (task.tags ?? []).some(t => typeof t === 'string' && normalizeTag(t) === wanted);
}

/**
 * Adds a user-typed tag: strips '#', trims, caps the length and skips duplicates
 * (case-insensitive) and empty input. Returns the same array when nothing changes.
 */
export function addUniqueTag(tags: string[], raw: string): string[] {
  const clean = raw.trim().replace(/^#+/, '').trim().slice(0, TASK_TAG_MAX).trim();
  if (!clean || tags.length >= TASK_TAGS_LIMIT) return tags;
  const key = normalizeTag(clean);
  if (tags.some(t => normalizeTag(t) === key)) return tags;
  return [...tags, clean];
}

export type TaskSortBy = 'due_date' | 'priority' | 'created_at' | 'sphere';

const PRIORITY_ORDER: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Returns a sorted copy. Tasks without a due date go last when sorting by due date. */
export function sortTasks(tasks: TaskRow[], sortBy: TaskSortBy): TaskRow[] {
  return [...tasks].sort((a, b) => {
    switch (sortBy) {
      case 'due_date':
        return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31');
      case 'priority':
        return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
      case 'sphere':
        return (a.sphere ?? '').localeCompare(b.sphere ?? '');
      default:
        return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    }
  });
}

export interface TaskFilters {
  sphere?: string;
  goalId?: string;
  status?: string;
  category?: string;
  tag?: string;
  hideDone?: boolean;
}

/** Applies the list filters. Cancelled tasks are never listed. */
export function filterTasks(tasks: TaskRow[], f: TaskFilters): TaskRow[] {
  return tasks.filter(t => {
    if (t.status === 'CANCELLED') return false;
    if (f.sphere && t.sphere !== f.sphere) return false;
    if (f.goalId && t.goal_id !== f.goalId) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.tag && !taskHasTag(t, f.tag)) return false;
    if (f.hideDone && t.status === 'DONE') return false;
    return true;
  });
}

// ─── Tasks page settings (per-device preference) ─────────────────────────────

export interface TaskOption {
  val: string;
  label: string;
}

export interface TaskSettings {
  sortBy: TaskSortBy;
  hideDone: boolean;
  categories: TaskOption[];
  tags: TaskOption[];
}

const SORT_VALUES: readonly TaskSortBy[] = ['due_date', 'priority', 'created_at', 'sphere'];

function parseOptions(
  value: unknown,
  fallback: TaskOption[],
  normalizeVal: (v: string) => string = v => v,
): TaskOption[] {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  const out: TaskOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { val, label } = item as { val?: unknown; label?: unknown };
    if (typeof val !== 'string' || typeof label !== 'string') continue;
    const key = normalizeVal(val.slice(0, 60));
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({ val: key, label: label.slice(0, 60) });
    if (out.length >= 50) break;
  }
  return out;
}

/** Validates persisted settings (localStorage JSON), falling back field by field. */
export function parseTaskSettings(raw: string | null, defaults: TaskSettings): TaskSettings {
  if (!raw) return defaults;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (!parsed || typeof parsed !== 'object') return defaults;
  const p = parsed as Record<string, unknown>;
  return {
    sortBy: SORT_VALUES.includes(p.sortBy as TaskSortBy) ? (p.sortBy as TaskSortBy) : defaults.sortBy,
    hideDone: typeof p.hideDone === 'boolean' ? p.hideDone : defaults.hideDone,
    categories: parseOptions(p.categories, defaults.categories),
    // Tag keys are re-normalised so filters saved by older versions keep matching.
    tags: parseOptions(p.tags, defaults.tags, normalizeTag),
  };
}
