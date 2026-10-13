-- =============================================================================
-- 20261013_security_hardening.sql — JetFocus2 Supabase security hardening
-- =============================================================================
-- HOW TO APPLY
--   Supabase Dashboard → SQL Editor → paste the whole file → Run (runs as `postgres`).
--   The file is idempotent (CREATE OR REPLACE / IF [NOT] EXISTS / guarded DO blocks)
--   and runs in one transaction: either everything applies or nothing does.
--   Prerequisites (checked in step 0, the transaction aborts with a clear message if
--   missing): supabase_full_setup.sql (or supabase_setup.sql) and
--   supabase_admin_setup_v2.sql (or v1). All other objects are optional and guarded.
--
-- APPLY ORDER OF THE HISTORICAL repo-root supabase_*.sql FILES (for reference)
--   supabase_setup.sql ⊂ supabase_full_setup.sql (user_profiles, goals*, handle_new_user)
--   supabase_tasks_setup.sql      (WARNING: starts with DROP TABLE tasks CASCADE — never re-run)
--   supabase_goals_v2.sql ≈ supabase_goals_complete.sql (complete = re-runnable version)
--   supabase_habits_full.sql      (habits*, and a *habit-only* stars_ledger schema)
--   supabase_rating_setup.sql     (referrals, posts, post_likes, public profile read,
--                                  sync_stars_balance trigger)
--   supabase_admin_setup.sql → superseded by supabase_admin_setup_v2.sql
--   The client (src/lib/starsService.ts, adminService.ts) uses the *admin* stars_ledger
--   schema (target_user_id, delta, reason, source); see diagnostics in step 12.
--
-- WHAT THIS FIXES
--   F1  [P0] Admin RPCs (admin_grant_stars, admin_set_pro, admin_set_ban, admin_set_role,
--            admin_remove_role, admin_get_kpis, admin_get_users) authorised the
--            caller-supplied p_actor_id. Anyone holding the public anon key could call
--            admin_set_role('<owner uuid>', '<own uuid>', 'owner', '') and take over the
--            console (owner uuid discoverable via public user_profiles + get_user_role).
--            Now authorisation uses auth.uid(); p_actor_id is kept for client
--            compatibility and must be NULL or equal to auth.uid().
--   F2  [P0] Those SECURITY DEFINER functions were EXECUTE-able by PUBLIC/anon.
--            Revoked; granted to authenticated + service_role only.
--   F3  [P0] user_profiles UPDATE/INSERT policies (user_id = auth.uid()) allowed a user to
--            write is_pro / stars_balance / is_banned on their own row (self-grant PRO,
--            unlimited stars → leaderboard, self-unban; delete+re-insert also reset bans).
--            A BEFORE trigger now pins privileged columns for end-user statements
--            (current_user anon/authenticated) and blocks end-user DELETE of a profile.
--            SECURITY DEFINER RPCs, triggers, service_role and the SQL editor are unaffected.
--   F4  [P1] get_user_role / is_admin / has_admin_role answered for ANY uuid (staff
--            enumeration). They now answer only about the caller, unless the caller is staff
--            or the call comes from a trusted context (SQL editor / service_role).
--   F5  [P1] Privilege gaps inside admin RPCs: content/analyst could grant unlimited stars,
--            support's 100-star cap was bypassable with negative deltas, content/analyst
--            could list every user's e-mail, support could ban the owner. Roles now match
--            the admin UI matrix (src/components/admin/AdminLayout.tsx); admin_set_ban
--            refuses self-bans and targets of equal/higher staff rank (owner: anyone else).
--            Missing profile rows no longer make admin actions a silent no-op.
--   F6  [P2] stars_ledger: the client inserts award rows directly (starsService.awardStars).
--            A BEFORE trigger now restricts end-user writes: own rows only, no 'admin'
--            source / foreign actor, whitelisted sources, per-source delta caps,
--            server-side de-duplication by reason (race-safe), no UPDATE, and users can't
--            delete admin-issued entries (e.g. penalties). Admin grants no longer double
--            count when a ledger→balance sync trigger exists. Adds permissive own-row
--            INSERT/DELETE policies so those guarded client writes are not rejected by
--            admin_setup's "No direct insert ledger" (WITH CHECK false).
--   F7  [P2] promo_codes: any staff role (incl. analyst/content) could create/alter codes.
--            Writes now owner/admin/support (same as the admin UI), delete owner/admin.
--   F8  [P2] referrals: INSERT policy let a user fabricate 'confirmed' referrals for any
--            invited uuid (rating score). The client never inserts referrals → policy
--            dropped; self-referrals rejected by a CHECK constraint (NOT VALID).
--   F9  [P2] posts: owner/admin see a "delete" button for any post (Social.tsx) but RLS
--            only allowed own deletes → silent failure + false success toast.
--            Adds an owner/admin DELETE policy.
--   F10 [P2] storage buckets avatars/posts: writes are restricted (RESTRICTIVE policy) to
--            the caller's own "<auth.uid()>/" folder — the exact path scheme the client
--            uses — so nobody can overwrite another user's avatar/media.
--   F11 [P3] SECURITY DEFINER functions without a pinned search_path (sync_stars_balance,
--            and any prod-only ones) get search_path = public, extensions, pg_temp.
--   F12 [P3] admin_get_kpis.active_7d counted *sign-ups* of the last 7 days although the
--            dashboard labels it "Активных 7 дн."; now counts users signed in within 7 days.
--   F13 [P3] Missing indexes on user_id / filter columns used by RLS and client queries.
--   F14 [P3] Tables that exist only in prod (user_stats, referral_codes): if RLS is
--            disabled they get RLS + an own-row policy (client only reads own rows).
--
-- ROLLBACK (manual; nothing here deletes data):
--   DROP TRIGGER IF EXISTS jf_guard_user_profiles ON public.user_profiles;
--   DROP TRIGGER IF EXISTS jf_guard_stars_ledger  ON public.stars_ledger;
--     (drop it only together with: DROP POLICY IF EXISTS "stars_ledger own insert" /
--      "stars_ledger own delete" ON public.stars_ledger;)
--   DROP POLICY IF EXISTS posts_delete_staff ON public.posts;
--   DROP POLICY IF EXISTS promo_codes_staff_select/insert/update/delete ON public.promo_codes;
--     and re-create: CREATE POLICY "Admins manage promos" ON public.promo_codes
--                    FOR ALL USING (public.is_admin(auth.uid()));
--   DROP POLICY IF EXISTS jf_media_* ON storage.objects;   (4 restrictive + 4 permissive)
--   ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_no_self_referral;
--   Old function bodies: re-run supabase_admin_setup_v2.sql — NOT recommended, it
--   re-opens F1/F2. Index additions are harmless and need no rollback.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Prerequisites
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN v_missing := array_append(v_missing, 'public.user_profiles'); END IF;
  IF to_regclass('public.admin_roles')   IS NULL THEN v_missing := array_append(v_missing, 'public.admin_roles');   END IF;
  IF to_regclass('public.audit_log')     IS NULL THEN v_missing := array_append(v_missing, 'public.audit_log');     END IF;
  IF to_regclass('public.stars_ledger')  IS NULL THEN v_missing := array_append(v_missing, 'public.stars_ledger');  END IF;
  IF to_regtype('public.app_role')       IS NULL THEN v_missing := array_append(v_missing, 'type public.app_role'); END IF;
  IF to_regprocedure('auth.uid()')       IS NULL THEN v_missing := array_append(v_missing, 'auth.uid()');           END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'security_hardening: missing prerequisites: %. Apply supabase_full_setup.sql and supabase_admin_setup_v2.sql first.',
      array_to_string(v_missing, ', ');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Internal helpers (not callable by clients)
