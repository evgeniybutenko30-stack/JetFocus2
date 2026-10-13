import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockResult = { data?: unknown; error?: { message: string; code?: string; details?: string } | null };
interface Call { table: string; op: string; payload?: unknown; filters: [string, unknown][]; selected?: string }

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: m.rpc, from: m.from } }));

import {
  ADMIN_MAX_STARS_PER_GRANT,
  ADMIN_SECTION_ROLES,
  AdminServiceError,
  adminGrantStars,
  canAccessAdminSection,
  createPromoCode,
  endOfLocalDayIso,
  formatAdminDate,
  formatAuditTarget,
  getAdminKPIs,
  getAdminPermissions,
  getAdminUsers,
  getUserAdminRole,
  isAdminRole,
  isUuid,
  mergeUniqueUsers,
  normalizeAdminReason,
  parseDecimalInput,
  parseStarsDelta,
  togglePromoCode,
  translateAdminError,
  validatePromoForm,
  type AdminRole,
  type AdminUser,
  type PromoFormValues,
} from './adminService';

let calls: Call[] = [];
let responder: (call: Call) => MockResult = () => ({ data: [], error: null });

function makeBuilder(table: string) {
  const call: Call = { table, op: '', filters: [] };
  const builder = {
    select: (cols?: string) => { call.selected = cols; return builder; },
    insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; },
    update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return builder; },
    eq: (col: string, val: unknown) => { call.filters.push([col, val]); return builder; },
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) => {
      if (!call.op) call.op = 'select';
      calls.push(call);
      const res = responder(call);
      return Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(resolve, reject);
    },
  };
  return builder;
}

beforeEach(() => {
  calls = [];
  responder = () => ({ data: [], error: null });
  m.rpc.mockReset();
  m.from.mockReset();
  m.from.mockImplementation((table: string) => makeBuilder(table));
});

const ALL_ROLES: AdminRole[] = ['owner', 'admin', 'support', 'content', 'analyst'];

describe('access matrix (mirrors the SQL role checks)', () => {
  it('isAdminRole accepts only known staff roles', () => {
    for (const r of ALL_ROLES) expect(isAdminRole(r)).toBe(true);
    expect(isAdminRole('moderator')).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole('')).toBe(false);
  });

  it('roles and settings are owner-only', () => {
    for (const r of ALL_ROLES) {
      expect(canAccessAdminSection(r, 'roles')).toBe(r === 'owner');
      expect(canAccessAdminSection(r, 'settings')).toBe(r === 'owner');
    }
  });

  it('support can open users/stars/promos but not roles, audit or subscriptions', () => {
    expect(canAccessAdminSection('support', 'users')).toBe(true);
    expect(canAccessAdminSection('support', 'stars')).toBe(true);
    expect(canAccessAdminSection('support', 'promos')).toBe(true);
    expect(canAccessAdminSection('support', 'roles')).toBe(false);
    expect(canAccessAdminSection('support', 'audit')).toBe(false);
    expect(canAccessAdminSection('support', 'subscriptions')).toBe(false);
  });

  it('content/analyst cannot list users (admin_get_users is owner/admin/support)', () => {
    expect(canAccessAdminSection('content', 'users')).toBe(false);
    expect(canAccessAdminSection('analyst', 'users')).toBe(false);
    expect(canAccessAdminSection('analyst', 'analytics')).toBe(true);
  });

  it('every staff role sees the dashboard; nobody without a role sees anything', () => {
    for (const r of ALL_ROLES) expect(canAccessAdminSection(r, 'dashboard')).toBe(true);
    for (const section of Object.keys(ADMIN_SECTION_ROLES) as (keyof typeof ADMIN_SECTION_ROLES)[]) {
      expect(canAccessAdminSection(null, section)).toBe(false);
    }
  });

  it('permissions: PRO owner/admin, ban+grant owner/admin/support, support capped at 100', () => {
    expect(getAdminPermissions('support')).toMatchObject({ canGrantStars: true, maxStarsPerGrant: 100, canManagePro: false, canBan: true, canManageRoles: false });
    expect(getAdminPermissions('admin')).toMatchObject({ canGrantStars: true, canManagePro: true, canBan: true, canManageRoles: false });
    expect(getAdminPermissions('owner').canManageRoles).toBe(true);
    expect(getAdminPermissions('analyst')).toMatchObject({ canGrantStars: false, canBan: false, canManagePro: false, canManagePromos: false });
    expect(getAdminPermissions(null).canGrantStars).toBe(false);
  });
});

