/**
 * Habits Service — централизованный слой для всех операций с привычками в Supabase.
 *
 * Дни в приложении — это ЛОКАЛЬНАЯ календарная дата пользователя 'yyyy-MM-dd'
 * (см. getTodayStr в constants.ts); `habit_completions.date` хранится именно так.
 * Никогда не получайте день через toISOString(): это дата по UTC, которая около
 * полуночи отличается от локальной (например, 00:00–03:00 по Москве).
 */
import { supabase } from '@/lib/supabase';
import { getTodayStr } from '@/lib/constants';
import { awardStars, revokeStars } from '@/lib/starsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HabitPeriodType = 'none' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface HabitRow {
  id: string;
  user_id: string;
  title: string;
  period_type: HabitPeriodType;
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

export interface HabitWithTags extends HabitRow {
  tags: HabitTagRow[];
}

/** Fields that decide on which days a habit is scheduled. */
export type HabitSchedule = Pick<HabitRow, 'target_days' | 'period_type' | 'period_start' | 'period_end'> & {
  created_at?: string | null;
};

type ScheduledHabit = HabitSchedule & Pick<HabitRow, 'id' | 'repetitions_per_day'>;

/** Input length limits (the DB columns are unbounded `text`). */
export const HABIT_TITLE_MAX = 100;
export const HABIT_TAG_NAME_MAX = 30;

// ─── Errors ──────────────────────────────────────────────────────────────────

export class HabitsTableMissingError extends Error {
  constructor() {
    super('HABITS_TABLE_MISSING');
    this.name = 'HabitsTableMissingError';
  }
}

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = (e as { message: unknown }).message;
    return typeof msg === 'string' ? msg : '';
  }
  return '';
}

function errorCode(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code: unknown }).code;
    return typeof code === 'string' ? code : '';
  }
  return '';
}

/** Human-readable (Russian) message for a Supabase/PostgREST/network error. */
export function toHabitErrorMessage(e: unknown): string {
  const msg = errorMessage(e);
  if (!msg) return 'Неизвестная ошибка';
  if (msg.includes('schema cache') || msg.includes('PGRST205')) return 'Временная ошибка сервера. Попробуйте снова.';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Нет соединения с сервером. Проверьте интернет и попробуйте снова.';
  }
  if (msg.includes('duplicate')) return 'Такая запись уже существует.';
  if (msg.includes('check constraint')) return 'Некорректные данные. Проверьте заполненные поля.';
  if (msg.includes('foreign key')) return 'Связанная запись не найдена (возможно, она была удалена).';
  if (msg.includes('row-level security') || msg.includes('permission denied') || msg.includes('violates')) {
    return 'Нарушение правил доступа. Убедитесь, что вы авторизованы.';
  }
  return msg;
}

const toErr = toHabitErrorMessage;

function isTableMissing(e: unknown): boolean {
  const msg = errorMessage(e);
  if (msg.includes('schema cache') || msg.includes('PGRST205') || msg.includes('Could not find the table')) return true;
  return errorCode(e) === 'PGRST205';
}

function isUniqueViolation(e: unknown): boolean {
  return errorCode(e) === '23505' || errorMessage(e).includes('duplicate key');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Pure helpers: dates & schedule ──────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar date of `date` as 'yyyy-MM-dd'. */
export function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Parses a local 'yyyy-MM-dd' into a Date at local noon (falls back to now if malformed). */
export function fromLocalDateStr(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

/**
 * The local calendar day `days` days after `from` (negative = before). DST-safe: it
 * shifts the calendar day (anchored at noon) instead of subtracting 24h blocks.
 */
export function addLocalDays(from: Date, days: number): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, 12);
}

/** ISO weekday: 1 = Monday … 7 = Sunday (the `target_days` convention). */
export function isoWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

/** Unique, sorted weekdays in 1..7 (tolerates null / garbage from the DB). */
export function normalizeTargetDays(days: readonly number[] | null | undefined): number[] {
  const set = new Set<number>();
  (days ?? []).forEach(d => {
    const n = Number(d);
    if (Number.isInteger(n) && n >= 1 && n <= 7) set.add(n);
  });
  return [...set].sort((a, b) => a - b);
}