-- -----------------------------------------------------------------------------

-- True when the statement does NOT come from an end-user API request
-- (SQL editor, migrations, pg_cron, service_role key). Uses the PostgREST JWT GUCs,
-- which end users cannot set.
CREATE OR REPLACE FUNCTION public.jf_is_trusted_context()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) NOT IN ('anon', 'authenticated');
$$;

-- Highest staff role of a user (owner > admin > support > content > analyst), no checks.
CREATE OR REPLACE FUNCTION public.jf_staff_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ar.role::text
  FROM public.admin_roles ar
  WHERE ar.user_id = _user_id
  ORDER BY CASE ar.role::text
             WHEN 'owner'   THEN 1
             WHEN 'admin'   THEN 2
             WHEN 'support' THEN 3
             WHEN 'content' THEN 4
             WHEN 'analyst' THEN 5
             ELSE 6
           END
  LIMIT 1;
$$;

-- Authorise the CURRENT session user (auth.uid()) for an admin RPC.
-- p_actor_id is the legacy client parameter: it may be NULL or must equal auth.uid().
CREATE OR REPLACE FUNCTION public.jf_assert_staff(p_actor_id uuid, p_allowed text[])
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND p_actor_id <> v_uid THEN
    RAISE EXCEPTION 'Access denied: actor does not match the signed-in user' USING ERRCODE = '42501';
  END IF;
  v_role := public.jf_staff_role(v_uid);
  IF v_role IS NULL OR NOT (v_role = ANY (p_allowed)) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions' USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END;
$$;

-- Make sure a user_profiles row exists for an auth user (admin actions on users whose
-- profile row is missing were silent no-ops). Returns false if the auth user is unknown.
CREATE OR REPLACE FUNCTION public.jf_ensure_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = p_user_id) THEN
    RETURN true;
  END IF;
  INSERT INTO public.user_profiles (user_id, display_name)
  SELECT u.id, split_part(u.email, '@', 1)
  FROM auth.users u
  WHERE u.id = p_user_id
  ON CONFLICT (user_id) DO NOTHING;
  RETURN EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = p_user_id);
