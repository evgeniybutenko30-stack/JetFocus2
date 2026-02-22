-- =====================================================
-- ADMIN PANEL — ПОЛНЫЙ СКРИПТ (v2, правильный порядок)
-- Supabase → SQL Editor → New Query → Run
-- =====================================================

-- ── 1. Enum ──────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner','admin','support','content','analyst');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Таблицы ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role       public.app_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  permission text NOT NULL,
  granted    boolean DEFAULT true,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, permission)
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id),
  actor_email   text,
  action        text NOT NULL,
  target_type   text,
  target_id     text,
  payload_json  jsonb,
  reason        text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  type       text NOT NULL CHECK (type IN ('percent','fixed','pro_days','stars')),
  value      numeric NOT NULL,
  expires_at timestamptz,
  max_uses   integer,
  used_count integer DEFAULT 0,
  rules_json jsonb DEFAULT '{}',
  is_active  boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE CASCADE NOT NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (promo_code_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.stars_ledger (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  uuid REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  delta          integer NOT NULL,
  reason         text,
  source         text DEFAULT 'admin',
  created_at     timestamptz DEFAULT now()
);

-- Добавить колонки если таблица уже существовала с другой схемой
ALTER TABLE public.stars_ledger ADD COLUMN IF NOT EXISTS actor_user_id  uuid REFERENCES auth.users(id);
ALTER TABLE public.stars_ledger ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.stars_ledger ADD COLUMN IF NOT EXISTS source text DEFAULT 'admin';

-- Расширить user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS stars_balance integer DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_pro      boolean DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_banned   boolean DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS status      text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS interests   text[];
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS city        text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS tagline     text;

-- RLS включить
ALTER TABLE public.admin_roles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stars_ledger      ENABLE ROW LEVEL SECURITY;

-- ── 3. ФУНКЦИИ (SECURITY DEFINER) — ДО политик! ──────

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles WHERE user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role::text FROM public.admin_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'owner'   THEN 1
    WHEN 'admin'   THEN 2
    WHEN 'support' THEN 3
    WHEN 'content' THEN 4
    WHEN 'analyst' THEN 5
    ELSE 6
  END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_stars(
  p_actor_id  uuid,
  p_target_id uuid,
  p_delta     integer,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_role  text;
  v_actor_email text;
BEGIN
  v_actor_role := public.get_user_role(p_actor_id);
  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Access denied: not an admin';
  END IF;
  IF v_actor_role = 'support' AND p_delta > 100 THEN
    RAISE EXCEPTION 'Support role can grant max 100 stars at once';
  END IF;
  INSERT INTO public.stars_ledger (actor_user_id, target_user_id, delta, reason, source)
  VALUES (p_actor_id, p_target_id, p_delta, p_reason, 'admin');
  UPDATE public.user_profiles
  SET stars_balance = COALESCE(stars_balance, 0) + p_delta
  WHERE user_id = p_target_id;
  SELECT email INTO v_actor_email FROM auth.users WHERE id = p_actor_id;
  INSERT INTO public.audit_log
    (actor_user_id, actor_email, action, target_type, target_id, payload_json, reason)
  VALUES
    (p_actor_id, v_actor_email, 'stars.grant', 'user', p_target_id::text,
     jsonb_build_object('delta', p_delta, 'role', v_actor_role), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_pro(
  p_actor_id  uuid,
  p_target_id uuid,
  p_is_pro    boolean,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_role  text;
  v_actor_email text;
BEGIN
  v_actor_role := public.get_user_role(p_actor_id);
  IF v_actor_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions';
  END IF;
  UPDATE public.user_profiles SET is_pro = p_is_pro WHERE user_id = p_target_id;
  SELECT email INTO v_actor_email FROM auth.users WHERE id = p_actor_id;
  INSERT INTO public.audit_log
    (actor_user_id, actor_email, action, target_type, target_id, payload_json, reason)
  VALUES
    (p_actor_id, v_actor_email, 'pro.manage', 'user', p_target_id::text,
     jsonb_build_object('is_pro', p_is_pro), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_ban(
  p_actor_id  uuid,
  p_target_id uuid,
  p_is_banned boolean,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_role  text;
  v_actor_email text;
BEGIN
  v_actor_role := public.get_user_role(p_actor_id);
  IF v_actor_role NOT IN ('owner','admin','support') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE public.user_profiles SET is_banned = p_is_banned WHERE user_id = p_target_id;
  SELECT email INTO v_actor_email FROM auth.users WHERE id = p_actor_id;
  INSERT INTO public.audit_log
    (actor_user_id, actor_email, action, target_type, target_id, payload_json, reason)
  VALUES
    (p_actor_id, v_actor_email,
     CASE WHEN p_is_banned THEN 'users.ban' ELSE 'users.unban' END,
     'user', p_target_id::text,
     jsonb_build_object('is_banned', p_is_banned), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_role(
  p_actor_id  uuid,
  p_target_id uuid,
  p_role      text,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_role  text;
  v_actor_email text;
BEGIN
  v_actor_role := public.get_user_role(p_actor_id);
  IF v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Only owner can manage roles';
  END IF;
  INSERT INTO public.admin_roles (user_id, role, granted_by)
  VALUES (p_target_id, p_role::public.app_role, p_actor_id)
  ON CONFLICT (user_id, role) DO NOTHING;
  SELECT email INTO v_actor_email FROM auth.users WHERE id = p_actor_id;
  INSERT INTO public.audit_log
    (actor_user_id, actor_email, action, target_type, target_id, payload_json, reason)
  VALUES
    (p_actor_id, v_actor_email, 'roles.manage', 'user', p_target_id::text,
     jsonb_build_object('role', p_role), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_role(
  p_actor_id  uuid,
  p_target_id uuid,
  p_role      text,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_role  text;
  v_actor_email text;
  v_target_role text;
BEGIN
  v_actor_role := public.get_user_role(p_actor_id);
  IF v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Only owner can remove roles';
  END IF;
  v_target_role := public.get_user_role(p_target_id);
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove owner role';
  END IF;
  DELETE FROM public.admin_roles
  WHERE user_id = p_target_id AND role = p_role::public.app_role;
  SELECT email INTO v_actor_email FROM auth.users WHERE id = p_actor_id;
  INSERT INTO public.audit_log
    (actor_user_id, actor_email, action, target_type, target_id, payload_json, reason)
  VALUES
    (p_actor_id, v_actor_email, 'roles.remove', 'user', p_target_id::text,
     jsonb_build_object('role', p_role), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_kpis(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.is_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT jsonb_build_object(
    'total_users',   (SELECT COUNT(*)                         FROM auth.users),
    'pro_users',     (SELECT COUNT(*)                         FROM public.user_profiles WHERE is_pro = true),
    'active_7d',     (SELECT COUNT(DISTINCT user_id)          FROM public.user_profiles WHERE created_at >= now() - interval '7 days'),
    'stars_granted', (SELECT COALESCE(SUM(delta), 0)          FROM public.stars_ledger  WHERE delta > 0),
    'promo_used',    (SELECT COUNT(*)                         FROM public.promo_redemptions)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_users(
  p_actor_id uuid,
  p_search   text    DEFAULT NULL,
  p_is_pro   boolean DEFAULT NULL,
  p_limit    integer DEFAULT 50,
  p_offset   integer DEFAULT 0
)
RETURNS TABLE(
  user_id       uuid,
  email         text,
  display_name  text,
  avatar_url    text,
  is_pro        boolean,
  is_banned     boolean,
  stars_balance integer,
  created_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(p.display_name, split_part(u.email,'@',1))::text,
    p.avatar_url::text,
    COALESCE(p.is_pro,      false),
    COALESCE(p.is_banned,   false),
    COALESCE(p.stars_balance, 0),
    u.created_at
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON p.user_id = u.id
  WHERE (p_search IS NULL
         OR u.email        ILIKE '%' || p_search || '%'
         OR p.display_name ILIKE '%' || p_search || '%')
    AND (p_is_pro IS NULL OR COALESCE(p.is_pro, false) = p_is_pro)
  ORDER BY u.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ── 4. RLS ПОЛИТИКИ — ПОСЛЕ функций ──────────────────

-- admin_roles
DROP POLICY IF EXISTS "Admins can read roles"       ON public.admin_roles;
DROP POLICY IF EXISTS "No direct insert on roles"   ON public.admin_roles;
DROP POLICY IF EXISTS "No direct update on roles"   ON public.admin_roles;
DROP POLICY IF EXISTS "No direct delete on roles"   ON public.admin_roles;

CREATE POLICY "Admins can read roles"     ON public.admin_roles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "No direct insert on roles" ON public.admin_roles FOR INSERT WITH CHECK (false);
CREATE POLICY "No direct update on roles" ON public.admin_roles FOR UPDATE USING (false);
CREATE POLICY "No direct delete on roles" ON public.admin_roles FOR DELETE USING (false);

-- audit_log
DROP POLICY IF EXISTS "Admins can read audit"     ON public.audit_log;
DROP POLICY IF EXISTS "No direct insert on audit" ON public.audit_log;

CREATE POLICY "Admins can read audit"     ON public.audit_log FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "No direct insert on audit" ON public.audit_log FOR INSERT WITH CHECK (false);

-- stars_ledger
DROP POLICY IF EXISTS "Users read own ledger"  ON public.stars_ledger;
DROP POLICY IF EXISTS "No direct insert ledger" ON public.stars_ledger;

CREATE POLICY "Users read own ledger"   ON public.stars_ledger
  FOR SELECT USING (target_user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "No direct insert ledger" ON public.stars_ledger FOR INSERT WITH CHECK (false);

-- promo_codes
DROP POLICY IF EXISTS "Admins manage promos" ON public.promo_codes;
CREATE POLICY "Admins manage promos" ON public.promo_codes FOR ALL USING (public.is_admin(auth.uid()));

-- promo_redemptions
DROP POLICY IF EXISTS "Users read own redemptions" ON public.promo_redemptions;
CREATE POLICY "Users read own redemptions" ON public.promo_redemptions
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- admin_permissions
DROP POLICY IF EXISTS "Admins read permissions" ON public.admin_permissions;
CREATE POLICY "Admins read permissions" ON public.admin_permissions
  FOR SELECT USING (public.is_admin(auth.uid()));

-- ── 5. SEED: назначить owner ──────────────────────────

INSERT INTO public.admin_roles (user_id, role)
SELECT id, 'owner'
FROM auth.users
WHERE email = 'Butenkoe200@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
