/** Pure helpers for the «Лента» (Social) page: like counters and optimistic like toggling. */

export interface LikeState {
  /** Likes per post id. */
  counts: Record<string, number>;
  /** Post ids the current user has liked. */
  likedByMe: Set<string>;
}

export function emptyLikeState(): LikeState {
  return { counts: {}, likedByMe: new Set() };
}

/** Builds counters from `post_likes` rows (one row per user and post). */
export function summarizeLikes(
  rows: readonly { post_id?: string | null; user_id?: string | null }[] | null | undefined,
  currentUserId: string | null | undefined,
): LikeState {
  const state = emptyLikeState();
  const seen = new Set<string>();
  (rows ?? []).forEach(r => {
    if (!r.post_id || !r.user_id) return;
    const key = `${r.post_id}|${r.user_id}`;
    if (seen.has(key)) return; // defensive: never count the same user twice
    seen.add(key);
    state.counts[r.post_id] = (state.counts[r.post_id] ?? 0) + 1;
    if (currentUserId && r.user_id === currentUserId) state.likedByMe.add(r.post_id);
  });
  return state;
}

/** New state with the current user's like on `postId` set to `liked` (idempotent, never negative). */
export function setMyLike(state: LikeState, postId: string, liked: boolean): LikeState {
  const had = state.likedByMe.has(postId);
  if (had === liked) return state;
  const likedByMe = new Set(state.likedByMe);
  if (liked) likedByMe.add(postId);
  else likedByMe.delete(postId);
  const current = state.counts[postId] ?? 0;
  return {
    counts: { ...state.counts, [postId]: Math.max(0, current + (liked ? 1 : -1)) },
    likedByMe,
  };
}

/** Postgres unique_violation: the like already exists (double click / second tab). */
export const UNIQUE_VIOLATION = '23505';
