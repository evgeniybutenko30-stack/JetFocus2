-- ============================================================
-- ПОЛНАЯ НАСТРОЙКА БД — запусти ВСЁ в Supabase SQL Editor
-- ============================================================

-- ── 1. user_profiles ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_select" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_update" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_delete" ON public.user_profiles;

CREATE POLICY "user_profiles_select" ON public.user_profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_profiles_insert" ON public.user_profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_profiles_update" ON public.user_profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "user_profiles_delete" ON public.user_profiles FOR DELETE USING (user_id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ── 2. goals ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  sphere        text NOT NULL,
  type          text NOT NULL DEFAULT 'milestone_based',
  status        text NOT NULL DEFAULT 'active',
  priority      int  NOT NULL DEFAULT 3,
  progress_mode text NOT NULL DEFAULT 'milestones',
  start_value   numeric NOT NULL DEFAULT 0,
  target_value  numeric NOT NULL DEFAULT 100,
  current_value numeric NOT NULL DEFAULT 0,
  progress      int  NOT NULL DEFAULT 0,
  start_date    date,
  target_date   date,
  deadline      date,
  is_pinned     boolean NOT NULL DEFAULT false,
  is_achieved   boolean NOT NULL DEFAULT false,
  visibility    text NOT NULL DEFAULT 'private',
  budget        bigint,
  milestones    jsonb NOT NULL DEFAULT '[]',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_own" ON public.goals;
CREATE POLICY "goals_own" ON public.goals
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. goal_milestones ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goal_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  due_date      date,
  order_index   int  NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'todo',
  reward_points int  NOT NULL DEFAULT 50,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goal_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goal_milestones_own" ON public.goal_milestones;
CREATE POLICY "goal_milestones_own" ON public.goal_milestones
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 4. goal_actions (шаги) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goal_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id           uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_id      uuid REFERENCES public.goal_milestones(id) ON DELETE SET NULL,
  title             text NOT NULL,
  type              text NOT NULL DEFAULT 'one_time',
  due_date          date,
  estimated_minutes int,
  status            text NOT NULL DEFAULT 'todo',
  impact            int  NOT NULL DEFAULT 5,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goal_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goal_actions_own" ON public.goal_actions;
CREATE POLICY "goal_actions_own" ON public.goal_actions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 5. goal_progress_logs ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goal_progress_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  delta_value numeric NOT NULL DEFAULT 0,
  source_type text NOT NULL DEFAULT 'manual',
  source_id   uuid,
  note        text,
  mood        int,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goal_progress_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goal_progress_logs_own" ON public.goal_progress_logs;
CREATE POLICY "goal_progress_logs_own" ON public.goal_progress_logs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 6. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_goals_user_id        ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON public.goal_milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_actions_goal    ON public.goal_actions(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_logs_goal       ON public.goal_progress_logs(goal_id);

-- ── 7. auto updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS goals_updated_at ON public.goals;
CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 8. Вставить профиль для уже существующих пользователей ───
INSERT INTO public.user_profiles (user_id, display_name)
SELECT id, split_part(email, '@', 1) FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