describe('translateAdminError', () => {
  it('maps the server errors of the hardened admin RPCs to Russian', () => {
    expect(translateAdminError({ message: 'Access denied: insufficient permissions', code: '42501' })).toBe('Недостаточно прав для этого действия');
    expect(translateAdminError({ message: 'Support role can grant max 100 stars at once', code: '42501' })).toBe('Роль «Поддержка» может начислить не более 100 ⭐ за раз');
    expect(translateAdminError({ message: 'User not found', code: 'P0002' })).toBe('Пользователь не найден');
    expect(translateAdminError({ message: 'Cannot remove owner role', code: '42501' })).toBe('Роль владельца нельзя удалить');
    expect(translateAdminError({ message: 'Access denied: authentication required', code: '42501' })).toBe('Сессия истекла. Войдите в аккаунт снова');
    expect(translateAdminError({ message: 'Access denied: actor does not match the signed-in user', code: '42501' })).toMatch(/Обновите страницу/);
  });

  it('maps common Postgres / network errors', () => {
    expect(translateAdminError({ message: 'invalid input syntax for type uuid: "abc"', code: '22P02' })).toBe('Некорректный ID пользователя: нужен UUID');
    expect(translateAdminError({
      message: 'duplicate key value violates unique constraint "promo_codes_code_key"',
      code: '23505',
      details: 'Key (code)=(JET50) already exists.',
    })).toBe('Промокод с таким кодом уже существует');
    expect(translateAdminError({ message: 'new row violates row-level security policy for table "promo_codes"', code: '42501' })).toBe('Недостаточно прав для этого действия');
    expect(translateAdminError({ message: 'insert or update on table "admin_roles" violates foreign key constraint', code: '23503' })).toBe('Пользователь с таким ID не найден');
    expect(translateAdminError(new TypeError('Failed to fetch'))).toBe('Нет соединения с сервером. Проверьте интернет');
  });

  it('keeps unknown messages behind the fallback and handles empty input', () => {
    expect(translateAdminError({ message: 'boom' }, 'Не удалось')).toBe('Не удалось: boom');
    expect(translateAdminError(null, 'Не удалось')).toBe('Не удалось');
    expect(translateAdminError(new AdminServiceError('Готовый текст'))).toBe('Готовый текст');
  });
});

