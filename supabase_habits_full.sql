-- ============================================================
-- HABITS MODULE — Full Schema Setup
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. habits table
CREATE TABLE IF NOT EXISTS public.habits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL,
  period_type     text NOT NULL DEFAULT 'none'
                    CHECK (period_type IN ('none','week','month','quarter','year','custom')),
  period_start    date,
  period_end      date,
  goal_id         uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  life_sphere     text NOT NULL,
  repetitions_per_day int NOT NULL DEFAULT 1 CHECK (repetitions_per_day >= 1 AND repetitions_per_day <= 20),
  target_days     smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  icon            text NOT NULL DEFAULT 'sparkle',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_period_check CHECK (
    period_type <> 'custom' OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end >= period_start)
  )
);

CREATE INDEX IF NOT EXISTS habits_user_created ON public.habits (user_id, created_at);
CREATE INDEX IF NOT EXISTS habits_user_goal ON public.habits (user_id, goal_id);
CREATE INDEX IF NOT EXISTS habits_user_sphere ON public.habits (user_id, life_sphere);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_habits_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS habits_updated_at ON public.habits;
CREATE TRIGGER habits_updated_at
  BEFORE UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION update_habits_updated_at();

-- RLS
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS habits_select ON public.habits;
DROP POLICY IF EXISTS habits_insert ON public.habits;
DROP POLICY IF EXISTS habits_update ON public.habits;
DROP POLICY IF EXISTS habits_delete ON public.habits;
CREATE POLICY habits_select ON public.habits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY habits_insert ON public.habits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY habits_update ON public.habits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY habits_delete ON public.habits FOR DELETE USING (auth.uid() = user_id);

-- 2. habit_tags table
CREATE TABLE IF NOT EXISTS public.habit_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, slug)
);

ALTER TABLE public.habit_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS habit_tags_select ON public.habit_tags;
DROP POLICY IF EXISTS habit_tags_insert ON public.habit_tags;
DROP POLICY IF EXISTS habit_tags_update ON public.habit_tags;
DROP POLICY IF EXISTS habit_tags_delete ON public.habit_tags;
CREATE POLICY habit_tags_select ON public.habit_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY habit_tags_insert ON public.habit_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY habit_tags_update ON public.habit_tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY habit_tags_delete ON public.habit_tags FOR DELETE USING (auth.uid() = user_id);

-- 3. habit_tag_links
CREATE TABLE IF NOT EXISTS public.habit_tag_links (
  habit_id  uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  tag_id    uuid NOT NULL REFERENCES public.habit_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (habit_id, tag_id)
);

ALTER TABLE public.habit_tag_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS habit_tag_links_select ON public.habit_tag_links;
DROP POLICY IF EXISTS habit_tag_links_insert ON public.habit_tag_links;
DROP POLICY IF EXISTS habit_tag_links_delete ON public.habit_tag_links;
CREATE POLICY habit_tag_links_select ON public.habit_tag_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.habits h WHERE h.id = habit_id AND h.user_id = auth.uid()));
CREATE POLICY habit_tag_links_insert ON public.habit_tag_links FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.habits h WHERE h.id = habit_id AND h.user_id = auth.uid()));
CREATE POLICY habit_tag_links_delete ON public.habit_tag_links FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.habits h WHERE h.id = habit_id AND h.user_id = auth.uid()));

-- 4. habit_completions
CREATE TABLE IF NOT EXISTS public.habit_completions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id    uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  date        date NOT NULL,
  count       int NOT NULL DEFAULT 1 CHECK (count >= 1 AND count <= 20),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, habit_id, date)
);

CREATE INDEX IF NOT EXISTS habit_completions_user_date ON public.habit_completions (user_id, date);
CREATE INDEX IF NOT EXISTS habit_completions_habit_date ON public.habit_completions (habit_id, date);

ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS habit_completions_select ON public.habit_completions;
DROP POLICY IF EXISTS habit_completions_insert ON public.habit_completions;
DROP POLICY IF EXISTS habit_completions_update ON public.habit_completions;
DROP POLICY IF EXISTS habit_completions_delete ON public.habit_completions;
CREATE POLICY habit_completions_select ON public.habit_completions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY habit_completions_insert ON public.habit_completions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY habit_completions_update ON public.habit_completions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY habit_completions_delete ON public.habit_completions FOR DELETE USING (auth.uid() = user_id);

-- 5. stars_ledger
CREATE TABLE IF NOT EXISTS public.stars_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source      text NOT NULL CHECK (source IN ('habit_completion')),
  source_id   uuid NOT NULL,
  stars       int NOT NULL DEFAULT 1 CHECK (stars > 0 AND stars <= 20),
  date        date NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stars_ledger_user_date ON public.stars_ledger (user_id, date);

ALTER TABLE public.stars_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stars_ledger_select ON public.stars_ledger;
DROP POLICY IF EXISTS stars_ledger_insert ON public.stars_ledger;
DROP POLICY IF EXISTS stars_ledger_delete ON public.stars_ledger;
CREATE POLICY stars_ledger_select ON public.stars_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY stars_ledger_insert ON public.stars_ledger FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY stars_ledger_delete ON public.stars_ledger FOR DELETE USING (auth.uid() = user_id);
