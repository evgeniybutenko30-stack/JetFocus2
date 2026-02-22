/**
 * Goals Service — единый слой доступа к данным модуля «Цели».
 * Все запросы проходят через этот файл.
 */
import { supabase } from '@/lib/supabase';

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
  estimated_minutes?: number;
  status: 'todo' | 'done';
  impact: number;
  created_at: string;
}

export interface ServiceError {
  message: string;
  code?: string;
}

function toServiceError(err: unknown): ServiceError {
  if (err && typeof err === 'object' && 'message' in err) {
    return { message: (err as { message: string }).message };
  }
  return { message: 'Неизвестная ошибка' };
}

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
  if (error) return { data: null, error: toServiceError(error) };
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
  return { data: data ?? null, error: null };
}

export async function updateGoal(
  goalId: string,
  userId: string,
  payload: Partial<Omit<GoalRow, 'id' | 'user_id' | 'created_at'>>,
): Promise<{ error: ServiceError | null }> {
  const { error } = await supabase
    .from('goals')
    .update(payload)
    .eq('id', goalId)
    .eq('user_id', userId);
  if (error) return { error: toServiceError(error) };
  return { error: null };
}

export async function deleteGoal(
  goalId: string,
  userId: string,
): Promise<{ error: ServiceError | null }> {
  // Delete children first to avoid FK issues
  await supabase.from('goal_milestones').delete().eq('goal_id', goalId).eq('user_id', userId);
  await supabase.from('goal_actions').delete().eq('goal_id', goalId).eq('user_id', userId);
  const { error } = await supabase.from('goals').delete().eq('id', goalId).eq('user_id', userId);
  if (error) return { error: toServiceError(error) };
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
    .order('order_index', { ascending: true });
  if (error) return { data: [], error: toServiceError(error) };
  return { data: data ?? [], error: null };
}

export async function updateMilestone(
  milestoneId: string,
  payload: Partial<MilestoneRow>,
): Promise<{ error: ServiceError | null }> {
  const { error } = await supabase.from('goal_milestones').update(payload).eq('id', milestoneId);
  if (error) return { error: toServiceError(error) };
  return { error: null };
}

export async function addMilestone(
  payload: Omit<MilestoneRow, 'id' | 'created_at'>,
): Promise<{ data: MilestoneRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_milestones')
    .insert(payload)
    .select('*')
    .maybeSingle();
  if (error) return { data: null, error: toServiceError(error) };
  return { data: data ?? null, error: null };
}

export async function deleteMilestone(milestoneId: string): Promise<{ error: ServiceError | null }> {
  const { error } = await supabase.from('goal_milestones').delete().eq('id', milestoneId);
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
    .order('due_date', { ascending: true });
  if (error) return { data: [], error: toServiceError(error) };
  return { data: data ?? [], error: null };
}

export async function updateAction(
  actionId: string,
  payload: Partial<ActionRow>,
): Promise<{ error: ServiceError | null }> {
  const { error } = await supabase.from('goal_actions').update(payload).eq('id', actionId);
  if (error) return { error: toServiceError(error) };
  return { error: null };
}

export async function addAction(
  payload: Omit<ActionRow, 'id' | 'created_at'>,
): Promise<{ data: ActionRow | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from('goal_actions')
    .insert(payload)
    .select('*')
    .maybeSingle();
  if (error) return { data: null, error: toServiceError(error) };
  return { data: data ?? null, error: null };
}

export async function deleteAction(actionId: string): Promise<{ error: ServiceError | null }> {
  const { error } = await supabase.from('goal_actions').delete().eq('id', actionId);
  if (error) return { error: toServiceError(error) };
  return { error: null };
}
