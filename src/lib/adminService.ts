import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';

export type AdminRole = 'owner' | 'admin' | 'support' | 'content' | 'analyst';

export const ADMIN_ROLES: readonly AdminRole[] = ['owner', 'admin', 'support', 'content', 'analyst'];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

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
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload_json: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export type PromoType = 'percent' | 'fixed' | 'pro_days' | 'stars';

export const PROMO_TYPES: readonly PromoType[] = ['stars', 'pro_days', 'percent', 'fixed'];

export interface PromoCode {
  id: string;
  code: string;
  type: PromoType;
  value: number;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  rules_json: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

/** Fields an admin may set when creating a promo code (server fills id/used_count/created_at). */
export interface PromoCodeInput {
  code: string;
  type: PromoType;
  value: number;
  expires_at: string | null;
  max_uses: number | null;
  is_active: boolean;
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

export interface AdminKPIs {
  total_users: number;
  pro_users: number;
  active_7d: number;
  stars_granted: number;
  promo_used: number;
}

// ── Access matrix ─────────────────────────────────────────────────────────────
// Mirrors the server-side checks in supabase/migrations/20261013_security_hardening.sql
// (jf_assert_staff role lists + promo_codes policies). The server stays authoritative;
// the client uses this only to hide what would be rejected anyway.

export type AdminSection =
  | 'dashboard'
  | 'users'
  | 'stars'
  | 'promos'
  | 'subscriptions'
  | 'analytics'
  | 'roles'
  | 'audit'
  | 'settings';

export const ADMIN_SECTION_ROLES: Readonly<Record<AdminSection, readonly AdminRole[]>> = {
  dashboard: ['owner', 'admin', 'support', 'content', 'analyst'],
  users: ['owner', 'admin', 'support'],
  stars: ['owner', 'admin', 'support'],
  promos: ['owner', 'admin', 'support'],
  subscriptions: ['owner', 'admin'],
  analytics: ['owner', 'admin', 'analyst'],
  roles: ['owner'],
  audit: ['owner', 'admin'],
  settings: ['owner'],
};

export function canAccessAdminSection(role: AdminRole | null | undefined, section: AdminSection): boolean {
  return !!role && ADMIN_SECTION_ROLES[section].includes(role);
}

/** Max |delta| of one admin_grant_stars call for the support role (enforced by the server). */
export const SUPPORT_MAX_STARS_PER_GRANT = 100;
/** Sanity bound for owner/admin grants (fat-finger guard; stars_ledger.delta is int4). */
export const ADMIN_MAX_STARS_PER_GRANT = 1_000_000;

export interface AdminPermissions {
  canGrantStars: boolean;
  maxStarsPerGrant: number;
  canManagePro: boolean;
  canBan: boolean;
  canManagePromos: boolean;
  canManageRoles: boolean;
}

export function getAdminPermissions(role: AdminRole | null | undefined): AdminPermissions {
  const staff = role === 'owner' || role === 'admin';
  const support = role === 'support';
  return {
    canGrantStars: staff || support,
    maxStarsPerGrant: support ? SUPPORT_MAX_STARS_PER_GRANT : staff ? ADMIN_MAX_STARS_PER_GRANT : 0,
    canManagePro: staff,
    canBan: staff || support,
    canManagePromos: staff || support,
    canManageRoles: role === 'owner',
  };
}

// ── Errors ────────────────────────────────────────────────────────────────────

/** Error thrown by this service; `message` is already user-facing Russian text. */
export class AdminServiceError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'AdminServiceError';
    this.code = code;
  }
}

function readErrorFields(error: unknown): { message: string; code: string | null; details: string } {
  if (error == null) return { message: '', code: null, details: '' };
  if (typeof error === 'string') return { message: error, code: null, details: '' };
  if (typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown; details?: unknown };
    return {
      message: typeof e.message === 'string' ? e.message : '',
      code: typeof e.code === 'string' && e.code ? e.code : null,
      details: typeof e.details === 'string' ? e.details : '',
    };
  }
  return { message: String(error), code: null, details: '' };
}

/**
 * Maps Supabase/Postgres errors of the admin RPCs and tables to Russian, user-facing text.
 * Unknown errors keep their original text after the fallback so admins can still report them.
 */
