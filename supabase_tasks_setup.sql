-- ============================================================
-- TASKS TABLE — запусти в Supabase SQL Editor
-- ============================================================

-- 1. Удалить таблицу если существует (для чистой миграции)
DROP TABLE IF EXISTS public.tasks CASCADE;

-- 2. Создать таблицу
CREATE TABLE public.tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  sphere        text NOT NULL DEFAULT 'career',
  priority      text NOT NULL DEFAULT 'MEDIUM',
  status        text NOT NULL DEFAULT 'TODO',
  due_date      date,
  tags          text[],
  category      text,
  goal_id       uuid,
  recurrence    text,
  icon          text,
  color         text,
  subtasks      jsonb,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 3. Включить RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 4. Политика доступа — только свои строки
DROP POLICY IF EXISTS "tasks_own" ON public.tasks;
CREATE POLICY "tasks_own" ON public.tasks
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Индексы для быстрых запросов
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);

-- 6. Автообновление updated_at
CREATE OR REPLACE FUNCTION public.update_tasks_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_updated_at ON public.tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_tasks_updated_at();

-- ============================================================
-- Готово! Таблица tasks создана с RLS политиками.
-- ============================================================
