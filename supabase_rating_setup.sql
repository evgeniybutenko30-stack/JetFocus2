-- ============================================================
-- Rating Module — Supabase Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add stars_balance to user_profiles (if not exists)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS stars_balance integer NOT NULL DEFAULT 0;

-- 2. Referrals table
CREATE TABLE IF NOT EXISTS public.referrals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inviter_id, invited_id)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON public.referrals (inviter_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_invited ON public.referrals (invited_id);

-- 3. posts table (if not exists)
CREATE TABLE IF NOT EXISTS public.posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts (user_id, created_at DESC);

-- 4. post_likes table (if not exists)
CREATE TABLE IF NOT EXISTS public.post_likes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON public.post_likes (user_id);

-- ============================================================
-- RLS Policies
-- ============================================================

-- user_profiles: public read, own write
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON public.user_profiles;
CREATE POLICY "profiles_select_all"
  ON public.user_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.user_profiles;
CREATE POLICY "profiles_insert_own"
  ON public.user_profiles FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.user_profiles;
CREATE POLICY "profiles_update_own"
  ON public.user_profiles FOR UPDATE USING (user_id = auth.uid());

-- referrals: users see their own referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals_select_own" ON public.referrals;
CREATE POLICY "referrals_select_own"
  ON public.referrals FOR SELECT USING (
    inviter_id = auth.uid() OR invited_id = auth.uid()
  );

DROP POLICY IF EXISTS "referrals_insert_own" ON public.referrals;
CREATE POLICY "referrals_insert_own"
  ON public.referrals FOR INSERT WITH CHECK (inviter_id = auth.uid());

-- posts: public read, own write/delete
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_all" ON public.posts;
CREATE POLICY "posts_select_all"
  ON public.posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own"
  ON public.posts FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own"
  ON public.posts FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own"
  ON public.posts FOR DELETE USING (user_id = auth.uid());

-- post_likes: authenticated users can see all likes and manage own
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_likes_select_all" ON public.post_likes;
CREATE POLICY "post_likes_select_all"
  ON public.post_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "post_likes_insert_own" ON public.post_likes;
CREATE POLICY "post_likes_insert_own"
  ON public.post_likes FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "post_likes_delete_own" ON public.post_likes;
CREATE POLICY "post_likes_delete_own"
  ON public.post_likes FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- Trigger: sync stars_ledger sum → user_profiles.stars_balance
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_stars_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.user_profiles
  SET stars_balance = (
    SELECT COALESCE(SUM(stars), 0)
    FROM public.stars_ledger
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
  )
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_stars_balance ON public.stars_ledger;
CREATE TRIGGER trg_sync_stars_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.stars_ledger
  FOR EACH ROW EXECUTE FUNCTION public.sync_stars_balance();

-- ============================================================
-- Done! Refresh Supabase schema cache after running this.
-- ============================================================