/** A day counts as "done" only when the daily target is reached. */
export function isCompletionDone(count: number | null | undefined, repetitionsPerDay: number): boolean {
  return (count ?? 0) >= Math.max(1, repetitionsPerDay || 1);
}

/**
 * Whether a habit is scheduled on `date`: weekday in `target_days` and inside the
 * habit's period. With `respectCreatedAt`, days before the habit was created are
 * excluded (used by history/analytics so old days are not counted as "missed").
 */
export function isHabitScheduledOn(
  habit: HabitSchedule,
  date: Date,
  opts: { respectCreatedAt?: boolean } = {},
): boolean {
  const dateStr = toLocalDateStr(date);
  if (habit.period_type !== 'none') {
    if (habit.period_start && dateStr < habit.period_start) return false;
    if (habit.period_end && dateStr > habit.period_end) return false;
  }
  if (opts.respectCreatedAt && habit.created_at) {
    const created = new Date(habit.created_at);
    if (!Number.isNaN(created.getTime()) && dateStr < toLocalDateStr(created)) return false;
  }
  return normalizeTargetDays(habit.target_days).includes(isoWeekday(date));
}

/** Is the habit scheduled for today (local date)? */
export function isHabitActiveToday(habit: HabitSchedule, now: Date = new Date()): boolean {
  return isHabitScheduledOn(habit, now);
}

/**
 * Current streak: consecutive scheduled days (non-target days are skipped) on which the
 * daily target was reached. Today not done yet does not break the streak.
 */
export function calculateStreak(
  habitId: string,
  completions: HabitCompletionRow[],
  targetDays: number[],
  repetitionsPerDay = 1,
  now: Date = new Date(),
): number {
  const days = new Set(normalizeTargetDays(targetDays));
  if (days.size === 0) return 0;

  const doneDates = new Set(
    completions
      .filter(c => c.habit_id === habitId && isCompletionDone(c.count, repetitionsPerDay))
      .map(c => c.date),
  );

  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const day = addLocalDays(now, -i);
    if (!days.has(isoWeekday(day))) continue; // not a target day, skip
    if (doneDates.has(toLocalDateStr(day))) {
      streak++;
    } else if (i !== 0) {
      break; // a missed scheduled day ends the streak (today not yet done is ok)
    }
  }
  return streak;
}

/** Done / scheduled habits for one day (history-aware, see isHabitScheduledOn). */
export function getDayCompletionStats(
  habits: ScheduledHabit[],
  completions: HabitCompletionRow[],
  date: Date,
): { done: number; total: number } {
  const dateStr = toLocalDateStr(date);
  let done = 0;
  let total = 0;
  for (const h of habits) {
    if (!isHabitScheduledOn(h, date, { respectCreatedAt: true })) continue;
    total++;
    const c = completions.find(x => x.habit_id === h.id && x.date === dateStr);
    if (c && isCompletionDone(c.count, h.repetitions_per_day)) done++;
  }
  return { done, total };
}

export interface DailyProgressPoint {
  date: Date;
  done: number;
  total: number;
  /** 0..100; 0 for days without scheduled habits. */
  value: number;
}

/** Completion % for each of the last `days` days (oldest first, ending today). */
export function computeDailyProgress(
  habits: ScheduledHabit[],
  completions: HabitCompletionRow[],
  days: number,
  now: Date = new Date(),
): DailyProgressPoint[] {
  const n = Math.max(0, Math.floor(days));
  return Array.from({ length: n }, (_, i) => {
    const date = addLocalDays(now, -(n - 1 - i));
    const { done, total } = getDayCompletionStats(habits, completions, date);
    return { date, done, total, value: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0 };
  });
}

/** Average % over the days that had something scheduled (empty days do not drag it down). */
export function averageCompletion(points: DailyProgressPoint[]): number {
  const relevant = points.filter(p => p.total > 0);
  if (relevant.length === 0) return 0;
  return Math.round(relevant.reduce((s, p) => s + p.value, 0) / relevant.length);
}

