/**
 * Stars Service — единый слой начисления ⭐ с защитой от дублей.
 * Все начисления проходят через этот файл.
 *
 * The client writes stars_ledger rows directly; the database guard
 * (jf_guard_stars_ledger in supabase/migrations/20261013_security_hardening.sql) only
 * accepts own rows from whitelisted sources, caps the amount per source, requires a
 * reason (the de-duplication key, 1–200 chars) and rejects a repeated key with 23505.
 * The checks below mirror those rules so invalid awards never hit the network.
 *
 * Neither function throws: callers run them after the main write already succeeded.
 */
import { supabase } from '@/lib/supabase';

/** Sources a user may self-award and the max stars per award (same as the DB guard). */
export const STARS_SOURCE_MAX: Readonly<Record<string, number>> = {
  habit_completion: 20,
  task_completion: 20,
  goal_step: 20,
  goal_complete: 50,
  finance_goal: 100,
  milestone: 1000,
};

export const STARS_KEY_MAX_LENGTH = 200;

/** Returns why an award would be rejected, or null when it is valid. */
export function validateStarsAward(delta: number, source: string, sourceKey: string): string | null {
  const max = STARS_SOURCE_MAX[source];
  if (max === undefined) return `unknown stars source "${source}"`;
  if (!Number.isInteger(delta) || delta < 1 || delta > max) {
    return `invalid stars amount ${delta} for source ${source} (1..${max})`;
  }
  const key = sourceKey ?? '';
  if (!key.trim() || key.length > STARS_KEY_MAX_LENGTH) {
    return `invalid award key (1..${STARS_KEY_MAX_LENGTH} chars)`;
  }
  return null;
}

/** Postgres unique_violation: the DB guard reports an already used award key this way. */
export function isDuplicateAwardError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505';
}

/**
 * Award stars to a user with deduplication.
 * @param userId - target user id (must be the signed-in user)
 * @param delta - number of stars (positive integer within the source cap)
 * @param source - category: 'habit_completion' | 'task_completion' | 'goal_step' | 'goal_complete' | 'finance_goal' | 'milestone'
 * @param sourceKey - unique key for dedup (e.g. 'habit_abc_2026-02-21')
 * @returns true if stars were actually awarded; false for a duplicate, an invalid award or an error
 */
export async function awardStars(
  userId: string,
  delta: number,
  source: string,
  sourceKey: string,
): Promise<boolean> {
  if (!userId || delta === 0) return false;

  const invalid = validateStarsAward(delta, source, sourceKey);
  if (invalid) {
    console.warn('awardStars skipped:', invalid);
    return false;
  }

  try {
    // Fast path for the common "already awarded" case. limit(1) instead of maybeSingle():
    // with legacy duplicate rows maybeSingle() errors and returned data=null, which used
    // to insert yet another duplicate.
    const { data: existing, error: selectError } = await supabase
      .from('stars_ledger')
      .select('id')
      .eq('target_user_id', userId)
      .eq('reason', sourceKey)
      .limit(1);

    if (selectError) {
      console.error('awardStars check error:', selectError);
      return false;
    }
    if (existing && existing.length > 0) return false; // already awarded

    const { error } = await supabase.from('stars_ledger').insert({
      target_user_id: userId,
      delta,
      source,
      reason: sourceKey,
    });

    if (error) {
      // A concurrent award with the same key won the race — not an error.
      if (isDuplicateAwardError(error)) return false;
      console.error('awardStars error:', error);
      return false;
    }

    return true;
  } catch (e) {
    console.error('awardStars failed:', e);
    return false;
  }
}

/**
 * Revoke stars by sourceKey (for undo/reset scenarios).
 * @returns true when the delete request succeeded (also when there was nothing to revoke).
 */
export async function revokeStars(
  userId: string,
  sourceKey: string,
): Promise<boolean> {
  if (!userId || !sourceKey) return false;
  try {
    const { error } = await supabase
      .from('stars_ledger')
      .delete()
      .eq('target_user_id', userId)
      .eq('reason', sourceKey);
    if (error) {
      console.error('revokeStars error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('revokeStars failed:', e);
    return false;
  }
}
