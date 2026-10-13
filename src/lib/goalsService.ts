/**
 * Goals Service — единый слой доступа к данным модуля «Цели».
 * Все запросы проходят через этот файл.
 */
import { supabase } from '@/lib/supabase';
import { getTodayStr } from '@/lib/constants';
import { awardStars, revokeStars } from '@/lib/starsService';

export interface GoalRow {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  sphere: string;
  type?: string;
  status: string;
  priority?: number;
  progress_mode?: string;
  start_value?: number;
  target_value?: number;
  current_value?: number;
  progress: number;
  target_date?: string | null;
  deadline?: string | null;
  is_pinned: boolean;
  is_achieved?: boolean;
  visibility?: string;
  budget?: number | null;
  milestones?: unknown;
  created_at: string;
  updated_at?: string;
}

export interface MilestoneRow {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  due_date?: string | null;
  order_index: number;
  status: 'todo' | 'done';
  reward_points: number;
  created_at: string;
}

export interface ActionRow {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  type?: string;
  due_date?: string | null;
  estimated_minutes?: number | null;
  status: 'todo' | 'done';
  impact: number;
  created_at: string;
}

export interface ProgressLogRow {
  id: string;
  goal_id: string;
  user_id: string;
  date: string;
  delta_value: number;
  source_type: string;
  source_id?: string | null;
  created_at: string;
}

export interface ServiceError {
  message: string;
  code?: string;
}

// ─── Limits ─────────────────────────────────────────────────────────────────

export const GOAL_TITLE_MAX = 120;
export const GOAL_DESCRIPTION_MAX = 1000;
export const GOAL_ITEM_TITLE_MAX = 120; // steps and milestones
export const STEP_MINUTES_MAX = 1440;
export const STEP_IMPACT_MAX = 100;
/** Upper bound accepted by the stars_ledger guard for source 'milestone'. */
export const MILESTONE_POINTS_MAX = 1000;
export const GOAL_STEP_STARS = 1;
export const GOAL_COMPLETE_STARS = 50;

// ─── Storage (localStorage can throw in private mode / blocked storage) ────

const TOUR_KEY = 'goals_tour_completed';
const WIZARD_KEY = 'goals_wizard_completed';

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, 'true');
  } catch {
    // Storage unavailable: the flag is a convenience only.
  }
}

