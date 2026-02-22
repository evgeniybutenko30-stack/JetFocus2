import { supabase } from '@/lib/supabase';

export type AdminRole = 'owner' | 'admin' | 'support' | 'content' | 'analyst';

export interface AdminUser {
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_pro: boolean;
  is_banned: boolean;
  stars_balance: number;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor_user_id: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  payload_json: Record<string, unknown>;
  reason: string;
  created_at: string;
}

export interface PromoCode {
  id: string;
  code: string;
  type: 'percent' | 'fixed' | 'pro_days' | 'stars';
  value: number;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  rules_json: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface AdminRoleEntry {
  id: string;
  user_id: string;
  role: AdminRole;
  granted_by: string | null;
  created_at: string;
}

export interface StarLedgerEntry {
  id: string;
  actor_user_id: string | null;
  target_user_id: string;
  delta: number;
  reason: string | null;
  source: string;
  created_at: string;
}

// ── Role check ────────────────────────────────────────────────────────────────

export async function getUserAdminRole(userId: string): Promise<AdminRole | null> {
  const { data } = await supabase.rpc('get_user_role', { _user_id: userId });
  return (data as AdminRole) ?? null;
}

// ── Dashboard KPIs ────────────────────────────────────────────────────────────

export async function getAdminKPIs(actorId: string) {
  const { data, error } = await supabase.rpc('admin_get_kpis', { p_actor_id: actorId });
  if (error) throw error;
  return data as {
    total_users: number;
    pro_users: number;
    active_7d: number;
    stars_granted: number;
    promo_used: number;
  };
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getAdminUsers(
  actorId: string,
  opts: { search?: string; isPro?: boolean; limit?: number; offset?: number } = {}
): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_get_users', {
    p_actor_id: actorId,
    p_search: opts.search ?? null,
    p_is_pro: opts.isPro ?? null,
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as AdminUser[];
}

// ── Stars ─────────────────────────────────────────────────────────────────────

export async function adminGrantStars(
  actorId: string,
  targetId: string,
  delta: number,
  reason: string
) {
  const { error } = await supabase.rpc('admin_grant_stars', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function getStarsLedger(actorId: string, targetId?: string): Promise<StarLedgerEntry[]> {
  let query = supabase
    .from('stars_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (targetId) query = query.eq('target_user_id', targetId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as StarLedgerEntry[];
}

// ── PRO / Ban ─────────────────────────────────────────────────────────────────

export async function adminSetPro(
  actorId: string,
  targetId: string,
  isPro: boolean,
  reason: string
) {
  const { error } = await supabase.rpc('admin_set_pro', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_is_pro: isPro,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function adminSetBan(
  actorId: string,
  targetId: string,
  isBanned: boolean,
  reason: string
) {
  const { error } = await supabase.rpc('admin_set_ban', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_is_banned: isBanned,
    p_reason: reason,
  });
  if (error) throw error;
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function getAdminRoles(): Promise<AdminRoleEntry[]> {
  const { data, error } = await supabase
    .from('admin_roles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminRoleEntry[];
}

export async function adminSetRole(
  actorId: string,
  targetId: string,
  role: string,
  reason: string
) {
  const { error } = await supabase.rpc('admin_set_role', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_role: role,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function adminRemoveRole(
  actorId: string,
  targetId: string,
  role: string,
  reason: string
) {
  const { error } = await supabase.rpc('admin_remove_role', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_role: role,
    p_reason: reason,
  });
  if (error) throw error;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function getAuditLog(
  opts: { action?: string; actorId?: string; limit?: number } = {}
): Promise<AuditEntry[]> {
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.action) query = query.eq('action', opts.action);
  if (opts.actorId) query = query.eq('actor_user_id', opts.actorId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

// ── Promo codes ───────────────────────────────────────────────────────────────

export async function getPromoCodes(): Promise<PromoCode[]> {
  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PromoCode[];
}

export async function createPromoCode(
  actorId: string,
  code: PromoCode
): Promise<void> {
  const { error } = await supabase.from('promo_codes').insert({
    ...code,
    created_by: actorId,
  });
  if (error) throw error;
}

export async function togglePromoCode(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('promo_codes')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw error;
}
