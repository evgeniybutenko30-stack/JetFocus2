import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';

/**
 * Returns true if the current user has full access (PRO or admin/owner role).
 * Owners and admins always bypass PRO gates.
 */
export function useFullAccess() {
  const user = useAuthStore((s) => s.user);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasAccess(false);
      setIsPro(false);
      setIsAdmin(false);
      return;
    }

    Promise.all([
      supabase
        .from('user_profiles')
        .select('is_pro')
        .eq('user_id', user.id)
        .single(),
      supabase.rpc('get_user_role', { _user_id: user.id }),
    ]).then(([profileRes, roleRes]) => {
      const pro = !!(profileRes.data as { is_pro?: boolean } | null)?.is_pro;
      const role = roleRes.data as string | null;
      const admin = role === 'owner' || role === 'admin' || role === 'support' || role === 'content' || role === 'analyst';
      setIsPro(pro);
      setIsAdmin(admin);
      setHasAccess(pro || admin);
    });
  }, [user]);

  return { hasAccess, isPro, isAdmin };
}
