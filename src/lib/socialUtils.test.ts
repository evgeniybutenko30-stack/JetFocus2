import { describe, expect, it } from 'vitest';
import { emptyLikeState, setMyLike, summarizeLikes } from './socialUtils';

describe('summarizeLikes', () => {
  it('counts likes per post and marks the current user', () => {
    const state = summarizeLikes([
      { post_id: 'p1', user_id: 'me' },
      { post_id: 'p1', user_id: 'other' },
      { post_id: 'p2', user_id: 'other' },
    ], 'me');
    expect(state.counts).toEqual({ p1: 2, p2: 1 });
    expect([...state.likedByMe]).toEqual(['p1']);
  });

  it('ignores duplicate / incomplete rows and works for guests', () => {
    const state = summarizeLikes([
      { post_id: 'p1', user_id: 'a' },
      { post_id: 'p1', user_id: 'a' },
      { post_id: null, user_id: 'a' },
      { post_id: 'p2', user_id: null },
    ], null);
    expect(state.counts).toEqual({ p1: 1 });
    expect(state.likedByMe.size).toBe(0);
    expect(summarizeLikes(undefined, 'me').counts).toEqual({});
  });
});

describe('setMyLike', () => {
  it('likes and unlikes without mutating the previous state', () => {
    const initial = summarizeLikes([{ post_id: 'p1', user_id: 'other' }], 'me');
    const liked = setMyLike(initial, 'p1', true);
    expect(liked.counts.p1).toBe(2);
    expect(liked.likedByMe.has('p1')).toBe(true);
    expect(initial.counts.p1).toBe(1);
    expect(initial.likedByMe.has('p1')).toBe(false);

    const unliked = setMyLike(liked, 'p1', false);
    expect(unliked.counts.p1).toBe(1);
    expect(unliked.likedByMe.has('p1')).toBe(false);
  });

  it('is idempotent (double click / rollback cannot double count) and never negative', () => {
    const once = setMyLike(emptyLikeState(), 'p1', true);
    expect(setMyLike(once, 'p1', true)).toBe(once);
    expect(setMyLike(emptyLikeState(), 'p1', false).counts.p1 ?? 0).toBe(0);

    const inconsistent = { counts: { p1: 0 }, likedByMe: new Set(['p1']) };
    expect(setMyLike(inconsistent, 'p1', false).counts.p1).toBe(0);
  });
});
