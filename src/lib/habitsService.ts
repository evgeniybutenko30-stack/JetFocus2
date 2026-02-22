/**
 * Habits Service — централизованный слой для всех операций с привычками в Supabase.
 */
import { supabase } from '@/lib/supabase';
import { getTodayStr } from '@/lib/constants';
import { awardStars, revokeStars } from '@/lib/starsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HabitRow {
  id: string;
  user_id: string;
  title: string;
  period_type: 'none' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  period_start: string | null;
  period_end: string | null;
  goal_id: string | null;
  life_sphere: string;
  repetitions_per_day: number;
  target_days: number[];
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface HabitTagRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface HabitTagLinkRow {
  habit_id: string;
  tag_id: string;
}

export interface HabitCompletionRow {
  id: string;
  user_id: string;
  habit_id: string;
  date: string;
  count: number;
  created_at: string;
}

export interface StarsLedgerRow {
  id: string;
  user_id: string;
  source: 'habit_completion';
  source_id: string;
  stars: number;
  date: string;
  created_at: string;
}

export interface HabitWithTags extends HabitRow {
  tags: HabitTagRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export class HabitsTableMissingError extends Error {
  constructor() {
    super('HABITS_TABLE_MISSING');
    this.name = 'HabitsTableMissingError';
  }
}

function toErr(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = (e as { message: string }).message;
    if (msg.includes('schema cache') || msg.includes('PGRST205')) return 'Временная ошибка сервера. Попробуйте снова.';
    if (msg.includes('duplicate')) return 'Такая запись уже существует.';
    if (msg.includes('violates')) return 'Нарушение правил доступа. Убедитесь, что вы авторизованы.';
    return msg;
  }
  return 'Неизвестная ошибка';
}

function isTableMissing(e: unknown): boolean {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = (e as { message: string }).message;
    return msg.includes('schema cache') || msg.includes('PGRST205') || msg.includes('Could not find the table');
  }
  if (e && typeof e === 'object' && 'code' in e) {
    return (e as { code: string }).code === 'PGRST205';
  }
  return false;
}

// ─── Default Tags ─────────────────────────────────────────────────────────────

const DEFAULT_TAGS = [
  { name: 'Утро', slug: 'morning' },
  { name: 'Вечер', slug: 'evening' },
  { name: 'Быстро', slug: 'quick' },
];

export async function ensureDefaultTags(userId: string): Promise<HabitTagRow[]> {
  // Get existing tags
  const { data: existing } = await supabase
    .from('habit_tags')
    .select('*')
    .eq('user_id', userId);

  const existingSlugs = (existing ?? []).map((t: HabitTagRow) => t.slug);

  // Insert missing defaults
  const toInsert = DEFAULT_TAGS.filter(t => !existingSlugs.includes(t.slug)).map(t => ({
    user_id: userId,
    name: t.name,
    slug: t.slug,
  }));

  if (toInsert.length > 0) {
    await supabase.from('habit_tags').insert(toInsert);
  }

  const { data: all } = await supabase
    .from('habit_tags')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  return (all ?? []) as HabitTagRow[];
}

// ─── Habits CRUD ──────────────────────────────────────────────────────────────

export async function listHabits(userId: string): Promise<{ data: HabitWithTags[]; error: string | null }> {
  const { data: habits, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isTableMissing(error)) throw new HabitsTableMissingError();
    return { data: [], error: toErr(error) };
  }
  if (!habits || habits.length === 0) return { data: [], error: null };

  // Get all tag links for these habits
  const habitIds = habits.map((h: HabitRow) => h.id);
  const { data: links } = await supabase
    .from('habit_tag_links')
    .select('habit_id, tag_id')
    .in('habit_id', habitIds);

  const tagIds = [...new Set((links ?? []).map((l: HabitTagLinkRow) => l.tag_id))];
  let tagsMap: Record<string, HabitTagRow> = {};

  if (tagIds.length > 0) {
    const { data: tags } = await supabase
      .from('habit_tags')
      .select('*')
      .in('id', tagIds);
    (tags ?? []).forEach((t: HabitTagRow) => { tagsMap[t.id] = t; });
  }

  const result: HabitWithTags[] = habits.map((h: HabitRow) => {
    const habitLinks = (links ?? []).filter((l: HabitTagLinkRow) => l.habit_id === h.id);
    const habitTags = habitLinks.map((l: HabitTagLinkRow) => tagsMap[l.tag_id]).filter(Boolean);
    return { ...h, tags: habitTags };
  });

  return { data: result, error: null };
}