/** Per-sphere done / planned habit-days over the last `days` days. */
export function computeSphereRates(
  habits: (ScheduledHabit & Pick<HabitRow, 'life_sphere'>)[],
  completions: HabitCompletionRow[],
  days: number,
  now: Date = new Date(),
): Map<string, { done: number; planned: number }> {
  const doneKeys = new Set<string>();
  const habitById = new Map(habits.map(h => [h.id, h]));
  completions.forEach(c => {
    const h = habitById.get(c.habit_id);
    if (h && isCompletionDone(c.count, h.repetitions_per_day)) doneKeys.add(`${c.habit_id}|${c.date}`);
  });

  const rates = new Map<string, { done: number; planned: number }>();
  for (let i = 0; i < Math.max(0, Math.floor(days)); i++) {
    const date = addLocalDays(now, -i);
    const dateStr = toLocalDateStr(date);
    for (const h of habits) {
      if (!isHabitScheduledOn(h, date, { respectCreatedAt: true })) continue;
      const r = rates.get(h.life_sphere) ?? { done: 0, planned: 0 };
      r.planned++;
      if (doneKeys.has(`${h.id}|${dateStr}`)) r.done++;
      rates.set(h.life_sphere, r);
    }
  }
  return rates;
}

/** Percentage 0..100, safe for a zero denominator. */
export function safePercent(done: number, total: number): number {
  if (!total || total <= 0 || !Number.isFinite(done)) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/** Validation of the custom period (mirrors the DB `custom_period_check`). */
export function validateHabitPeriod(periodType: HabitPeriodType, start: string, end: string): string | null {
  if (periodType !== 'custom') return null;
  if (!start || !end) return 'Укажите даты начала и конца периода';
  if (end < start) return 'Дата конца не может быть раньше даты начала';
  return null;
}

/** Slug for a tag; emoji/punctuation-only names get a stable hash instead of ''. */
export function makeTagSlug(name: string): string {
  const trimmed = name.trim();
  const base = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-zа-яё0-9_]/g, '');
  if (base) return base.slice(0, 60);
  let h = 0;
  for (const ch of trimmed) h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) >>> 0;
  return `tag_${h.toString(36)}`;
}

/** Replace (or add) a completion row in a cached list, keyed by habit + date. */
export function upsertCompletionInList(list: HabitCompletionRow[], row: HabitCompletionRow): HabitCompletionRow[] {
  const rest = list.filter(c => !(c.habit_id === row.habit_id && c.date === row.date));
  return [row, ...rest];
}

