-- Run this SQL in your Supabase Dashboard > SQL Editor

-- 1. user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select" ON public.user_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_profiles_insert" ON public.user_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_profiles_update" ON public.user_profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "user_profiles_delete" ON public.user_profiles
  FOR DELETE USING (user_id = auth.uid());

-- 2. user_data_sanity table (persistence test)
CREATE TABLE IF NOT EXISTS public.user_data_sanity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_data_sanity_user_id ON public.user_data_sanity(user_id);

ALTER TABLE public.user_data_sanity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_data_sanity_select" ON public.user_data_sanity
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_data_sanity_insert" ON public.user_data_sanity
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_data_sanity_update" ON public.user_data_sanity
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "user_data_sanity_delete" ON public.user_data_sanity
  FOR DELETE USING (user_id = auth.uid());

-- 3. Auto-create profile on signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name)
  VALUES (NEW.id, split_part(NEW.email, '@', 1))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
