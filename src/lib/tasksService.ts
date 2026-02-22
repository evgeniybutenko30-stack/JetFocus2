/**
 * Tasks Service — единый слой доступа к данным модуля «Задачи».
 */
import { supabase } from '@/lib/supabase';

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  sphere: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
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

function toServiceError(err: unknown): ServiceError {
  if (err && typeof err === 'object' && 'message' in err) {
    return { message: (err as { message: string }).message };
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

export async function updateTask(
  taskId: string,
  userId: string,
  payload: Partial<Omit<TaskRow, 'id' | 'user_id' | 'created_at'>>,
): Promise<{ error: ServiceError | null }> {
  const { error } = await supabase
    .from('tasks')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('user_id', userId);
  if (error) return { error: toServiceError(error) };
  return { error: null };
}

export async function deleteTask(taskId: string, userId: string): Promise<{ error: ServiceError | null }> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);
  if (error) return { error: toServiceError(error) };
  return { error: null };
}