export function translateAdminError(error: unknown, fallback = 'Не удалось выполнить действие'): string {
  if (error instanceof AdminServiceError) return error.message;
  const { message, code, details } = readErrorFields(error);
  const text = `${message} ${details}`.trim();

  const supportCap = /support role can grant max (\d+)/i.exec(text);
  if (supportCap) return `Роль «Поддержка» может начислить не более ${supportCap[1]} ⭐ за раз`;
  if (/actor does not match/i.test(text)) {
    return 'Сессия не совпадает с текущим пользователем. Обновите страницу и войдите снова';
  }
  if (/authentication required|jwt expired|invalid jwt/i.test(text) || code === 'PGRST301') {
    return 'Сессия истекла. Войдите в аккаунт снова';
  }
  if (/cannot remove owner role/i.test(text)) return 'Роль владельца нельзя удалить';
  if (/user not found/i.test(text) || code === 'P0002') return 'Пользователь не найден';
  if (code === '23503') return 'Пользователь с таким ID не найден';
  if (/invalid input syntax for type uuid/i.test(text)) return 'Некорректный ID пользователя: нужен UUID';
  if (/invalid input value for enum/i.test(text)) return 'Недопустимое значение роли';
  if (code === '23505') {
    return /promo/i.test(text) || /\(code\)/i.test(text)
      ? 'Промокод с таким кодом уже существует'
      : 'Такая запись уже существует';
  }
  if (code === '42501' || /insufficient permissions|access denied|permission denied|row-level security/i.test(text)) {
    return 'Недостаточно прав для этого действия';
  }
  if (code === '23514') return 'Значение не прошло проверку на сервере';
  if (code === '22023' || /invalid arguments/i.test(text)) return 'Некорректные данные запроса';
  if (code === 'PGRST202' || /could not find the function/i.test(text)) {
    return 'Функция не найдена на сервере. Примените миграции базы данных';
  }
  if (/failed to fetch|network ?error|load failed|fetch failed/i.test(text)) {
    return 'Нет соединения с сервером. Проверьте интернет';
  }
  return message ? `${fallback}: ${message}` : fallback;
}

function toAdminError(error: unknown, fallback?: string): AdminServiceError {
  if (error instanceof AdminServiceError) return error;
  return new AdminServiceError(translateAdminError(error, fallback), readErrorFields(error).code);
}

/** User-facing text for anything caught around an admin call. */
export function adminErrorMessage(error: unknown, fallback?: string): string {
  return translateAdminError(error, fallback);
}

// ── Input validation ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return UUID_RE.test((value ?? '').trim());
}

/** Max length of the "reason" written to audit_log / stars_ledger by admin actions. */
export const ADMIN_REASON_MAX = 500;

/** Trimmed reason, or null when it is empty. Over-long input is cut to ADMIN_REASON_MAX. */
export function normalizeAdminReason(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  return Array.from(trimmed).slice(0, ADMIN_REASON_MAX).join('').trim();
}

export type Validated<T> = { value: T; error: null } | { value: null; error: string };

/** Parses the amount of an admin star grant: non-zero integer within the role's cap. */
export function parseStarsDelta(raw: string, role: AdminRole | null | undefined): Validated<number> {
  const text = (raw ?? '').trim().replace(/\s+/g, '');
  if (!/^[+-]?\d+$/.test(text)) return { value: null, error: 'Введите целое число звёзд' };
  const value = Number(text);
  if (!Number.isSafeInteger(value)) return { value: null, error: 'Слишком большое число' };
  if (value === 0) return { value: null, error: 'Количество не может быть нулём' };
  const { canGrantStars, maxStarsPerGrant } = getAdminPermissions(role);
  if (!canGrantStars) return { value: null, error: 'Недостаточно прав для начисления звёзд' };
  if (Math.abs(value) > maxStarsPerGrant) {
    return {
      value: null,
      error: role === 'support'
        ? `Роль «Поддержка» может начислить не более ${maxStarsPerGrant} ⭐ за раз`
        : `Не более ${maxStarsPerGrant.toLocaleString('ru-RU')} ⭐ за одну операцию`,
    };
  }
  return { value, error: null };
}

export const PROMO_CODE_RE = /^[A-Z0-9_-]{3,32}$/;

export const PROMO_VALUE_LIMITS: Readonly<Record<PromoType, { min: number; max: number; integer: boolean; unit: string }>> = {
  percent: { min: 1, max: 100, integer: true, unit: '%' },
  fixed: { min: 1, max: 1_000_000, integer: false, unit: '₽' },
  pro_days: { min: 1, max: 3650, integer: true, unit: 'дн.' },
  stars: { min: 1, max: 100_000, integer: true, unit: '⭐' },
};

