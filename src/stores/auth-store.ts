import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: SupabaseUser | null;
  isLoading: boolean;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  stars: number;
  streak: number;
  referralCode: string | null;
  setSession: (session: Session | null) => void;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<void>;
  updateProfile: (data: { display_name?: string; avatar_url?: string }) => Promise<void>;
  addXP: (amount: number) => void;
  addStars: (amount: number) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isLoading: true,
  displayName: 'Гость',
  avatarUrl: null,
  level: 1,
  xp: 0,
  stars: 0,
  streak: 0,
  referralCode: null,

  setSession: (session) => {
    set({ session, user: session?.user ?? null, isLoading: false });
    if (session?.user) {
      get().loadProfile();
    }
  },

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };
    if (data.user && !data.session) {
      return { error: null, needsConfirmation: true };
    }
    if (data.user) {
      await supabase.from('user_profiles').upsert({
        user_id: data.user.id,
        display_name: email.split('@')[0],
      }, { onConflict: 'user_id' });
    }
    return { error: null };
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      await supabase.from('user_profiles').upsert({
        user_id: data.user.id,
        display_name: data.user.email?.split('@')[0] ?? 'Пользователь',
      }, { onConflict: 'user_id', ignoreDuplicates: true });

      // Record daily activity for streak
      try {
        await supabase.rpc('record_daily_active');
      } catch {
        // silent — function may not exist yet
      }

      get().loadProfile();
    }
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, displayName: 'Гость', avatarUrl: null, stars: 0, streak: 0, referralCode: null });
  },

  loadProfile: async () => {
    const { user } = get();
    if (!user) return;

    // Load profile (always exists), stats and referral code (may not exist)
    const profileRes = await supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle();

    const updates: Partial<AuthState> = {};
    const profile = profileRes.data;

    if (profile) {
      updates.displayName = profile.display_name ?? user.email?.split('@')[0] ?? 'Пользователь';
      updates.avatarUrl = profile.avatar_url ?? null;
      updates.stars = (profile as any).stars_balance ?? 0;
    }

    // Try loading stats (table may not exist)
    // IMPORTANT: stars come from user_profiles.stars_balance (synced by trigger), NOT user_stats
    try {
      const { data: stats } = await supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle();
      if (stats) {
        updates.streak = (stats as any).current_streak ?? 0;
      }
    } catch { /* table may not exist */ }

    // Try loading referral code
    try {
      const { data: refData } = await supabase.from('referral_codes').select('code').eq('user_id', user.id).maybeSingle();
      updates.referralCode = (refData as any)?.code ?? null;
    } catch { /* table may not exist */ }

    set(updates as any);
  },

  updateProfile: async (data) => {
    const { user } = get();
    if (!user) return;
    await supabase.from('user_profiles').update(data).eq('user_id', user.id);
    if (data.display_name) set({ displayName: data.display_name });
    if (data.avatar_url !== undefined) set({ avatarUrl: data.avatar_url });
  },

  addXP: (amount) => {
    set((state) => {
      let xp = state.xp + amount;
      let level = state.level;
      const xpForLevel = (l: number) => l * 100;
      while (xp >= xpForLevel(level)) {
        xp -= xpForLevel(level);
        level++;
      }
      return { xp, level };
    });
  },

  addStars: (amount) => set((state) => ({ stars: state.stars + amount })),
}));
