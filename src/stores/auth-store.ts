import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { applyXp, defaultDisplayName, isSameAuthUser, translateAuthError } from '@/lib/auth-utils';

interface ProfileFields {
  displayName: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  stars: number;
  streak: number;
  referralCode: string | null;
}

export interface ProfileUpdate {
  display_name?: string;
  avatar_url?: string | null;
  bio?: string;
  city?: string;
  status?: string;
  interests?: string[];
}

interface AuthState extends ProfileFields {
  session: Session | null;
  user: SupabaseUser | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  /** Ends the initial "checking session" state without touching the session (safety net). */
  finishLoading: () => void;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
  loadProfile: () => Promise<void>;
  updateProfile: (data: ProfileUpdate) => Promise<{ error: string | null }>;
  addXP: (amount: number) => void;
  addStars: (amount: number) => void;
}

interface ProfileRow {
  display_name?: string | null;
  avatar_url?: string | null;
  stars_balance?: number | null;
}

interface StatsRow {
  current_streak?: number | null;
}

interface ReferralRow {
  code?: string | null;
}

const GUEST_PROFILE: ProfileFields = {
  displayName: 'Гость',
  avatarUrl: null,
  level: 1,
  xp: 0,
  stars: 0,
  streak: 0,
  referralCode: null,
};

/**
 * Monotonic id of the latest profile load. Bumped on every load, sign-out and
 * account switch so that a slow response for an old request (or a previous
 * user) can never overwrite newer state.
 */
let profileRequestSeq = 0;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isLoading: true,
  ...GUEST_PROFILE,

  setSession: (session) => {
    const prevUser = get().user;
    const nextUser = session?.user ?? null;

    if (!nextUser) {
      // Signed out / session expired: never keep showing the previous user's data.
      profileRequestSeq++;
      set({ session: null, user: null, isLoading: false, ...GUEST_PROFILE });
      return;
    }

    if (prevUser && prevUser.id === nextUser.id) {
      // Same account (token refresh, duplicate INITIAL_SESSION/getSession, tab focus):
      // keep the existing user reference when nothing changed and don't reload the profile.
      set({ session, user: isSameAuthUser(prevUser, nextUser) ? prevUser : nextUser, isLoading: false });
      return;
    }

    // New sign-in or account switch: reset profile data of the previous account first.
    profileRequestSeq++;
    set({
      session,
      user: nextUser,
      isLoading: false,
      ...GUEST_PROFILE,
      displayName: defaultDisplayName(nextUser.email),
    });
    // Supabase recommends not calling other Supabase methods synchronously from
    // inside an onAuthStateChange callback (it can dead-lock) — defer the load.
    setTimeout(() => {
      void get().loadProfile();
    }, 0);
  },

  finishLoading: () => {
    if (get().isLoading) set({ isLoading: false });
  },

  signUp: async (email, password) => {
    const cleanEmail = email.trim();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    });
    if (error) return { error: translateAuthError(error.message) };
    if (data.user && !data.session) {
      return { error: null, needsConfirmation: true };
    }
    if (data.user) {
      const { error: upsertError } = await supabase.from('user_profiles').upsert(
        {
          user_id: data.user.id,
          display_name: defaultDisplayName(cleanEmail),
        },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
      // The DB trigger normally creates the profile row; this is only a fallback.
      if (upsertError) console.warn('[auth] profile upsert after sign-up failed:', upsertError.message);
      void get().loadProfile();
    }
    return { error: null };
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: translateAuthError(error.message) };
    const signedInUser = data.user;
    if (signedInUser) {
      // Post-login bookkeeping must not delay (or fail) the login itself.
      void (async () => {
        try {
          const { error: upsertError } = await supabase.from('user_profiles').upsert(
            {
              user_id: signedInUser.id,
              display_name: defaultDisplayName(signedInUser.email),
            },
            { onConflict: 'user_id', ignoreDuplicates: true },
          );
          if (upsertError) console.warn('[auth] profile upsert after sign-in failed:', upsertError.message);

          // Record daily activity for streak. The RPC is optional (may not be deployed);
          // supabase-js reports failures via `error`, which is intentionally not fatal here.
          await supabase.rpc('record_daily_active');
        } catch (err) {
          console.warn('[auth] post sign-in bookkeeping failed:', err);
        }
        await get().loadProfile();
      })();
    }
    return { error: null };
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Supabase keeps the local session when the request fails (e.g. offline);
      // report it instead of pretending the user is signed out.
      return { error: translateAuthError(error.message) };
    }
    profileRequestSeq++;
    set({ session: null, user: null, ...GUEST_PROFILE });
    return { error: null };
  },

  loadProfile: async () => {
    const { user } = get();
    if (!user) return;
    const requestId = ++profileRequestSeq;

    try {
      // Profile always exists; stats and referral tables may be missing (errors are tolerated).
      const [profileRes, statsRes, refRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('referral_codes').select('code').eq('user_id', user.id).maybeSingle(),
      ]);

      // A newer load, a sign-out or an account switch happened meanwhile: drop this result.
      if (requestId !== profileRequestSeq || get().user?.id !== user.id) return;

      const updates: Partial<ProfileFields> = {};
      const profile = profileRes.data as ProfileRow | null;
      if (profile) {
        updates.displayName = profile.display_name || defaultDisplayName(user.email);
        updates.avatarUrl = profile.avatar_url ?? null;
        // IMPORTANT: stars come from user_profiles.stars_balance (synced by trigger), NOT user_stats
        updates.stars = profile.stars_balance ?? 0;
      } else if (profileRes.error) {
        console.warn('[auth] failed to load profile:', profileRes.error.message);
      }

      const stats = statsRes.data as StatsRow | null;
      if (stats) updates.streak = stats.current_streak ?? 0;

      if (!refRes.error) {
        updates.referralCode = (refRes.data as ReferralRow | null)?.code ?? null;
      }

      set(updates);
    } catch (err) {
      console.warn('[auth] failed to load profile:', err);
    }
  },

  updateProfile: async (data) => {
    const { user } = get();
    if (!user) return { error: 'Войдите в аккаунт' };
    const { error } = await supabase.from('user_profiles').update(data).eq('user_id', user.id);
    if (error) return { error: error.message };
    // The user may have signed out / switched accounts while the request was in flight.
    if (get().user?.id !== user.id) return { error: null };
    const patch: Partial<ProfileFields> = {};
    if (data.display_name !== undefined) patch.displayName = data.display_name || defaultDisplayName(user.email);
    if (data.avatar_url !== undefined) patch.avatarUrl = data.avatar_url ?? null;
    set(patch);
    return { error: null };
  },

  addXP: (amount) => {
    set((state) => applyXp(state.level, state.xp, amount));
  },

  addStars: (amount) =>
    set((state) => ({ stars: state.stars + (Number.isFinite(amount) ? amount : 0) })),
}));