END;
$$;

-- Race-safe duplicate check for self-awarded stars (bypasses RLS on purpose so a
-- restrictive SELECT policy cannot hide existing rows).
CREATE OR REPLACE FUNCTION public.jf_stars_reason_taken(p_user_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only answers about the caller's own award keys.
  IF p_user_id IS NULL OR p_reason IS NULL
     OR (p_user_id IS DISTINCT FROM auth.uid() AND NOT public.jf_is_trusted_context()) THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('jf_stars_ledger:' || p_user_id::text || ':' || p_reason, 0));
  RETURN EXISTS (
    SELECT 1 FROM public.stars_ledger sl
    WHERE sl.target_user_id = p_user_id AND sl.reason = p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.jf_is_trusted_context()                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jf_staff_role(uuid)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jf_assert_staff(uuid, text[])          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jf_ensure_profile(uuid)                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jf_stars_reason_taken(uuid, text)      FROM PUBLIC;
-- Supabase default privileges grant EXECUTE on new functions to these roles explicitly.
-- (They are only called from SECURITY DEFINER code, which runs as the owner.)
REVOKE ALL ON FUNCTION public.jf_is_trusted_context()                FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.jf_staff_role(uuid)                    FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.jf_assert_staff(uuid, text[])          FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.jf_ensure_profile(uuid)                FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.jf_stars_reason_taken(uuid, text)      FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Role helpers used by the client and by RLS policies (F4)
--    Signatures unchanged. They only answer about the caller unless the caller is
--    staff or the context is trusted.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.jf_staff_role(_user_id)
  WHERE _user_id = auth.uid()
     OR public.jf_is_trusted_context()
     OR public.jf_staff_role(auth.uid()) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN _user_id = auth.uid()
      OR public.jf_is_trusted_context()
      OR public.jf_staff_role(auth.uid()) IS NOT NULL
      THEN EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = _user_id)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN _user_id = auth.uid()
      OR public.jf_is_trusted_context()
      OR public.jf_staff_role(auth.uid()) IS NOT NULL
      THEN EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = _user_id AND ar.role = _role)
    ELSE false
  END;
$$;

