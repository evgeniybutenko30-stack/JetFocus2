/**
 * Pure helpers for the «Рейтинг» page: period boundaries, aggregation of referrals / likes
 * and a deterministic, tie-aware ranking. Nothing here touches Supabase or the DOM.
 */

export type RatingSortMode = 'stars' | 'referrals';
export type RatingPeriod = 'all' | 'year' | 'month';

export interface RatingEntry {
  id: string;
  display_name: string;
  avatar_url: string | null;
  stars_balance: number;
  referrals_count: number;
  likes_count: number;
}

export type RankedEntry<T extends RatingEntry = RatingEntry> = T & {
  /** Competition rank ("1224"): users with the same value share a place. */
  rank: number;
};

/** ISO timestamp the period starts at (`created_at >= …`), or null for «За всё время». */
export function ratingPeriodStart(period: RatingPeriod, now: Date = new Date()): string | null {
  if (period === 'all') return null;
  const d = new Date(now.getTime());
  if (period === 'month') d.setDate(d.getDate() - 30);
  else d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

function finiteNonNegative(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function ratingValue(u: Pick<RatingEntry, 'stars_balance' | 'referrals_count'>, mode: RatingSortMode): number {
  return mode === 'stars' ? finiteNonNegative(u.stars_balance) : finiteNonNegative(u.referrals_count);
}

/**
 * Sorted copy of `users` with a competition rank. Order inside a tie is deterministic
 * (other metric, likes, name, id) so the list does not reshuffle between loads.
 */
export function rankUsers<T extends RatingEntry>(users: readonly T[], mode: RatingSortMode): RankedEntry<T>[] {
  const other: RatingSortMode = mode === 'stars' ? 'referrals' : 'stars';
  const sorted = [...users].sort((a, b) =>
    ratingValue(b, mode) - ratingValue(a, mode)
    || ratingValue(b, other) - ratingValue(a, other)
    || finiteNonNegative(b.likes_count) - finiteNonNegative(a.likes_count)
    || a.display_name.localeCompare(b.display_name, 'ru')
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  let prevValue: number | null = null;
  let prevRank = 0;
  return sorted.map((u, i) => {
    const value = ratingValue(u, mode);
    const rank = prevValue !== null && value === prevValue ? prevRank : i + 1;
    prevValue = value;
    prevRank = rank;
    return { ...u, rank };
  });
}

/** Number of rows per value of `key` (e.g. confirmed referrals per inviter). */
export function countBy<K extends string>(rows: readonly Partial<Record<K, unknown>>[] | null | undefined, key: K): Record<string, number> {
  const counts: Record<string, number> = {};
  (rows ?? []).forEach(r => {
    const id = r[key];
    if (typeof id === 'string' && id) counts[id] = (counts[id] ?? 0) + 1;
  });
  return counts;
}

type JoinedPost = { user_id?: string | null } | { user_id?: string | null }[] | null | undefined;

/** Likes received per post author, from `post_likes` rows joined with `posts(user_id)`. */
export function countLikesByAuthor(rows: readonly { posts?: JoinedPost }[] | null | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  (rows ?? []).forEach(l => {
    const post = Array.isArray(l.posts) ? l.posts[0] : l.posts;
    const uid = post?.user_id;
    if (typeof uid === 'string' && uid) counts[uid] = (counts[uid] ?? 0) + 1;
  });
  return counts;
}