export interface PromoFormValues {
  code: string;
  type: PromoType;
  value: string;
  /** `YYYY-MM-DD` from <input type="date">, or '' for "never expires". */
  expires_at: string;
  max_uses: string;
}

/** Non-negative decimal from user input; accepts "," as decimal separator. NaN when invalid. */
export function parseDecimalInput(raw: string | null | undefined): number {
  const text = (raw ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return Number.NaN;
  return Number(text);
}

/**
 * `YYYY-MM-DD` (local calendar day) → ISO timestamp of the END of that local day, so a code
 * "valid until 20 Oct" works through 20 Oct in the admin's time zone. Null when invalid.
 */
export function endOfLocalDayIso(dateStr: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, 23, 59, 59, 999);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.toISOString();
}

export function validatePromoForm(form: PromoFormValues, now: Date = new Date()): Validated<PromoCodeInput> {
  const code = (form.code ?? '').trim().toUpperCase();
  if (!PROMO_CODE_RE.test(code)) {
    return { value: null, error: 'Код: 3–32 символа, только латинские буквы, цифры, «-» и «_»' };
  }
  const limits = PROMO_VALUE_LIMITS[form.type];
  if (!limits) return { value: null, error: 'Выберите тип промокода' };

  const value = parseDecimalInput(form.value);
  if (!Number.isFinite(value)) return { value: null, error: 'Значение должно быть положительным числом' };
  if (limits.integer && !Number.isInteger(value)) return { value: null, error: 'Значение должно быть целым числом' };
  if (!limits.integer && Math.round(value * 100) !== value * 100) {
    return { value: null, error: 'Не более двух знаков после запятой' };
  }
  if (value < limits.min || value > limits.max) {
    return { value: null, error: `Значение: от ${limits.min} до ${limits.max.toLocaleString('ru-RU')} ${limits.unit}` };
  }

  let maxUses: number | null = null;
  if ((form.max_uses ?? '').trim()) {
    const parsed = parseDecimalInput(form.max_uses);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
      return { value: null, error: 'Макс. активаций: целое число от 1 до 1 000 000 (или пусто — без ограничений)' };
    }
    maxUses = parsed;
  }

  let expiresAt: string | null = null;
  if ((form.expires_at ?? '').trim()) {
    expiresAt = endOfLocalDayIso(form.expires_at);
    if (!expiresAt) return { value: null, error: 'Некорректная дата истечения' };
    if (new Date(expiresAt).getTime() <= now.getTime()) {
      return { value: null, error: 'Дата истечения должна быть в будущем' };
    }
  }

  return {
    value: { code, type: form.type, value, expires_at: expiresAt, max_uses: maxUses, is_active: true },
    error: null,
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** date-fns `format` that never throws on null/invalid timestamps (renders "—"). */
export function formatAdminDate(value: string | null | undefined, pattern: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, pattern, { locale: ru });
}

/** "user/1a2b3c4d…" for an audit entry target, "—" when there is none. */
export function formatAuditTarget(entry: Pick<AuditEntry, 'target_type' | 'target_id'>): string {
  const id = entry.target_id ?? '';
  if (!id) return entry.target_type || '—';
  const shortId = id.length > 8 ? `${id.slice(0, 8)}…` : id;
  return entry.target_type ? `${entry.target_type}/${shortId}` : shortId;
}

// ── Role check ────────────────────────────────────────────────────────────────

/**
 * Staff role of the user, or null for a regular user.
 * Throws AdminServiceError when the check itself fails (network, RPC missing) so callers
 * can show an error instead of a false "access denied".
 */
export async function getUserAdminRole(userId: string): Promise<AdminRole | null> {
  if (!userId) return null;
  const { data, error } = await supabase.rpc('get_user_role', { _user_id: userId });
  if (error) throw toAdminError(error, 'Не удалось проверить права доступа');
  return isAdminRole(data) ? data : null;
}

// ── Dashboard KPIs ────────────────────────────────────────────────────────────

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getAdminKPIs(actorId: string): Promise<AdminKPIs> {
  const { data, error } = await supabase.rpc('admin_get_kpis', { p_actor_id: actorId });
  if (error) throw toAdminError(error, 'Не удалось загрузить показатели');
  const raw = (data ?? {}) as Partial<Record<keyof AdminKPIs, unknown>>;
  return {
    total_users: toCount(raw.total_users),
    pro_users: toCount(raw.pro_users),
    active_7d: toCount(raw.active_7d),
    stars_granted: toCount(raw.stars_granted),
    promo_used: toCount(raw.promo_used),
  };
}