/** Remove a habit's completion for `date` from a cached list. */
export function removeCompletionFromList(list: HabitCompletionRow[], habitId: string, date: string): HabitCompletionRow[] {
  return list.filter(c => !(c.habit_id === habitId && c.date === date));
}

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Google Calendar "create event" link: an all-day event repeating on the habit's days. */
export function buildGoogleCalendarUrl(
  habit: Pick<HabitRow, 'title' | 'target_days' | 'period_type' | 'period_end'>,
  now: Date = new Date(),
): string {
  const compact = (s: string) => s.replace(/-/g, '');
  const start = compact(toLocalDateStr(now));
  const end = compact(toLocalDateStr(addLocalDays(now, 1))); // all-day end date is exclusive
  const days = normalizeTargetDays(habit.target_days);
  let rrule = days.length === 0 || days.length === 7
    ? 'RRULE:FREQ=DAILY'
    : `RRULE:FREQ=WEEKLY;BYDAY=${days.map(d => BYDAY[d - 1]).join(',')}`;
  if (habit.period_type !== 'none' && habit.period_end && /^\d{4}-\d{2}-\d{2}$/.test(habit.period_end)) {
    rrule += `;UNTIL=${compact(habit.period_end)}`;
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: habit.title,
    details: `Привычка: ${habit.title}`,
    dates: `${start}/${end}`,
    recur: rrule,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ─── Default Tags ─────────────────────────────────────────────────────────────

const DEFAULT_TAGS = [
  { name: 'Утро', slug: 'morning' },
  { name: 'Вечер', slug: 'evening' },
  { name: 'Быстро', slug: 'quick' },
];

/** Lists the user's tags, creating the default ones once. Throws if the tags cannot be read. */
export async function ensureDefaultTags(userId: string): Promise<HabitTagRow[]> {
  const { data: existing, error: selectError } = await supabase
    .from('habit_tags')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  // Never guess "no tags" from a failed read: that would try to re-insert the defaults.
  if (selectError) throw new Error(toErr(selectError));

  const rows = (existing ?? []) as HabitTagRow[];
  const existingSlugs = new Set(rows.map(t => t.slug));
  const toInsert = DEFAULT_TAGS.filter(t => !existingSlugs.has(t.slug)).map(t => ({
    user_id: userId,
    name: t.name,
    slug: t.slug,
  }));
  if (toInsert.length === 0) return rows;

  const { error: insertError } = await supabase.from('habit_tags').insert(toInsert);
  // A concurrent call may have inserted them first (unique user_id+slug) — that's fine.
  if (insertError && !isUniqueViolation(insertError)) {
    console.warn('ensureDefaultTags insert failed:', insertError);
    return rows;
  }

  const { data: all, error: listError } = await supabase
    .from('habit_tags')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (listError) return rows;
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
  const habitRows = (habits ?? []) as HabitRow[];
  if (habitRows.length === 0) return { data: [], error: null };

  // Get all tag links for these habits
  const habitIds = habitRows.map(h => h.id);
  const { data: links, error: linksError } = await supabase
    .from('habit_tag_links')
    .select('habit_id, tag_id')
    .in('habit_id', habitIds);
  if (linksError) return { data: [], error: toErr(linksError) };

  const linkRows = (links ?? []) as HabitTagLinkRow[];
  const tagIds = [...new Set(linkRows.map(l => l.tag_id))];
  const tagsMap: Record<string, HabitTagRow> = {};

  if (tagIds.length > 0) {
    const { data: tags, error: tagsError } = await supabase
      .from('habit_tags')
      .select('*')
      .in('id', tagIds);
    if (tagsError) return { data: [], error: toErr(tagsError) };
    ((tags ?? []) as HabitTagRow[]).forEach(t => { tagsMap[t.id] = t; });
  }

  const result: HabitWithTags[] = habitRows.map(h => {
    const habitTags = linkRows
      .filter(l => l.habit_id === h.id)
      .map(l => tagsMap[l.tag_id])
      .filter((t): t is HabitTagRow => Boolean(t));
    return { ...h, tags: habitTags };
  });

  return { data: result, error: null };
}

export async function getHabitById(
  habitId: string,
  userId: string,
): Promise<{ data: HabitWithTags | null; error: string | null }> {
  // A malformed id in the URL is "not found", not a Postgres uuid syntax error.
  if (!UUID_RE.test(habitId)) return { data: null, error: null };

  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('id', habitId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { data: null, error: toErr(error) };
  if (!data) return { data: null, error: null };

  const { data: links, error: linksError } = await supabase
    .from('habit_tag_links')
    .select('tag_id')
    .eq('habit_id', habitId);
  if (linksError) return { data: null, error: toErr(linksError) };

  const tagIds = ((links ?? []) as { tag_id: string }[]).map(l => l.tag_id);
  let tags: HabitTagRow[] = [];
  if (tagIds.length > 0) {
    const { data: tagRows, error: tagsError } = await supabase.from('habit_tags').select('*').in('id', tagIds);
    if (tagsError) return { data: null, error: toErr(tagsError) };
    tags = (tagRows ?? []) as HabitTagRow[];
  }

  return { data: { ...(data as HabitRow), tags }, error: null };
}

const TAGS_NOT_SAVED = 'Привычка сохранена, но теги не обновились. Попробуйте изменить их ещё раз.';

export async function createHabit(
  payload: Omit<HabitRow, 'id' | 'created_at' | 'updated_at'>,
  tagIds: string[],
): Promise<{ data: HabitRow | null; error: string | null; warning?: string }> {
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
  const habit = data as HabitRow;

  // Link tags. The habit itself already exists, so a failure here is a warning, not an
  // error (reporting an error would make the user retry and create a duplicate habit).
  const uniqueTagIds = [...new Set(tagIds)];
  if (uniqueTagIds.length > 0) {
    const { error: linkError } = await supabase.from('habit_tag_links').insert(
      uniqueTagIds.map(tid => ({ habit_id: habit.id, tag_id: tid })),
    );
    if (linkError) {
      console.warn('createHabit: tag links failed:', linkError);
      return { data: habit, error: null, warning: TAGS_NOT_SAVED };
    }
  }

  return { data: habit, error: null };
}

/**
 * Updates the caller's own habit. An UPDATE that matches no row (deleted elsewhere,
 * foreign id) is not an error for PostgREST, so affected rows are checked to avoid a
 * false "saved". Tag links are diffed (only removed/added links are touched), so a
 * failed write can no longer wipe all tags.
 */
export async function updateHabit(
  habitId: string,
  userId: string,
  payload: Partial<Omit<HabitRow, 'id' | 'user_id' | 'created_at'>>,
  tagIds?: string[],
): Promise<{ error: string | null; warning?: string }> {
  const { data, error } = await supabase
    .from('habits')
    .update(payload)
    .eq('id', habitId)
    .eq('user_id', userId)
    .select('id');

  if (error) return { error: toErr(error) };
  if (!data || (data as unknown[]).length === 0) {
    return { error: 'Привычка не найдена — возможно, она была удалена.' };
  }

  if (tagIds !== undefined) {
    const wanted = new Set(tagIds);
    const { data: links, error: linksError } = await supabase
      .from('habit_tag_links')
      .select('tag_id')
      .eq('habit_id', habitId);
    if (linksError) return { error: null, warning: TAGS_NOT_SAVED };

    const current = new Set(((links ?? []) as { tag_id: string }[]).map(l => l.tag_id));
    const toRemove = [...current].filter(t => !wanted.has(t));
    const toAdd = [...wanted].filter(t => !current.has(t));

    if (toRemove.length > 0) {
      const { error: delError } = await supabase
        .from('habit_tag_links')
        .delete()
        .eq('habit_id', habitId)
        .in('tag_id', toRemove);
      if (delError) return { error: null, warning: TAGS_NOT_SAVED };
    }
    if (toAdd.length > 0) {
      const { error: insError } = await supabase
        .from('habit_tag_links')
        .insert(toAdd.map(tid => ({ habit_id: habitId, tag_id: tid })));
      if (insError && !isUniqueViolation(insError)) return { error: null, warning: TAGS_NOT_SAVED };
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
  const { data, error } = await supabase
    .from('habit_tags')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(toErr(error));
  return (data ?? []) as HabitTagRow[];
}

export async function createTag(userId: string, name: string): Promise<{ data: HabitTagRow | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { data: null, error: 'Введите название тега' };
  if (trimmed.length > HABIT_TAG_NAME_MAX) {
    return { data: null, error: `Название тега — не длиннее ${HABIT_TAG_NAME_MAX} символов` };
  }
  const { data, error } = await supabase
    .from('habit_tags')
    .insert({ user_id: userId, name: trimmed, slug: makeTagSlug(trimmed) })
    .select('*')
    .maybeSingle();

  if (error) return { data: null, error: toErr(error) };
  if (!data) return { data: null, error: 'Не удалось создать тег' };
  return { data: data as HabitTagRow, error: null };
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

const MAX_INCREMENT_ATTEMPTS = 3;

/**
 * Increment today's completion by 1, up to repetitions_per_day.
 *
 * Concurrency-safe: the UPDATE is a compare-and-swap on the previously read `count`, and
 * an INSERT that loses the race against the UNIQUE(user_id, habit_id, date) constraint is
 * retried as an update — so rapid clicks / two tabs never lose an increment or surface a
 * "duplicate" error. Returns the new row, the stars awarded (0 or 1) and whether this
 * increment reached the daily target.
 */
export async function incrementCompletion(
  userId: string,
  habitId: string,
  repetitionsPerDay: number,
): Promise<{ data: HabitCompletionRow | null; starsAwarded: number; justCompleted: boolean; error: string | null }> {
  const today = getTodayStr();
  const target = Math.max(1, repetitionsPerDay || 1);

  for (let attempt = 0; attempt < MAX_INCREMENT_ATTEMPTS; attempt++) {
    const { data: existingData, error: selectError } = await supabase
      .from('habit_completions')
      .select('*')
      .eq('user_id', userId)
      .eq('habit_id', habitId)
      .eq('date', today)
      .maybeSingle();
    if (selectError) return { data: null, starsAwarded: 0, justCompleted: false, error: toErr(selectError) };

    const existing = existingData as HabitCompletionRow | null;
    const currentCount = existing?.count ?? 0;
    if (existing && currentCount >= target) {
      return { data: existing, starsAwarded: 0, justCompleted: false, error: null };
    }

    let completion: HabitCompletionRow | null = null;
    if (existing) {
      const { data, error } = await supabase
        .from('habit_completions')
        .update({ count: currentCount + 1 })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .eq('count', currentCount) // compare-and-swap
        .select('*')
        .maybeSingle();
      if (error) return { data: null, starsAwarded: 0, justCompleted: false, error: toErr(error) };
      if (!data) continue; // changed concurrently (or deleted) — re-read and retry
      completion = data as HabitCompletionRow;
    } else {
      const { data, error } = await supabase
        .from('habit_completions')
        .insert({ user_id: userId, habit_id: habitId, date: today, count: 1 })
        .select('*')
        .maybeSingle();
      if (error) {
        if (isUniqueViolation(error)) continue; // created concurrently — retry as update
        return { data: null, starsAwarded: 0, justCompleted: false, error: toErr(error) };
      }
      if (!data) continue;
      completion = data as HabitCompletionRow;
    }

    // Award 1 star only when reaching the target (not on every increment)
    const justCompleted = completion.count >= target && currentCount < target;
    let starsAwarded = 0;
    if (justCompleted) {
      const awarded = await awardStars(userId, 1, 'habit_completion', `habit_${habitId}_${today}`);
      if (awarded) starsAwarded = 1;
    }
    return { data: completion, starsAwarded, justCompleted, error: null };
  }

  return {
    data: null,
    starsAwarded: 0,
    justCompleted: false,
    error: 'Не удалось сохранить выполнение. Обновите страницу и попробуйте ещё раз.',
  };
}

/**
 * Reset completion for today — delete the row, then roll back the star.
 * The completion is deleted first: if that fails nothing has changed; if the star
 * revoke fails afterwards, re-completing cannot award a second star (dedup by key).
 */
export async function resetCompletion(
  userId: string,
  habitId: string,
): Promise<{ error: string | null }> {
  const today = getTodayStr();

  const { data: existing, error: selectError } = await supabase
    .from('habit_completions')
    .select('id')
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .eq('date', today)
    .maybeSingle();

  if (selectError) return { error: toErr(selectError) };
  if (!existing) return { error: null };

  const { error } = await supabase
    .from('habit_completions')
    .delete()
    .eq('id', (existing as { id: string }).id)
    .eq('user_id', userId);
  if (error) return { error: toErr(error) };

  await revokeStars(userId, `habit_${habitId}_${today}`);
  return { error: null };
}

// ─── Stars ────────────────────────────────────────────────────────────────────

export interface StarsSummary {
  today: number;
  week: number;
  total: number;
}

/**
 * Sums ledger rows into today / last 7 days / total. `created_at` is a UTC timestamptz,
 * so it is converted to the user's LOCAL date before comparing with "today".
 */
export function summarizeStars(
  rows: { delta: number | null; created_at: string | null }[],
  now: Date = new Date(),
): StarsSummary {
  const todayStr = toLocalDateStr(now);
  const weekStartStr = toLocalDateStr(addLocalDays(now, -6));
  let today = 0;
  let week = 0;
  let total = 0;
  for (const r of rows) {
    const delta = Number(r.delta ?? 0);
    if (!Number.isFinite(delta)) continue;
    total += delta;
    if (!r.created_at) continue;
    const at = new Date(r.created_at);
    if (Number.isNaN(at.getTime())) continue;
    const day = toLocalDateStr(at);
    if (day === todayStr) today += delta;
    if (day >= weekStartStr && day <= todayStr) week += delta;
  }
  return { today, week, total };
}

/** Throws on a failed read so React Query keeps the last good value instead of zeros. */
export async function getStarsSummary(userId: string): Promise<StarsSummary> {
  const { data, error } = await supabase
    .from('stars_ledger')
    .select('delta, created_at')
    .eq('target_user_id', userId);

  if (error) throw new Error(toErr(error));
  return summarizeStars((data ?? []) as { delta: number | null; created_at: string | null }[]);
}