export async function getHabitById(
  habitId: string,
  userId: string,
): Promise<{ data: HabitWithTags | null; error: string | null }> {
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('id', habitId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { data: null, error: toErr(error) };
  if (!data) return { data: null, error: null };

  const { data: links } = await supabase
    .from('habit_tag_links')
    .select('tag_id')
    .eq('habit_id', habitId);

  const tagIds = (links ?? []).map((l: { tag_id: string }) => l.tag_id);
  let tags: HabitTagRow[] = [];
  if (tagIds.length > 0) {
    const { data: tagRows } = await supabase.from('habit_tags').select('*').in('id', tagIds);
    tags = (tagRows ?? []) as HabitTagRow[];
  }

  return { data: { ...(data as HabitRow), tags }, error: null };
}

export async function createHabit(
  payload: Omit<HabitRow, 'id' | 'created_at' | 'updated_at'>,
  tagIds: string[],
): Promise<{ data: HabitRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('habits')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error) {
    if (isTableMissing(error)) return { data: null, error: 'Таблицы привычек не найдены в базе данных. Запустите SQL-миграцию в Supabase Dashboard.' };
    return { data: null, error: toErr(error) };
  }
  if (!data) return { data: null, error: 'Не удалось создать привычку' };

  // Link tags
  if (tagIds.length > 0) {
    await supabase.from('habit_tag_links').insert(
      tagIds.map(tid => ({ habit_id: data.id, tag_id: tid }))
    );
  }

  return { data, error: null };
}

export async function updateHabit(
  habitId: string,
  userId: string,
  payload: Partial<Omit<HabitRow, 'id' | 'user_id' | 'created_at'>>,
  tagIds?: string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('habits')
    .update(payload)
    .eq('id', habitId)
    .eq('user_id', userId);

  if (error) return { error: toErr(error) };

  if (tagIds !== undefined) {
    // Replace all tag links
    await supabase.from('habit_tag_links').delete().eq('habit_id', habitId);
    if (tagIds.length > 0) {
      await supabase.from('habit_tag_links').insert(
        tagIds.map(tid => ({ habit_id: habitId, tag_id: tid }))
      );
    }
  }

  return { error: null };
}

export async function deleteHabit(habitId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('habits')
    .delete()
    .eq('id', habitId)
    .eq('user_id', userId);

  if (error) return { error: toErr(error) };
  return { error: null };
}

// ─── Tags CRUD ────────────────────────────────────────────────────────────────

export async function listTags(userId: string): Promise<HabitTagRow[]> {
  const { data } = await supabase
    .from('habit_tags')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data ?? []) as HabitTagRow[];
}

export async function createTag(userId: string, name: string): Promise<{ data: HabitTagRow | null; error: string | null }> {
  const slug = name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-zа-яё0-9_]/g, '');
  const { data, error } = await supabase
    .from('habit_tags')
    .insert({ user_id: userId, name: name.trim(), slug })
    .select('*')
    .maybeSingle();

  if (error) return { data: null, error: toErr(error) };
  return { data, error: null };
}

export async function deleteTag(tagId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('habit_tags')
    .delete()
    .eq('id', tagId)
    .eq('user_id', userId);

  if (error) return { error: toErr(error) };
  return { error: null };
}

// ─── Completions ──────────────────────────────────────────────────────────────