-- These three are referenced by RLS policies (possibly prod-only ones) that anon requests
-- may hit; revoking EXECUTE from anon would turn such reads into "permission denied".
-- They no longer leak anything (anon has no auth.uid()), so they stay executable.
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid)                    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid)                         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_admin_role(uuid, public.app_role)  TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Admin RPCs (F1, F2, F5) — same signatures/return types as admin_setup_v2.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_grant_stars(
  p_actor_id  uuid,
  p_target_id uuid,
  p_delta     integer,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_role   text;
  v_before integer;
  v_after  integer;
BEGIN
  v_role  := public.jf_assert_staff(p_actor_id, ARRAY['owner', 'admin', 'support']);
  v_actor := auth.uid();

  IF p_target_id IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Invalid arguments: target user and a non-zero amount are required' USING ERRCODE = '22023';
  END IF;
  IF v_role = 'support' AND abs(p_delta) > 100 THEN
    RAISE EXCEPTION 'Support role can grant max 100 stars at once' USING ERRCODE = '42501';
  END IF;
  IF NOT public.jf_ensure_profile(p_target_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  -- Lock the profile row so concurrent awards cannot interleave with the balance check.
  SELECT COALESCE(up.stars_balance, 0) INTO v_before
  FROM public.user_profiles up WHERE up.user_id = p_target_id
  FOR UPDATE;

  INSERT INTO public.stars_ledger (actor_user_id, target_user_id, delta, reason, source)
  VALUES (v_actor, p_target_id, p_delta, p_reason, 'admin');

  -- If an AFTER trigger on stars_ledger already synced the balance, do not add it twice.
  SELECT COALESCE(up.stars_balance, 0) INTO v_after
  FROM public.user_profiles up WHERE up.user_id = p_target_id;
  IF v_after = v_before THEN
    UPDATE public.user_profiles
    SET stars_balance = COALESCE(stars_balance, 0) + p_delta
    WHERE user_id = p_target_id;
  END IF;

  INSERT INTO public.audit_log (actor_user_id, actor_email, action, target_type, target_id, payload_json, reason)
  VALUES (v_actor, (SELECT u.email FROM auth.users u WHERE u.id = v_actor), 'stars.grant', 'user',
          p_target_id::text, jsonb_build_object('delta', p_delta, 'role', v_role), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_pro(
  p_actor_id  uuid,
  p_target_id uuid,
  p_is_pro    boolean,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_role  text;
BEGIN
  v_role  := public.jf_assert_staff(p_actor_id, ARRAY['owner', 'admin']);
  v_actor := auth.uid();
  IF p_target_id IS NULL OR p_is_pro IS NULL THEN
    RAISE EXCEPTION 'Invalid arguments' USING ERRCODE = '22023';
  END IF;
  IF NOT public.jf_ensure_profile(p_target_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.user_profiles SET is_pro = p_is_pro WHERE user_id = p_target_id;

  INSERT INTO public.audit_log (actor_user_id, actor_email, action, target_type, target_id, payload_json, reason)
  VALUES (v_actor, (SELECT u.email FROM auth.users u WHERE u.id = v_actor), 'pro.manage', 'user',
          p_target_id::text, jsonb_build_object('is_pro', p_is_pro, 'role', v_role), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_ban(
  p_actor_id  uuid,
  p_target_id uuid,
  p_is_banned boolean,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_role        text;
  v_target_role text;
BEGIN
  v_role  := public.jf_assert_staff(p_actor_id, ARRAY['owner', 'admin', 'support']);
  v_actor := auth.uid();
  IF p_target_id IS NULL OR p_is_banned IS NULL THEN
    RAISE EXCEPTION 'Invalid arguments' USING ERRCODE = '22023';
  END IF;
  -- Nobody (un)bans themselves; owners may (un)ban anyone else; admin/support only
  -- users whose staff rank is below their own (support could ban the owner before).
  IF p_target_id = v_actor THEN
    RAISE EXCEPTION 'Access denied: you cannot change your own ban status' USING ERRCODE = '42501';
  END IF;
  v_target_role := public.jf_staff_role(p_target_id);
  IF v_role <> 'owner' AND v_target_role IS NOT NULL
     AND array_position(ARRAY['owner', 'admin', 'support', 'content', 'analyst'], v_target_role)
         <= array_position(ARRAY['owner', 'admin', 'support', 'content', 'analyst'], v_role) THEN
    RAISE EXCEPTION 'Access denied: cannot ban a staff member of equal or higher rank' USING ERRCODE = '42501';
  END IF;
  IF NOT public.jf_ensure_profile(p_target_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.user_profiles SET is_banned = p_is_banned WHERE user_id = p_target_id;

  INSERT INTO public.audit_log (actor_user_id, actor_email, action, target_type, target_id, payload_json, reason)
  VALUES (v_actor, (SELECT u.email FROM auth.users u WHERE u.id = v_actor),
          CASE WHEN p_is_banned THEN 'users.ban' ELSE 'users.unban' END, 'user',
          p_target_id::text, jsonb_build_object('is_banned', p_is_banned, 'role', v_role), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_role(
  p_actor_id  uuid,
  p_target_id uuid,
  p_role      text,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  PERFORM public.jf_assert_staff(p_actor_id, ARRAY['owner']);
  v_actor := auth.uid();
  IF p_target_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'Invalid arguments' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_roles (user_id, role, granted_by)
  VALUES (p_target_id, p_role::public.app_role, v_actor)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_log (actor_user_id, actor_email, action, target_type, target_id, payload_json, reason)
  VALUES (v_actor, (SELECT u.email FROM auth.users u WHERE u.id = v_actor), 'roles.manage', 'user',
          p_target_id::text, jsonb_build_object('role', p_role), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_role(
  p_actor_id  uuid,
  p_target_id uuid,
  p_role      text,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  PERFORM public.jf_assert_staff(p_actor_id, ARRAY['owner']);
  v_actor := auth.uid();
  IF p_target_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'Invalid arguments' USING ERRCODE = '22023';
  END IF;
  IF public.jf_staff_role(p_target_id) = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove owner role' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.admin_roles ar
  WHERE ar.user_id = p_target_id AND ar.role = p_role::public.app_role;

  INSERT INTO public.audit_log (actor_user_id, actor_email, action, target_type, target_id, payload_json, reason)
  VALUES (v_actor, (SELECT u.email FROM auth.users u WHERE u.id = v_actor), 'roles.remove', 'user',
          p_target_id::text, jsonb_build_object('role', p_role), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_kpis(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.jf_assert_staff(p_actor_id, ARRAY['owner', 'admin', 'support', 'content', 'analyst']);

  SELECT jsonb_build_object(
    'total_users',   (SELECT COUNT(*) FROM auth.users),
    'pro_users',     (SELECT COUNT(*) FROM public.user_profiles up WHERE up.is_pro = true),
    'active_7d',     (SELECT COUNT(*) FROM auth.users u WHERE u.last_sign_in_at >= now() - interval '7 days'),
    'stars_granted', (SELECT COALESCE(SUM(sl.delta), 0) FROM public.stars_ledger sl WHERE sl.delta > 0),
    'promo_used',    (SELECT COUNT(*) FROM public.promo_redemptions)
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Users page + PRO subscriptions page: owner/admin/support (AdminLayout.tsx).
  PERFORM public.jf_assert_staff(p_actor_id, ARRAY['owner', 'admin', 'support']);

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(p.display_name, split_part(u.email, '@', 1))::text,
    p.avatar_url::text,
    COALESCE(p.is_pro, false),
    COALESCE(p.is_banned, false),
    COALESCE(p.stars_balance, 0)::integer,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON p.user_id = u.id
  WHERE (p_search IS NULL
         OR u.email        ILIKE '%' || p_search || '%'
         OR p.display_name ILIKE '%' || p_search || '%')
    AND (p_is_pro IS NULL OR COALESCE(p.is_pro, false) = p_is_pro)
  ORDER BY u.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_stars(uuid, uuid, integer, text)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_pro(uuid, uuid, boolean, text)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_ban(uuid, uuid, boolean, text)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_role(uuid, uuid, text, text)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_role(uuid, uuid, text, text)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_kpis(uuid)                                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_users(uuid, text, boolean, integer, integer)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_stars(uuid, uuid, integer, text)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_pro(uuid, uuid, boolean, text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_ban(uuid, uuid, boolean, text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, uuid, text, text)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_role(uuid, uuid, text, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_kpis(uuid)                                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_users(uuid, text, boolean, integer, integer) TO authenticated, service_role;

-- record_daily_active() exists only in prod (called after sign-in by auth-store.ts).
DO $$
BEGIN
  IF to_regprocedure('public.record_daily_active()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.record_daily_active() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.record_daily_active() TO authenticated, service_role;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. user_profiles: privileged columns guard (F3)
--    Trigger function is SECURITY INVOKER on purpose: current_user is then the role
--    that executes the statement — 'authenticated'/'anon' for direct API writes, the
--    function owner inside SECURITY DEFINER RPCs/triggers (admin_set_pro, stars sync).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jf_guard_user_profiles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Columns only staff RPCs / server code may change. Columns that do not exist are ignored.
  c_protected CONSTANT text[] := ARRAY[
    'is_pro', 'pro_until', 'pro_expires_at', 'stars_balance', 'is_banned', 'banned_until',
    'ban_reason', 'role', 'is_admin', 'is_verified', 'xp', 'level'
  ];
  v_new     jsonb;
  v_old     jsonb;
  v_patch   jsonb := '{}'::jsonb;
  v_col     text;
  v_default text;
  v_value   jsonb;
BEGIN
  -- Trusted: SECURITY DEFINER code, service_role, SQL editor, and writes issued by other
  -- triggers (e.g. a stars_ledger → stars_balance sync trigger).
  IF current_user NOT IN ('anon', 'authenticated') OR pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- delete + re-insert would reset is_banned / is_pro; the client never deletes profiles.
    RAISE EXCEPTION 'Deleting a profile is not allowed' USING ERRCODE = '42501';
  END IF;

  v_new := to_jsonb(NEW);

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    FOREACH v_col IN ARRAY c_protected || ARRAY['user_id', 'created_at'] LOOP
      IF v_old ? v_col AND (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
        v_patch := v_patch || jsonb_build_object(v_col, v_old -> v_col);
      END IF;
    END LOOP;
  ELSE
    -- INSERT: privileged columns always start from their column default.
    FOR v_col, v_default IN
      SELECT a.attname::text, pg_get_expr(d.adbin, d.adrelid)
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = TG_RELID
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.attname::text = ANY (c_protected)
    LOOP
      IF v_default IS NULL THEN
        v_value := 'null'::jsonb;
      ELSE
        EXECUTE 'SELECT to_jsonb(' || v_default || ')' INTO v_value;
      END IF;
      IF (v_new -> v_col) IS DISTINCT FROM v_value THEN
        v_patch := v_patch || jsonb_build_object(v_col, v_value);
      END IF;
    END LOOP;
  END IF;

  IF v_patch <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, v_patch);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jf_guard_user_profiles ON public.user_profiles;
CREATE TRIGGER jf_guard_user_profiles
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.jf_guard_user_profiles();

-- -----------------------------------------------------------------------------
-- 5. stars_ledger: end-user write guard (F6)
--    The client (src/lib/starsService.ts) inserts {target_user_id, delta, source, reason}
--    and deletes its own rows by reason. Admin grants go through admin_grant_stars
--    (SECURITY DEFINER → trusted). Field access goes through to_jsonb() so the function
--    works with either historical stars_ledger schema.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jf_guard_stars_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_row    jsonb;
  v_owner  text;
  v_source text;
  v_reason text;
  v_delta  numeric;
  v_max    integer;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'stars_ledger entries cannot be modified' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
    v_owner := COALESCE(v_row ->> 'target_user_id', v_row ->> 'user_id');
    -- Users may only revoke their own self-awarded entries (never admin grants/penalties).
    IF v_uid IS NULL
       OR v_owner IS DISTINCT FROM v_uid::text
       OR COALESCE(v_row ->> 'source', '') = 'admin'
       OR COALESCE(v_row ->> 'actor_user_id', v_uid::text) <> v_uid::text THEN
      RETURN NULL;  -- skip the row silently
    END IF;
    RETURN OLD;
  END IF;

  -- INSERT
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  v_row := to_jsonb(NEW);

  IF COALESCE(v_row ->> 'target_user_id', v_row ->> 'user_id') IS DISTINCT FROM v_uid::text
     OR COALESCE(v_row ->> 'target_user_id', v_uid::text) <> v_uid::text
     OR COALESCE(v_row ->> 'user_id', v_uid::text) <> v_uid::text
     OR COALESCE(v_row ->> 'actor_user_id', v_uid::text) <> v_uid::text THEN
    RAISE EXCEPTION 'Stars can only be self-awarded to the signed-in user' USING ERRCODE = '42501';
  END IF;

  v_source := v_row ->> 'source';
  -- Sources used by the client (habitsService, Tasks, GoalDetail; finance_goal reserved).
  v_max := CASE v_source
             WHEN 'habit_completion' THEN 20
             WHEN 'task_completion'  THEN 20
             WHEN 'goal_step'        THEN 20
             WHEN 'goal_complete'    THEN 50
             WHEN 'finance_goal'     THEN 100
             WHEN 'milestone'        THEN 1000
             ELSE NULL
           END;
  IF v_max IS NULL THEN
    RAISE EXCEPTION 'Stars source "%" cannot be self-awarded', COALESCE(v_source, 'null') USING ERRCODE = '42501';
  END IF;

  v_delta := COALESCE(v_row ->> 'delta', v_row ->> 'stars')::numeric;
  IF v_delta IS NULL OR v_delta < 1 OR v_delta > v_max THEN
    RAISE EXCEPTION 'Invalid stars amount % for source %', v_delta, v_source USING ERRCODE = '22023';
  END IF;

  IF v_row ? 'reason' THEN
    v_reason := v_row ->> 'reason';
    IF v_reason IS NULL OR length(v_reason) = 0 OR length(v_reason) > 200 THEN
      RAISE EXCEPTION 'A unique award key (reason) is required' USING ERRCODE = '22023';
    END IF;
    IF v_row ? 'target_user_id' AND public.jf_stars_reason_taken(v_uid, v_reason) THEN
      RAISE EXCEPTION 'Stars for "%" were already awarded', v_reason USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jf_guard_stars_ledger ON public.stars_ledger;
CREATE TRIGGER jf_guard_stars_ledger
  BEFORE INSERT OR UPDATE OR DELETE ON public.stars_ledger
  FOR EACH ROW EXECUTE FUNCTION public.jf_guard_stars_ledger();

-- jf_stars_reason_taken is called from the (invoker) trigger above → end users need
-- EXECUTE on it; it only reveals whether the caller's own award key exists.
GRANT EXECUTE ON FUNCTION public.jf_stars_reason_taken(uuid, text) TO authenticated;

-- RLS for the client's own award/revoke writes. admin_setup(_v2).sql only has
-- "No direct insert ledger" WITH CHECK (false) and no DELETE policy, so awardStars /
-- revokeStars were rejected unless prod has extra policies. Permissive policies are
-- OR-ed: where prod already allows these writes nothing changes. Every end-user write
-- is still constrained by jf_guard_stars_ledger (own rows, whitelisted sources, caps,
-- unique key; admin-issued rows are never deleted).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = 'stars_ledger' AND ic.column_name = 'target_user_id'
  ) THEN
    RAISE NOTICE 'public.stars_ledger lacks target_user_id — own insert/delete policies skipped';
    RETURN;
  END IF;
  DROP POLICY IF EXISTS "stars_ledger own insert" ON public.stars_ledger;
  DROP POLICY IF EXISTS "stars_ledger own delete" ON public.stars_ledger;
  CREATE POLICY "stars_ledger own insert" ON public.stars_ledger
    FOR INSERT TO authenticated
    WITH CHECK (target_user_id = auth.uid());
  CREATE POLICY "stars_ledger own delete" ON public.stars_ledger
    FOR DELETE TO authenticated
    USING (target_user_id = auth.uid());
END $$;

-- Trigger functions do not need EXECUTE to fire; drop Supabase's default grants.
REVOKE ALL ON FUNCTION public.jf_guard_user_profiles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jf_guard_stars_ledger()  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. promo_codes: writes only for owner/admin/support (F7)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.promo_codes') IS NULL THEN
    RAISE NOTICE 'public.promo_codes not found — skipped';
    RETURN;
  END IF;
  DROP POLICY IF EXISTS "Admins manage promos"       ON public.promo_codes;
  DROP POLICY IF EXISTS "promo_codes_staff_select"   ON public.promo_codes;
  DROP POLICY IF EXISTS "promo_codes_staff_insert"   ON public.promo_codes;
  DROP POLICY IF EXISTS "promo_codes_staff_update"   ON public.promo_codes;
  DROP POLICY IF EXISTS "promo_codes_staff_delete"   ON public.promo_codes;

  CREATE POLICY "promo_codes_staff_select" ON public.promo_codes
    FOR SELECT TO authenticated
    USING (public.is_admin(auth.uid()));
  CREATE POLICY "promo_codes_staff_insert" ON public.promo_codes
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('owner', 'admin', 'support')
                AND (created_by IS NULL OR created_by = auth.uid()));
  CREATE POLICY "promo_codes_staff_update" ON public.promo_codes
    FOR UPDATE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('owner', 'admin', 'support'))
    WITH CHECK (public.get_user_role(auth.uid()) IN ('owner', 'admin', 'support'));
  CREATE POLICY "promo_codes_staff_delete" ON public.promo_codes
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('owner', 'admin'));
END $$;

-- -----------------------------------------------------------------------------
-- 7. referrals: no client-side fabrication of referrals (F8)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.referrals') IS NULL THEN
    RAISE NOTICE 'public.referrals not found — skipped';
    RETURN;
  END IF;
  -- Rating counts status='confirmed' referrals; the old policy let any user insert
  -- confirmed rows for arbitrary invited uuids. The client never inserts referrals and
  -- server-side code (SECURITY DEFINER / service_role) bypasses RLS.
  DROP POLICY IF EXISTS "referrals_insert_own" ON public.referrals;

  -- The client only reads inviter_id/status: do not abort if prod named the columns differently.
  IF (SELECT count(*) FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND ic.table_name = 'referrals'
        AND ic.column_name IN ('inviter_id', 'invited_id')) < 2 THEN
    RAISE NOTICE 'public.referrals lacks inviter_id/invited_id — self-referral check skipped';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.referrals'::regclass AND conname = 'referrals_no_self_referral'
  ) THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT referrals_no_self_referral CHECK (inviter_id <> invited_id) NOT VALID;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 8. posts: owner/admin moderation delete (F9)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.posts') IS NULL THEN
    RAISE NOTICE 'public.posts not found — skipped';
    RETURN;
  END IF;
  DROP POLICY IF EXISTS "posts_delete_staff" ON public.posts;
  CREATE POLICY "posts_delete_staff" ON public.posts
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('owner', 'admin'));
END $$;

-- -----------------------------------------------------------------------------
-- 9. Storage: avatars/posts writes only inside "<auth.uid()>/" (F10)
--    RESTRICTIVE policies are AND-ed with whatever permissive policies already exist
--    (created in the dashboard, unknown here); the permissive own-folder policies make
--    sure the client's uploads keep working (avatar upsert needs INSERT+SELECT+UPDATE).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not found — skipped';
    RETURN;
  END IF;
  BEGIN
    DROP POLICY IF EXISTS jf_media_restrict_insert ON storage.objects;
    DROP POLICY IF EXISTS jf_media_restrict_update ON storage.objects;
    DROP POLICY IF EXISTS jf_media_restrict_delete ON storage.objects;
    DROP POLICY IF EXISTS jf_media_own_select      ON storage.objects;
    DROP POLICY IF EXISTS jf_media_own_insert      ON storage.objects;
    DROP POLICY IF EXISTS jf_media_own_update      ON storage.objects;
    DROP POLICY IF EXISTS jf_media_own_delete      ON storage.objects;

    CREATE POLICY jf_media_restrict_insert ON storage.objects AS RESTRICTIVE
      FOR INSERT TO public
      WITH CHECK (bucket_id NOT IN ('avatars', 'posts')
                  OR (auth.uid() IS NOT NULL AND split_part(name, '/', 1) = auth.uid()::text));
    CREATE POLICY jf_media_restrict_update ON storage.objects AS RESTRICTIVE
      FOR UPDATE TO public
      USING (bucket_id NOT IN ('avatars', 'posts')
             OR (auth.uid() IS NOT NULL AND split_part(name, '/', 1) = auth.uid()::text))
      WITH CHECK (bucket_id NOT IN ('avatars', 'posts')
                  OR (auth.uid() IS NOT NULL AND split_part(name, '/', 1) = auth.uid()::text));
    CREATE POLICY jf_media_restrict_delete ON storage.objects AS RESTRICTIVE
      FOR DELETE TO public
      USING (bucket_id NOT IN ('avatars', 'posts')
             OR (auth.uid() IS NOT NULL AND split_part(name, '/', 1) = auth.uid()::text));

    CREATE POLICY jf_media_own_select ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id IN ('avatars', 'posts') AND split_part(name, '/', 1) = auth.uid()::text);
    CREATE POLICY jf_media_own_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id IN ('avatars', 'posts') AND split_part(name, '/', 1) = auth.uid()::text);
    CREATE POLICY jf_media_own_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id IN ('avatars', 'posts') AND split_part(name, '/', 1) = auth.uid()::text)
      WITH CHECK (bucket_id IN ('avatars', 'posts') AND split_part(name, '/', 1) = auth.uid()::text);
    CREATE POLICY jf_media_own_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id IN ('avatars', 'posts') AND split_part(name, '/', 1) = auth.uid()::text);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'storage.objects policies not changed (insufficient privilege) — add them in Dashboard → Storage → Policies';
  END;
END $$;

-- -----------------------------------------------------------------------------
-- 10. Pin search_path on SECURITY DEFINER functions that lack it (F11)
--     (e.g. sync_stars_balance from supabase_rating_setup.sql, prod-only functions)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prokind = 'f'  -- ALTER FUNCTION fails on procedures ("is not a function")
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg(setting)
        WHERE cfg.setting LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
      RAISE NOTICE 'search_path pinned on %', r.sig;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'could not pin search_path on % (not owner)', r.sig;
    END;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 11. Indexes for RLS predicates and client filters (F13)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r         record;
  v_missing integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('idx_goal_milestones_user_id',      'goal_milestones',    ARRAY['user_id'],                   'user_id'),
      ('idx_goal_actions_user_id',         'goal_actions',       ARRAY['user_id'],                   'user_id'),
      ('idx_goal_progress_logs_user_id',   'goal_progress_logs', ARRAY['user_id'],                   'user_id'),
      ('idx_tasks_user_due_date',          'tasks',              ARRAY['user_id', 'due_date'],       'user_id, due_date'),
      ('idx_habit_tag_links_tag_id',       'habit_tag_links',    ARRAY['tag_id'],                    'tag_id'),
      ('idx_user_data_sanity_user_key',    'user_data_sanity',   ARRAY['user_id', 'key'],            'user_id, key'),
      ('idx_posts_created_at',             'posts',              ARRAY['created_at'],                'created_at DESC'),
      ('idx_post_likes_created_at',        'post_likes',         ARRAY['created_at'],                'created_at'),
      ('idx_referrals_status_created_at',  'referrals',          ARRAY['status', 'created_at'],      'status, created_at'),
      ('idx_stars_ledger_target_reason',   'stars_ledger',       ARRAY['target_user_id', 'reason'],  'target_user_id, reason'),
      ('idx_stars_ledger_target_created',  'stars_ledger',       ARRAY['target_user_id', 'created_at'], 'target_user_id, created_at DESC'),
      ('idx_stars_ledger_created_at',      'stars_ledger',       ARRAY['created_at'],                'created_at DESC'),
      ('idx_audit_log_created_at',         'audit_log',          ARRAY['created_at'],                'created_at DESC'),
      ('idx_promo_redemptions_user_id',    'promo_redemptions',  ARRAY['user_id'],                   'user_id')
    ) AS t(idx, tbl, cols, spec)
  LOOP
    IF to_regclass(format('public.%I', r.tbl)) IS NULL THEN
      CONTINUE;
    END IF;
    SELECT count(*) INTO v_missing
    FROM unnest(r.cols) AS c(col)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND ic.table_name = r.tbl AND ic.column_name = c.col
    );
    IF v_missing > 0 THEN
      RAISE NOTICE 'index % skipped: public.% lacks columns %', r.idx, r.tbl, r.cols;
      CONTINUE;
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', r.idx, r.tbl, r.spec);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 12. Prod-only tables + diagnostics (F14)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  r record;
  v_policy text;
BEGIN
  -- Tables used by the client but not defined in the repo SQL.
  FOREACH t IN ARRAY ARRAY['user_stats', 'referral_codes'] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', t)) AND c.relrowsecurity) THEN
      CONTINUE;  -- RLS already on: keep the existing (unknown) policies
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
    ) THEN
      RAISE WARNING 'public.% has RLS DISABLED and no user_id column — review manually', t;
      CONTINUE;
    END IF;
    v_policy := 'jf_' || t || '_own';
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
        v_policy, t);
      RAISE NOTICE 'RLS enabled on public.% with own-row policy %', t, v_policy;
    EXCEPTION WHEN insufficient_privilege THEN
      -- Table owned by another role: do not abort the whole migration over it.
      RAISE WARNING 'public.% has RLS DISABLED and could not be changed (not owner) — review manually', t;
    END;
  END LOOP;

  -- Any other public table without RLS is readable/writable with the anon key.
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    RAISE WARNING 'public.% has row level security DISABLED', r.relname;
  END LOOP;

  -- stars_ledger shape expected by src/lib/starsService.ts / adminService.ts.
  FOR r IN
    SELECT col FROM unnest(ARRAY['target_user_id', 'delta', 'reason', 'source', 'actor_user_id']) AS x(col)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND ic.table_name = 'stars_ledger' AND ic.column_name = x.col
    )
  LOOP
    RAISE WARNING 'public.stars_ledger lacks column "%" used by the client — stars awards/admin grants will fail', r.col;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = 'stars_ledger'
      AND ic.column_name IN ('user_id', 'source_id', 'date', 'stars')
      AND ic.is_nullable = 'NO' AND ic.column_default IS NULL
  ) THEN
    RAISE WARNING 'public.stars_ledger has NOT NULL legacy columns (supabase_habits_full.sql schema) that the client never sends';
  END IF;
END $$;

COMMIT;
