import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { isAdminRole } from '@/lib/adminService';

interface AccessState {
  /** User the state belongs to; a result for another account is never shown. */
  userId: string | null;
  hasAccess: boolean | null;
  isPro: boolean;
  isAdmin: boolean;
  /** True when the access check failed (access is then denied, not left loading). */
  error: boolean;
}

const LOADING: Omit<AccessState, 'userId'> = { hasAccess: null, isPro: false, isAdmin: false, error: false };

/**
 * Combines the PRO flag and the staff role into the access decision.
 * A failed request counts as "no" for that half; the result is never left pending.
 */
export function resolveFullAccess(
  profile: { data: { is_pro?: boolean | null } | null; error: unknown } | null,
  role: { data: unknown; error: unknown } | null,
): Omit<AccessState, 'userId'> {
  const pro = !!profile && !profile.error && !!profile.data?.is_pro;
  const admin = !!role && !role.error && isAdminRole(role.data);
  const error = !profile || !!profile.error || !role || !!role.error;
  return { hasAccess: pro || admin, isPro: pro, isAdmin: admin, error };
}

/**
 * Returns true if the current user has full access (PRO or admin/owner role).
 * Owners and admins always bypass PRO gates.
 */
export function useFullAccess() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [state, setState] = useState<AccessState>({ userId: null, ...LOADING });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState({ userId, ...LOADING });

    Promise.allSettled([
      supabase
        .from('user_profiles')
        .select('is_pro')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase.rpc('get_user_role', { _user_id: userId }),
    ]).then(([profileRes, roleRes]) => {
      if (cancelled) return;
      const next = resolveFullAccess(
        profileRes.status === 'fulfilled'
          ? { data: profileRes.value.data as { is_pro?: boolean | null } | null, error: profileRes.value.error }
          : null,
        roleRes.status === 'fulfilled' ? { data: roleRes.value.data, error: roleRes.value.error } : null,
      );
      if (next.error) console.warn('[full-access] access check failed; PRO features stay locked');
      setState({ userId, ...next });
    });

    return () => { cancelled = true; };
  }, [userId]);

  if (!userId) return { hasAccess: false, isPro: false, isAdmin: false, error: false };
  // Until the check for the current account finishes, report "loading".
  if (state.userId !== userId) return { ...LOADING };
  return { hasAccess: state.hasAccess, isPro: state.isPro, isAdmin: state.isAdmin, error: state.error };
}
