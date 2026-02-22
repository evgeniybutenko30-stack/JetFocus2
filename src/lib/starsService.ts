/**
 * Stars Service — единый слой начисления ⭐ с защитой от дублей.
 * Все начисления проходят через этот файл.
 */
import { supabase } from '@/lib/supabase';

/**
 * Award stars to a user with deduplication.
 * @param userId - target user id
 * @param delta - number of stars (+/-)
 * @param source - category (e.g. 'habit_completion', 'task_completion', 'goal_step', 'milestone', 'goal_complete', 'finance_goal', 'referral')
 * @param sourceKey - unique key for dedup (e.g. 'habit_abc_2026-02-21')
 * @returns true if stars were actually awarded (not a duplicate)
 */
export async function awardStars(
  userId: string,
  delta: number,
  source: string,
  sourceKey: string,
): Promise<boolean> {
  if (!userId || delta === 0) return false;

  // Check for duplicate
  const { data: existing } = await supabase
    .from('stars_ledger')
    .select('id')
    .eq('target_user_id', userId)
    .eq('reason', sourceKey)
    .maybeSingle();

  if (existing) return false; // already awarded

  const { error } = await supabase.from('stars_ledger').insert({
    target_user_id: userId,
    delta,
    source,
    reason: sourceKey,
  });

  if (error) {
    console.error('awardStars error:', error);
    return false;
  }

  return true;
}

/**
 * Revoke stars by sourceKey (for undo/reset scenarios).
 */
export async function revokeStars(
  userId: string,
  sourceKey: string,
): Promise<void> {
  await supabase
    .from('stars_ledger')
    .delete()
    .eq('target_user_id', userId)
    .eq('reason', sourceKey);
}