export const isGoalsTourCompleted = () => readFlag(TOUR_KEY);
export const markGoalsTourCompleted = () => writeFlag(TOUR_KEY);
export const markGoalsWizardCompleted = () => writeFlag(WIZARD_KEY);

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** YYYY-MM-DD of the LOCAL calendar day (toISOString() would give the UTC day). */
export function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** New Date shifted by whole calendar days (DST-safe, unlike adding 86_400_000 ms). */
export function addDaysLocal(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function dateOnlyToUtcMs(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

/** Whole calendar days from `today` to `dateStr` (negative = overdue); null if absent/invalid. */
export function daysUntil(dateStr: string | null | undefined, today: string = getTodayStr()): number | null {
  if (!dateStr) return null;
  const target = dateOnlyToUtcMs(dateStr);
  const base = dateOnlyToUtcMs(today);
  if (target === null || base === null) return null;
  return Math.round((target - base) / 86_400_000);
}

/** Progress as an integer percentage in [0, 100]; garbage → 0. */
export function clampProgress(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Parse a numeric form field: non-numbers → fallback, out-of-range → clamped. */
export function parseBoundedInt(raw: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Progress after a step is checked (completing) or unchecked. Unchecking returns its impact. */
export function progressAfterActionToggle(current: number, impact: number, completing: boolean): number {
  const base = clampProgress(current);
  const delta = Number.isFinite(impact) ? Math.min(STEP_IMPACT_MAX, Math.max(0, impact)) : 0;
  return clampProgress(completing ? base + delta : base - delta);
}

/**
 * Progress after a milestone toggle. `milestonesAfter` is the list with the new status applied.
 * k of n milestones done means the goal is at least k/n done, so completing never lowers
 * progress (steps may already be ahead), and un-completing never raises it.
 */
export function progressAfterMilestoneToggle(
  current: number,
  milestonesAfter: { status: string }[],
  completing: boolean,
): number {
  const base = clampProgress(current);
  const total = milestonesAfter.length;
  if (total === 0) return base;
  const done = milestonesAfter.filter(m => m.status === 'done').length;
  const ratio = Math.round((done / total) * 100);
  if (completing) return Math.max(base, ratio);
  const ratioBefore = Math.round((Math.min(total, done + 1) / total) * 100);
  const share = ratioBefore - ratio;
  return clampProgress(Math.min(base, Math.max(ratio, base - share)));
}

export interface CompletionTransition {
  patch: { status: string; is_achieved: boolean } | null;
  justCompleted: boolean;
}

/** Keep status in sync with progress: 100% → completed, below 100% → back to active. */
export function completionTransition(prevStatus: string | null | undefined, nextProgress: number): CompletionTransition {
  if (nextProgress >= 100 && prevStatus !== 'completed') {
    return { patch: { status: 'completed', is_achieved: true }, justCompleted: true };
  }
  if (nextProgress < 100 && prevStatus === 'completed') {
    return { patch: { status: 'active', is_achieved: false }, justCompleted: false };
  }
  return { patch: null, justCompleted: false };
}

export function isGoalActive(g: Pick<GoalRow, 'status' | 'is_achieved'>): boolean {
  return g.status === 'active' || (!g.status && !g.is_achieved);
}

/** Next order_index: after the current maximum (list length collides after deletions). */
export function nextOrderIndex(milestones: { order_index: number }[]): number {
  return milestones.reduce((max, m) => Math.max(max, Number.isFinite(m.order_index) ? m.order_index : -1), -1) + 1;
}

/** Steps by due date (undated last), then by creation time. */
export function compareActions(a: ActionRow, b: ActionRow): number {
  const ad = a.due_date ?? '';
  const bd = b.due_date ?? '';
  if (ad !== bd) {
    if (!ad) return 1;
    if (!bd) return -1;
    return ad.localeCompare(bd);
  }
  return (a.created_at ?? '').localeCompare(b.created_at ?? '');
}

export type GoalHealth = 'healthy' | 'risk' | 'stalled';
type LogLike = Pick<ProgressLogRow, 'created_at' | 'delta_value'>;

const DAY_MS = 86_400_000;

function logAgeMs(log: LogLike, now: number): number {
  const t = Date.parse(log.created_at);
  return Number.isFinite(t) ? now - t : Number.POSITIVE_INFINITY;
}

export function getGoalHealth(logs: LogLike[], progress: number, now: number = Date.now()): GoalHealth {
  if (progress >= 100) return 'healthy';
  if (logs.some(l => logAgeMs(l, now) < 3 * DAY_MS)) return 'healthy';
  if (logs.some(l => logAgeMs(l, now) < 7 * DAY_MS)) return 'risk';
  return 'stalled';
}

export function getMomentum(logs: LogLike[], now: number = Date.now()): { state: 'up' | 'down' | 'stable'; value: number } {
  let last7 = 0;
  let prev7 = 0;
  for (const l of logs) {
    const age = logAgeMs(l, now);
    const delta = Number(l.delta_value) || 0;
    if (age < 7 * DAY_MS) last7 += delta;
    else if (age < 14 * DAY_MS) prev7 += delta;
  }
  const diff = last7 - prev7;
  if (diff > 1) return { state: 'up', value: last7 };
  if (diff < -1) return { state: 'down', value: last7 };
  return { state: 'stable', value: last7 };
}

/** Sum of deltas per local day for the last `days` days (oldest first). */
export function buildDailyProgress(
  logs: Pick<ProgressLogRow, 'date' | 'delta_value'>[],
  days: number,
  today: Date = new Date(),
): { date: string; value: number }[] {
  const map: Record<string, number> = {};
  logs.forEach(l => {
    map[l.date] = (map[l.date] || 0) + (Number(l.delta_value) || 0);
  });
  const result: { date: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = toLocalDateStr(addDaysLocal(today, -i));
    result.push({ date, value: map[date] || 0 });
  }
  return result;
}

// ─── Wizard plan dates ──────────────────────────────────────────────────────

/**
 * Due dates for `count` milestones spread evenly from today to the target date (local days).
 * The last milestone lands on the target date; a past/invalid target collapses to today.
 */
export function planMilestoneDates(count: number, targetDate: string, today: Date = new Date()): string[] {
  if (count <= 0) return [];
  const totalDays = Math.max(0, daysUntil(targetDate, toLocalDateStr(today)) ?? 0);
  return Array.from({ length: count }, (_, i) =>
    toLocalDateStr(addDaysLocal(today, Math.round(((i + 1) / count) * totalDays))),
  );
}

/**
 * Step dates on the selected weekdays (0 = Sunday) from tomorrow for `daysAhead` days,
 * at most `maxSteps`, never after `until` (the goal deadline) when given.
 */
export function planStepDates(
  selectedDays: number[],
  daysAhead: number,
  maxSteps: number,
  until?: string | null,
  today: Date = new Date(),
): string[] {
  const dates: string[] = [];
  for (let d = 1; d <= daysAhead && dates.length < maxSteps; d++) {
    const date = addDaysLocal(today, d);
    const str = toLocalDateStr(date);
    if (until && str > until) break;
    if (selectedDays.includes(date.getDay())) dates.push(str);
  }
  return dates;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

function toServiceError(err: unknown): ServiceError {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message: string; code?: string };
    return { message: e.message, code: e.code };
  }
  return { message: 'Неизвестная ошибка' };
}

const NOT_FOUND_ERROR: ServiceError = { message: 'Запись не найдена или нет доступа', code: 'not_found' };
/** Postgres: invalid text representation (e.g. a malformed uuid in the URL). */
const INVALID_INPUT_CODE = '22P02';
const FK_VIOLATION_CODE = '23503';

// ─── Goals CRUD ─────────────────────────────────────────────────────────────

export async function listGoals(userId: string): Promise<{ data: GoalRow[]; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: toServiceError(error) };
  return { data: data ?? [], error: null };
}

export async function getGoalById(
  goalId: string,
  userId: string,
): Promise<{ data: GoalRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // A malformed id can never match a goal: treat it as "not found", not as a retryable error.
    if (error.code === INVALID_INPUT_CODE) return { data: null, error: null };
    return { data: null, error: toServiceError(error) };
  }
  return { data: data ?? null, error: null };
}

export async function createGoal(
  payload: Omit<GoalRow, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ data: GoalRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goals')
    .insert(payload)
    .select('*')
    .maybeSingle();
  if (error) return { data: null, error: toServiceError(error) };
  if (!data) return { data: null, error: { message: 'Цель не сохранилась' } };
  return { data, error: null };
}

export async function updateGoal(
  goalId: string,
  userId: string,
  payload: Partial<Omit<GoalRow, 'id' | 'user_id' | 'created_at'>>,
): Promise<{ error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goals')
    .update(payload)
    .eq('id', goalId)
    .eq('user_id', userId)
    .select('id');
  if (error) return { error: toServiceError(error) };
  if (!data || data.length === 0) return { error: NOT_FOUND_ERROR };
  return { error: null };
}

async function deleteGoalChildren(goalId: string, userId: string) {
  const [ms, acts] = await Promise.all([
    supabase.from('goal_milestones').delete().eq('goal_id', goalId).eq('user_id', userId),
    supabase.from('goal_actions').delete().eq('goal_id', goalId).eq('user_id', userId),
  ]);
  return ms.error ?? acts.error ?? null;
}

/**
 * Delete a goal. The goal row goes first: the FKs are ON DELETE CASCADE, so children follow,
 * and a failed delete loses nothing (deleting children first lost them when the goal delete failed).
 */
export async function deleteGoal(
  goalId: string,
  userId: string,
): Promise<{ error: ServiceError | null }> {
  const del = () => supabase.from('goals').delete().eq('id', goalId).eq('user_id', userId).select('id');
  let { data, error } = await del();
  if (error && error.code === FK_VIOLATION_CODE) {
    // Schema without cascade: remove children explicitly, then retry.
    const childError = await deleteGoalChildren(goalId, userId);
    if (childError) return { error: toServiceError(childError) };
    ({ data, error } = await del());
  }
  if (error) return { error: toServiceError(error) };
  if (!data || data.length === 0) return { error: NOT_FOUND_ERROR };
  // Best-effort cleanup for schemas without a FK at all (no-op with cascade).
  await deleteGoalChildren(goalId, userId);
  return { error: null };
}

// ─── Milestones ──────────────────────────────────────────────────────────────

export async function listMilestones(
  goalId: string,
  userId: string,
): Promise<{ data: MilestoneRow[]; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_milestones')
    .select('*')
    .eq('goal_id', goalId)
    .eq('user_id', userId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { data: [], error: toServiceError(error) };
  return { data: data ?? [], error: null };
}

export async function listAllMilestones(userId: string): Promise<{ data: MilestoneRow[]; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_milestones')
    .select('*')
    .eq('user_id', userId)
    .order('order_index', { ascending: true });
  if (error) return { data: [], error: toServiceError(error) };
  return { data: data ?? [], error: null };
}

export async function updateMilestone(
  milestoneId: string,
  userId: string,
  payload: Partial<Omit<MilestoneRow, 'id' | 'user_id' | 'goal_id' | 'created_at'>>,
): Promise<{ error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_milestones')
    .update(payload)
    .eq('id', milestoneId)
    .eq('user_id', userId)
    .select('id');
  if (error) return { error: toServiceError(error) };
  if (!data || data.length === 0) return { error: NOT_FOUND_ERROR };
  return { error: null };
}

export type NewMilestone = Omit<MilestoneRow, 'id' | 'created_at' | 'reward_points'> & { reward_points?: number };

export async function addMilestone(
  payload: NewMilestone,
): Promise<{ data: MilestoneRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_milestones')
    .insert(payload)
    .select('*')
    .maybeSingle();
  if (error) return { data: null, error: toServiceError(error) };
  if (!data) return { data: null, error: { message: 'Веха не сохранилась' } };
  return { data, error: null };
}

export async function addMilestones(rows: NewMilestone[]): Promise<{ error: ServiceError | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from('goal_milestones').insert(rows);
  return { error: error ? toServiceError(error) : null };
}

export async function deleteMilestone(milestoneId: string, userId: string): Promise<{ error: ServiceError | null }> {
  const { error } = await supabase.from('goal_milestones').delete().eq('id', milestoneId).eq('user_id', userId);
  if (error) return { error: toServiceError(error) };
  return { error: null };
}

// ─── Actions (steps) ─────────────────────────────────────────────────────────

export async function listActions(
  goalId: string,
  userId: string,
): Promise<{ data: ActionRow[]; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_actions')
    .select('*')
    .eq('goal_id', goalId)
    .eq('user_id', userId)
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { data: [], error: toServiceError(error) };
  return { data: data ?? [], error: null };
}

export async function listAllActions(userId: string): Promise<{ data: ActionRow[]; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_actions')
    .select('*')
    .eq('user_id', userId)
    .order('due_date', { ascending: true });
  if (error) return { data: [], error: toServiceError(error) };
  return { data: data ?? [], error: null };
}

export async function updateAction(
  actionId: string,
  userId: string,
  payload: Partial<Omit<ActionRow, 'id' | 'user_id' | 'goal_id' | 'created_at'>>,
): Promise<{ error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_actions')
    .update(payload)
    .eq('id', actionId)
    .eq('user_id', userId)
    .select('id');
  if (error) return { error: toServiceError(error) };
  if (!data || data.length === 0) return { error: NOT_FOUND_ERROR };
  return { error: null };
}

export type NewAction = Omit<ActionRow, 'id' | 'created_at'>;

export async function addAction(
  payload: NewAction,
): Promise<{ data: ActionRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_actions')
    .insert(payload)
    .select('*')
    .maybeSingle();
  if (error) return { data: null, error: toServiceError(error) };
  if (!data) return { data: null, error: { message: 'Шаг не сохранился' } };
  return { data, error: null };
}

export async function addActions(rows: NewAction[]): Promise<{ error: ServiceError | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from('goal_actions').insert(rows);
  return { error: error ? toServiceError(error) : null };
}

export async function deleteAction(actionId: string, userId: string): Promise<{ error: ServiceError | null }> {
  const { error } = await supabase.from('goal_actions').delete().eq('id', actionId).eq('user_id', userId);
  if (error) return { error: toServiceError(error) };
  return { error: null };
}

// ─── Progress logs (activity history; optional table — failures are non-fatal) ─

export async function listProgressLogs(
  userId: string,
  sinceDate: string,
): Promise<{ data: ProgressLogRow[]; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_progress_logs')
    .select('id, goal_id, user_id, date, delta_value, source_type, source_id, created_at')
    .eq('user_id', userId)
    .gte('date', sinceDate);
  if (error) return { data: [], error: toServiceError(error) };
  return { data: data ?? [], error: null };
}

async function logProgress(
  goalId: string,
  userId: string,
  delta: number,
  sourceType: 'task' | 'milestone',
  sourceId: string,
): Promise<void> {
  const { error } = await supabase.from('goal_progress_logs').insert({
    goal_id: goalId,
    user_id: userId,
    date: getTodayStr(),
    delta_value: delta,
    source_type: sourceType,
    source_id: sourceId,
  });
  if (error) console.warn('goal_progress_logs insert failed:', error.message);
}

async function removeProgressLog(goalId: string, userId: string, sourceId: string): Promise<void> {
  const { error } = await supabase
    .from('goal_progress_logs')
    .delete()
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .eq('source_id', sourceId);
  if (error) console.warn('goal_progress_logs delete failed:', error.message);
}

// ─── Step / milestone completion (progress + status + stars in one place) ────

type GoalProgressState = Pick<GoalRow, 'id' | 'progress' | 'status' | 'is_achieved'>;

export interface GoalProgressUpdate {
  error: ServiceError | null;
  progress: number;
  status: string;
  isAchieved: boolean;
  justCompleted: boolean;
}

function unchanged(goal: GoalProgressState, error: ServiceError): GoalProgressUpdate {
  return {
    error,
    progress: clampProgress(goal.progress),
    status: goal.status,
    isAchieved: !!goal.is_achieved,
    justCompleted: false,
  };
}

/** Check / uncheck a step and apply its impact to the goal. Nothing changes locally on error. */
export async function toggleGoalAction(
  goal: GoalProgressState,
  action: Pick<ActionRow, 'id' | 'status' | 'impact'>,
  userId: string,
): Promise<GoalProgressUpdate> {
  const completing = action.status !== 'done';
  const { error: actionError } = await updateAction(action.id, userId, { status: completing ? 'done' : 'todo' });
  if (actionError) return unchanged(goal, actionError);

  const prevProgress = clampProgress(goal.progress);
  const progress = progressAfterActionToggle(prevProgress, action.impact, completing);
  const { patch, justCompleted } = completionTransition(goal.status, progress);
  const { error: goalError } = await updateGoal(goal.id, userId, { progress, ...(patch ?? {}) });
  if (goalError) {
    // Keep the step and the goal consistent: undo the step change.
    await updateAction(action.id, userId, { status: action.status });
    return unchanged(goal, goalError);
  }

  const sourceKey = `goal_step_${action.id}`;
  if (completing) {
    await awardStars(userId, GOAL_STEP_STARS, 'goal_step', sourceKey);
    if (justCompleted) await awardStars(userId, GOAL_COMPLETE_STARS, 'goal_complete', `goal_complete_${goal.id}`);
    await logProgress(goal.id, userId, progress - prevProgress, 'task', action.id);
  } else {
    await revokeStars(userId, sourceKey);
    await removeProgressLog(goal.id, userId, action.id);
  }

  return {
    error: null,
    progress,
    status: patch?.status ?? goal.status,
    isAchieved: patch ? patch.is_achieved : !!goal.is_achieved,
    justCompleted,
  };
}

/** Check / uncheck a milestone, recompute goal progress and award / revoke its stars. */
export async function toggleGoalMilestone(
  goal: GoalProgressState,
  milestones: MilestoneRow[],
  milestone: MilestoneRow,
  userId: string,
): Promise<GoalProgressUpdate & { milestones: MilestoneRow[] }> {
  const completing = milestone.status !== 'done';
  const newStatus: MilestoneRow['status'] = completing ? 'done' : 'todo';
  const { error: msError } = await updateMilestone(milestone.id, userId, { status: newStatus });
  if (msError) return { ...unchanged(goal, msError), milestones };

  const updated = milestones.map(m => (m.id === milestone.id ? { ...m, status: newStatus } : m));
  const prevProgress = clampProgress(goal.progress);
  const progress = progressAfterMilestoneToggle(prevProgress, updated, completing);
  const { patch, justCompleted } = completionTransition(goal.status, progress);
  if (progress !== goal.progress || patch) {
    const { error: goalError } = await updateGoal(goal.id, userId, { progress, ...(patch ?? {}) });
    if (goalError) {
      await updateMilestone(milestone.id, userId, { status: milestone.status });
      return { ...unchanged(goal, goalError), milestones };
    }
  }

  const sourceKey = `milestone_${milestone.id}`;
  if (completing) {
    const points = Math.min(MILESTONE_POINTS_MAX, Math.max(0, Math.round(Number(milestone.reward_points) || 0)));
    await awardStars(userId, points, 'milestone', sourceKey);
    if (justCompleted) await awardStars(userId, GOAL_COMPLETE_STARS, 'goal_complete', `goal_complete_${goal.id}`);
    await logProgress(goal.id, userId, progress - prevProgress, 'milestone', milestone.id);
  } else {
    await revokeStars(userId, sourceKey);
    await removeProgressLog(goal.id, userId, milestone.id);
  }

  return {
    error: null,
    progress,
    status: patch?.status ?? goal.status,
    isAchieved: patch ? patch.is_achieved : !!goal.is_achieved,
    justCompleted,
    milestones: updated,
  };
}