describe('input validation', () => {
  it('isUuid', () => {
    expect(isUuid('1b4e28ba-2fa1-11d2-883f-0016d3cca427')).toBe(true);
    expect(isUuid('  1B4E28BA-2FA1-11D2-883F-0016D3CCA427 ')).toBe(true);
    expect(isUuid('1b4e28ba')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it('normalizeAdminReason trims, rejects blank and caps the length', () => {
    expect(normalizeAdminReason('  bonus  ')).toBe('bonus');
    expect(normalizeAdminReason('   ')).toBeNull();
    expect(normalizeAdminReason(undefined)).toBeNull();
    expect(normalizeAdminReason('x'.repeat(600))).toHaveLength(500);
  });

  it('parseStarsDelta requires a non-zero integer', () => {
    expect(parseStarsDelta('50', 'admin')).toEqual({ value: 50, error: null });
    expect(parseStarsDelta(' -20 ', 'admin')).toEqual({ value: -20, error: null });
    expect(parseStarsDelta('+5', 'owner')).toEqual({ value: 5, error: null });
    expect(parseStarsDelta('0', 'admin').error).toMatch(/нулём/);
    expect(parseStarsDelta('1.5', 'admin').error).toMatch(/целое/);
    expect(parseStarsDelta('1e3', 'admin').error).toMatch(/целое/);
    expect(parseStarsDelta('', 'admin').error).toMatch(/целое/);
    expect(parseStarsDelta('abc', 'admin').error).toMatch(/целое/);
  });

  it('parseStarsDelta enforces the support cap in both directions and a sanity cap for admins', () => {
    expect(parseStarsDelta('100', 'support').value).toBe(100);
    expect(parseStarsDelta('101', 'support').error).toMatch(/не более 100/);
    expect(parseStarsDelta('-101', 'support').error).toMatch(/не более 100/);
    expect(parseStarsDelta(String(ADMIN_MAX_STARS_PER_GRANT), 'admin').value).toBe(ADMIN_MAX_STARS_PER_GRANT);
    expect(parseStarsDelta(String(ADMIN_MAX_STARS_PER_GRANT + 1), 'admin').error).not.toBeNull();
    expect(parseStarsDelta('99999999999999999999', 'owner').error).not.toBeNull();
    expect(parseStarsDelta('10', 'analyst').error).toMatch(/прав/);
  });

  it('parseDecimalInput accepts comma decimals and rejects junk/negatives', () => {
    expect(parseDecimalInput('12,5')).toBe(12.5);
    expect(parseDecimalInput(' 1 000 ')).toBe(1000);
    expect(parseDecimalInput('-5')).toBeNaN();
    expect(parseDecimalInput('5abc')).toBeNaN();
    expect(parseDecimalInput('')).toBeNaN();
  });

  it('endOfLocalDayIso returns the end of the local calendar day and rejects impossible dates', () => {
    const iso = endOfLocalDayIso('2026-10-20');
    expect(iso).not.toBeNull();
    const d = new Date(iso as string);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 20, 23, 59]);
    expect(endOfLocalDayIso('2026-02-31')).toBeNull();
    expect(endOfLocalDayIso('20.10.2026')).toBeNull();
  });
});

describe('validatePromoForm', () => {
  const now = new Date(2026, 9, 13, 12, 0, 0);
  const base: PromoFormValues = { code: 'jet-50', type: 'stars', value: '50', expires_at: '', max_uses: '' };

  it('normalises a valid form into an insert payload without server-owned fields', () => {
    const res = validatePromoForm(base, now);
    expect(res.error).toBeNull();
    expect(res.value).toEqual({ code: 'JET-50', type: 'stars', value: 50, expires_at: null, max_uses: null, is_active: true });
    expect(res.value).not.toHaveProperty('id');
    expect(res.value).not.toHaveProperty('used_count');
    expect(res.value).not.toHaveProperty('created_at');
  });

  it('validates the code format', () => {
    expect(validatePromoForm({ ...base, code: 'ab' }, now).error).toMatch(/Код/);
    expect(validatePromoForm({ ...base, code: 'СКИДКА' }, now).error).toMatch(/Код/);
    expect(validatePromoForm({ ...base, code: 'A B C' }, now).error).toMatch(/Код/);
    expect(validatePromoForm({ ...base, code: 'X'.repeat(33) }, now).error).toMatch(/Код/);
  });

  it('validates value ranges per type', () => {
    expect(validatePromoForm({ ...base, type: 'percent', value: '101' }, now).error).toMatch(/от 1 до 100/);
    expect(validatePromoForm({ ...base, type: 'percent', value: '0' }, now).error).not.toBeNull();
    expect(validatePromoForm({ ...base, type: 'percent', value: '15' }, now).value?.value).toBe(15);
    expect(validatePromoForm({ ...base, type: 'pro_days', value: '7,5' }, now).error).toMatch(/целым/);
    expect(validatePromoForm({ ...base, type: 'fixed', value: '199,99' }, now).value?.value).toBe(199.99);
    expect(validatePromoForm({ ...base, type: 'fixed', value: '1,999' }, now).error).toMatch(/двух знаков/);
    expect(validatePromoForm({ ...base, value: '-5' }, now).error).toMatch(/положительным/);
    expect(validatePromoForm({ ...base, value: 'abc' }, now).error).toMatch(/положительным/);
  });

  it('validates max uses', () => {
    expect(validatePromoForm({ ...base, max_uses: '10' }, now).value?.max_uses).toBe(10);
    expect(validatePromoForm({ ...base, max_uses: '0' }, now).error).toMatch(/активаций/);
    expect(validatePromoForm({ ...base, max_uses: '2.5' }, now).error).toMatch(/активаций/);
  });

  it('requires the expiry date to be in the future and keeps the whole chosen day', () => {
    expect(validatePromoForm({ ...base, expires_at: '2026-10-12' }, now).error).toMatch(/в будущем/);
    const today = validatePromoForm({ ...base, expires_at: '2026-10-13' }, now);
    expect(today.error).toBeNull();
    expect(new Date(today.value?.expires_at as string).getDate()).toBe(13);
    expect(validatePromoForm({ ...base, expires_at: '2026-13-01' }, now).error).toMatch(/Некорректная дата/);
  });
});

describe('formatting helpers', () => {
  it('formatAdminDate never throws on bad timestamps', () => {
    expect(formatAdminDate(null, 'd MMM')).toBe('—');
    expect(formatAdminDate('not a date', 'd MMM')).toBe('—');
    expect(formatAdminDate('2026-10-13T10:00:00Z', 'yyyy')).toBe('2026');
  });

  it('formatAuditTarget handles missing ids', () => {
    expect(formatAuditTarget({ target_type: 'user', target_id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427' })).toBe('user/1b4e28ba…');
    expect(formatAuditTarget({ target_type: 'user', target_id: null })).toBe('user');
    expect(formatAuditTarget({ target_type: null, target_id: null })).toBe('—');
    expect(formatAuditTarget({ target_type: null, target_id: 'abc' })).toBe('abc');
  });

  it('mergeUniqueUsers appends a page without duplicate ids', () => {
    const u = (id: string) => ({ user_id: id } as AdminUser);
    expect(mergeUniqueUsers([u('a'), u('b')], [u('b'), u('c'), u('c')]).map(x => x.user_id)).toEqual(['a', 'b', 'c']);
  });
});

describe('service calls', () => {
  it('getUserAdminRole returns the role, null for non-staff/unknown values, and throws on RPC errors', async () => {
    m.rpc.mockResolvedValueOnce({ data: 'support', error: null });
    await expect(getUserAdminRole('u1')).resolves.toBe('support');
    expect(m.rpc).toHaveBeenCalledWith('get_user_role', { _user_id: 'u1' });

    m.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(getUserAdminRole('u1')).resolves.toBeNull();

    m.rpc.mockResolvedValueOnce({ data: 'superuser', error: null });
    await expect(getUserAdminRole('u1')).resolves.toBeNull();

    // A failed check must not look like "no role" (false "access denied").
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    await expect(getUserAdminRole('u1')).rejects.toBeInstanceOf(AdminServiceError);
  });

  it('admin RPC errors are thrown as Error instances with Russian text', async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Support role can grant max 100 stars at once', code: '42501' } });
    const err = await adminGrantStars('actor', 'target', 500, 'r').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as AdminServiceError).message).toBe('Роль «Поддержка» может начислить не более 100 ⭐ за раз');
    expect((err as AdminServiceError).code).toBe('42501');
    expect(m.rpc).toHaveBeenCalledWith('admin_grant_stars', { p_actor_id: 'actor', p_target_id: 'target', p_delta: 500, p_reason: 'r' });
  });

  it('getAdminKPIs coerces missing/invalid numbers to 0', async () => {
    m.rpc.mockResolvedValueOnce({ data: { total_users: 10, pro_users: '3', active_7d: null }, error: null });
    await expect(getAdminKPIs('actor')).resolves.toEqual({ total_users: 10, pro_users: 3, active_7d: 0, stars_granted: 0, promo_used: 0 });
  });

  it('getAdminUsers trims the search and clamps limit/offset', async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(getAdminUsers('actor', { search: '   ', limit: 10_000, offset: -5 })).resolves.toEqual([]);
    expect(m.rpc).toHaveBeenCalledWith('admin_get_users', {
      p_actor_id: 'actor', p_search: null, p_is_pro: null, p_limit: 500, p_offset: 0,
    });
  });

  it('createPromoCode sends only whitelisted columns', async () => {
    const formObject = {
      code: 'JET50', type: 'stars' as const, value: 50, expires_at: null, max_uses: null, is_active: true,
      // fields a careless caller might pass along from a PromoCode object:
      id: 'should-not-be-sent', used_count: 99, created_at: '2020-01-01',
    };
    await createPromoCode('actor', formObject);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('promo_codes');
    expect(calls[0].payload).toEqual({
      code: 'JET50', type: 'stars', value: 50, expires_at: null, max_uses: null, is_active: true,
      rules_json: {}, created_by: 'actor',
    });
  });

  it('createPromoCode reports a duplicate code in Russian', async () => {
    responder = () => ({ error: { message: 'duplicate key value violates unique constraint "promo_codes_code_key"', code: '23505' } });
    await expect(createPromoCode('actor', { code: 'JET50', type: 'stars', value: 1, expires_at: null, max_uses: null, is_active: true }))
      .rejects.toThrow('Промокод с таким кодом уже существует');
  });

  it('togglePromoCode fails loudly when RLS silently updated nothing', async () => {
    responder = () => ({ data: [], error: null });
    await expect(togglePromoCode('p1', false)).rejects.toThrow(/недостаточно прав/);
    expect(calls[0]).toMatchObject({ table: 'promo_codes', op: 'update', payload: { is_active: false }, filters: [['id', 'p1']] });

    responder = () => ({ data: [{ id: 'p1' }], error: null });
    await expect(togglePromoCode('p1', true)).resolves.toBeUndefined();

    responder = () => ({ error: { message: 'permission denied for table promo_codes', code: '42501' } });
    await expect(togglePromoCode('p1', true)).rejects.toThrow('Недостаточно прав для этого действия');
  });
});