// ── Users ─────────────────────────────────────────────────────────────────────

export const ADMIN_USERS_PAGE_SIZE = 50;
/** Server-side cap of admin_get_users p_limit. */
export const ADMIN_USERS_MAX_LIMIT = 500;
export const ADMIN_SEARCH_MAX = 100;

export async function getAdminUsers(
  actorId: string,
  opts: { search?: string; isPro?: boolean; limit?: number; offset?: number } = {}
): Promise<AdminUser[]> {
  const search = (opts.search ?? '').trim().slice(0, ADMIN_SEARCH_MAX);
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? ADMIN_USERS_PAGE_SIZE), 1), ADMIN_USERS_MAX_LIMIT);
  const offset = Math.max(Math.trunc(opts.offset ?? 0), 0);
  const { data, error } = await supabase.rpc('admin_get_users', {
    p_actor_id: actorId,
    p_search: search || null,
    p_is_pro: opts.isPro ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw toAdminError(error, 'Не удалось загрузить пользователей');
  return (data ?? []) as AdminUser[];
}

/** Appends a page of users, skipping ids already shown (offset pages shift when users sign up). */
export function mergeUniqueUsers(prev: AdminUser[], page: AdminUser[]): AdminUser[] {
  const seen = new Set(prev.map(u => u.user_id));
  const merged = prev.slice();
  for (const u of page) {
    if (!seen.has(u.user_id)) {
      seen.add(u.user_id);
      merged.push(u);
    }
  }
  return merged;
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
  if (error) throw toAdminError(error, 'Не удалось начислить звёзды');
}

export async function getStarsLedger(actorId: string, targetId?: string): Promise<StarLedgerEntry[]> {
  let query = supabase
    .from('stars_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (targetId) query = query.eq('target_user_id', targetId);
  const { data, error } = await query;
  if (error) throw toAdminError(error, 'Не удалось загрузить журнал звёзд');
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
  if (error) throw toAdminError(error, 'Не удалось изменить PRO');
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
  if (error) throw toAdminError(error, 'Не удалось изменить блокировку');
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function getAdminRoles(): Promise<AdminRoleEntry[]> {
  const { data, error } = await supabase
    .from('admin_roles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw toAdminError(error, 'Не удалось загрузить роли');
  return (data ?? []) as AdminRoleEntry[];
}

export async function adminSetRole(
  actorId: string,
  targetId: string,
  role: AdminRole,
  reason: string
) {
  const { error } = await supabase.rpc('admin_set_role', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_role: role,
    p_reason: reason,
  });
  if (error) throw toAdminError(error, 'Не удалось назначить роль');
}

export async function adminRemoveRole(
  actorId: string,
  targetId: string,
  role: AdminRole,
  reason: string
) {
  const { error } = await supabase.rpc('admin_remove_role', {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_role: role,
    p_reason: reason,
  });
  if (error) throw toAdminError(error, 'Не удалось удалить роль');
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
  if (error) throw toAdminError(error, 'Не удалось загрузить аудит-лог');
  return (data ?? []) as AuditEntry[];
}

// ── Promo codes ───────────────────────────────────────────────────────────────

export async function getPromoCodes(): Promise<PromoCode[]> {
  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw toAdminError(error, 'Не удалось загрузить промокоды');
  return (data ?? []) as PromoCode[];
}

/**
 * Inserts a promo code. Only whitelisted columns are sent: id, used_count and created_at
 * are server-owned and must never come from a form object.
 */
export async function createPromoCode(
  actorId: string,
  input: PromoCodeInput
): Promise<void> {
  const { error } = await supabase.from('promo_codes').insert({
    code: input.code,
    type: input.type,
    value: input.value,
    expires_at: input.expires_at,
    max_uses: input.max_uses,
    is_active: input.is_active,
    rules_json: {},
    created_by: actorId,
  });
  if (error) throw toAdminError(error, 'Не удалось создать промокод');
}

export async function togglePromoCode(id: string, isActive: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('promo_codes')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('id');
  if (error) throw toAdminError(error, 'Не удалось изменить промокод');
  // RLS filters rows silently: no error but nothing updated.
  if (!data || data.length === 0) {
    throw new AdminServiceError('Промокод не найден или недостаточно прав для изменения', null);
  }
}
