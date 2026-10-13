import { describe, expect, it } from 'vitest';
import { countBy, countLikesByAuthor, rankUsers, ratingPeriodStart, ratingValue, type RatingEntry } from './ratingUtils';

function entry(id: string, stars: number, referrals = 0, likes = 0, name = id): RatingEntry {
  return { id, display_name: name, avatar_url: null, stars_balance: stars, referrals_count: referrals, likes_count: likes };
}

describe('rankUsers', () => {
  it('sorts by the selected metric and shares the place on ties (competition ranking)', () => {
    const ranked = rankUsers([entry('a', 10), entry('b', 30), entry('c', 30), entry('d', 5)], 'stars');
    expect(ranked.map(u => [u.id, u.rank])).toEqual([['b', 1], ['c', 1], ['a', 3], ['d', 4]]);
  });

  it('orders inside a tie deterministically: other metric, likes, then name', () => {
    const users = [
      entry('x', 10, 0, 0, 'Яна'),
      entry('y', 10, 0, 0, 'Анна'),
      entry('z', 10, 2, 0, 'Борис'),
      entry('w', 10, 0, 5, 'Вера'),
    ];
    const ids = rankUsers(users, 'stars').map(u => u.id);
    expect(ids).toEqual(['z', 'w', 'y', 'x']);
    // Same result regardless of input order.
    expect(rankUsers([...users].reverse(), 'stars').map(u => u.id)).toEqual(ids);
    expect(rankUsers(users, 'stars').every(u => u.rank === 1)).toBe(true);
  });

  it('ranks by referrals in referral mode', () => {
    const ranked = rankUsers([entry('a', 100, 1), entry('b', 0, 3)], 'referrals');
    expect(ranked.map(u => u.id)).toEqual(['b', 'a']);
    expect(ranked[0].rank).toBe(1);
    expect(ratingValue(ranked[0], 'referrals')).toBe(3);
  });

  it('treats corrupt / negative values as 0 and does not mutate the input', () => {
    const input = [entry('a', Number.NaN), entry('b', -5), entry('c', 1)];
    const ranked = rankUsers(input, 'stars');
    expect(ranked.map(u => [u.id, u.rank])).toEqual([['c', 1], ['a', 2], ['b', 2]]);
    expect(input.map(u => u.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty list', () => {
    expect(rankUsers([], 'stars')).toEqual([]);
  });
});

describe('aggregation helpers', () => {
  it('countBy counts rows per key and skips empty ids', () => {
    expect(countBy([{ inviter_id: 'a' }, { inviter_id: 'a' }, { inviter_id: 'b' }, { inviter_id: null }, {}], 'inviter_id'))
      .toEqual({ a: 2, b: 1 });
    expect(countBy(null, 'inviter_id')).toEqual({});
  });

  it('countLikesByAuthor accepts object and array joins', () => {
    expect(countLikesByAuthor([
      { posts: { user_id: 'a' } },
      { posts: [{ user_id: 'a' }] },
      { posts: { user_id: 'b' } },
      { posts: null },
      { posts: [] },
    ])).toEqual({ a: 2, b: 1 });
  });
});

describe('ratingPeriodStart', () => {
  const now = new Date(2026, 9, 13, 12, 0, 0);

  it('returns null for all time', () => {
    expect(ratingPeriodStart('all', now)).toBeNull();
  });

  it('goes back 30 days / 1 year', () => {
    expect(new Date(ratingPeriodStart('month', now) as string).getTime()).toBe(new Date(2026, 8, 13, 12, 0, 0).getTime());
    expect(new Date(ratingPeriodStart('year', now) as string).getTime()).toBe(new Date(2025, 9, 13, 12, 0, 0).getTime());
  });
});