export async function listCompletions(
  userId: string,
  fromDate?: string,
): Promise<{ data: HabitCompletionRow[]; error: string | null }> {
  let query = supabase
    .from('habit_completions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (fromDate) query = query.gte('date', fromDate);

  const { data, error } = await query;
  if (error) return { data: [], error: toErr(error) };
  return { data: (data ?? []) as HabitCompletionRow[], error: null };
}

/**
 * Increment completion by 1, up to repetitions_per_day.
 * Returns the new completion row and the number of stars awarded (0 or 1).
 */
export async function incrementCompletion(
  userId: string,
  habitId: string,
  repetitionsPerDay: number,
): Promise<{ data: HabitCompletionRow | null; starsAwarded: number; error: string | null }> {
  const today = getTodayStr();

  // Check existing completion
  const { data: existing } = await supabase
    .from('habit_completions')
    .select('*')
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .eq('date', today)
    .maybeSingle();

  const currentCount = (existing as HabitCompletionRow | null)?.count ?? 0;
  if (currentCount >= repetitionsPerDay) {
    return { data: existing as HabitCompletionRow, starsAwarded: 0, error: null };
  }

  let completion: HabitCompletionRow | null = null;

  if (existing) {
    const { data, error } = await supabase
      .from('habit_completions')
      .update({ count: currentCount + 1 })
      .eq('id', (existing as HabitCompletionRow).id)
      .select('*')
      .maybeSingle();
    if (error) return { data: null, starsAwarded: 0, error: toErr(error) };
    completion = data as HabitCompletionRow;
  } else {
    const { data, error } = await supabase
      .from('habit_completions')
      .insert({ user_id: userId, habit_id: habitId, date: today, count: 1 })
      .select('*')
      .maybeSingle();
    if (error) return { data: null, starsAwarded: 0, error: toErr(error) };
    completion = data as HabitCompletionRow;
  }

  // Award 1 star only when reaching target (not on every increment)
  const newCount = (currentCount + 1);
  const justCompleted = newCount >= repetitionsPerDay && currentCount < repetitionsPerDay;
  let starsAwarded = 0;
  if (completion && justCompleted) {
    const sourceKey = `habit_${habitId}_${today}`;
    const awarded = await awardStars(userId, 1, 'habit_completion', sourceKey);
    if (awarded) starsAwarded = 1;
  }

  return { data: completion, starsAwarded, error: null };
}

/**
 * Reset completion for today — set count to 0 (delete row) and rollback stars.
 */
export async function resetCompletion(
  userId: string,
  habitId: string,
): Promise<{ error: string | null }> {
  const today = getTodayStr();

  const { data: existing } = await supabase
    .from('habit_completions')
    .select('*')
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .eq('date', today)
    .maybeSingle();

  if (!existing) return { error: null };

  const completionId = (existing as HabitCompletionRow).id;

  // Delete stars for this habit+date
  const sourceKey = `habit_${habitId}_${today}`;
  await revokeStars(userId, sourceKey);

  // Delete completion
  const { error } = await supabase
    .from('habit_completions')
    .delete()
    .eq('id', completionId);

  if (error) return { error: toErr(error) };
  return { error: null };
}

// ─── Stars ────────────────────────────────────────────────────────────────────

export interface StarsSummary {
  today: number;
  week: number;
  total: number;
}

export async function getStarsSummary(userId: string): Promise<StarsSummary> {
  const today = getTodayStr();
  const d = new Date();
  const weekAgo = new Date(d.getTime() - 6 * 24 * 60 * 60 * 1000);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('stars_ledger')
    .select('delta, created_at')
    .eq('target_user_id', userId);

  const rows = (data ?? []) as { delta: number; created_at: string }[];
  const todayStars = rows.filter(r => r.created_at?.startsWith(today)).reduce((s, r) => s + (r.delta ?? 0), 0);
  const weekStars = rows.filter(r => (r.created_at ?? '') >= weekAgoStr).reduce((s, r) => s + (r.delta ?? 0), 0);
  const totalStars = rows.reduce((s, r) => s + (r.delta ?? 0), 0);

  return { today: todayStars, week: weekStars, total: totalStars };
}

// ─── Streaks ──────────────────────────────────────────────────────────────────

export function calculateStreak(
  habitId: string,
  completions: HabitCompletionRow[],
  targetDays: number[],
): number {
  const habitCompletions = completions.filter(c => c.habit_id === habitId);
  const completionDates = new Set(habitCompletions.map(c => c.date));

  let streak = 0;
  const d = new Date();

  for (let i = 0; i < 365; i++) {
    const date = new Date(d.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    // day 1=Mon..7=Sun
    const dow = date.getDay() === 0 ? 7 : date.getDay();

    if (!targetDays.includes(dow)) continue; // not a target day, skip
    if (completionDates.has(dateStr)) {
      streak++;
    } else {
      if (i === 0) continue; // today not yet done is ok
      break;
    }
  }

  return streak;
}

// ─── Is habit active today ────────────────────────────────────────────────────

export function isHabitActiveToday(habit: HabitRow): boolean {
  const today = new Date();
  const todayStr = getTodayStr();

  // Check period
  if (habit.period_type !== 'none') {
    if (habit.period_start && todayStr < habit.period_start) return false;
    if (habit.period_end && todayStr > habit.period_end) return false;
  }

  // Check target_days (1=Mon..7=Sun)
  const dow = today.getDay() === 0 ? 7 : today.getDay();
  return habit.target_days.includes(dow);
}
