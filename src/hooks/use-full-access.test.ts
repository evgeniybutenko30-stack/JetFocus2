import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

type Res = { data: unknown; error: unknown };

const m = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  profile: vi.fn<(userId: string) => Promise<Res>>(),
  role: vi.fn<(userId: string) => Promise<Res>>(),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: { user: { id: string } | null }) => T) => selector({ user: m.user }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      let uid = '';
      const builder = {
        select: () => builder,
        eq: (_col: string, val: string) => { uid = val; return builder; },
        maybeSingle: () => m.profile(uid),
      };
      return builder;
    },
    rpc: (_name: string, args: { _user_id: string }) => m.role(args._user_id),
  },
}));

import { resolveFullAccess, useFullAccess } from './use-full-access';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  m.user = { id: 'u1' };
  m.profile.mockReset();
  m.role.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('resolveFullAccess', () => {
  it('PRO or any staff role grants access', () => {
    expect(resolveFullAccess({ data: { is_pro: true }, error: null }, { data: null, error: null }))
      .toEqual({ hasAccess: true, isPro: true, isAdmin: false, error: false });
    expect(resolveFullAccess({ data: null, error: null }, { data: 'analyst', error: null }))
      .toEqual({ hasAccess: true, isPro: false, isAdmin: true, error: false });
    expect(resolveFullAccess({ data: { is_pro: false }, error: null }, { data: null, error: null }))
      .toEqual({ hasAccess: false, isPro: false, isAdmin: false, error: false });
  });

  it('a failed half counts as "no" and is flagged; unknown role strings are not staff', () => {
    expect(resolveFullAccess(null, { data: 'owner', error: null })).toEqual({ hasAccess: true, isPro: false, isAdmin: true, error: true });
    expect(resolveFullAccess({ data: { is_pro: true }, error: { message: 'x' } }, null))
      .toEqual({ hasAccess: false, isPro: false, isAdmin: false, error: true });
    expect(resolveFullAccess({ data: null, error: null }, { data: 'superuser', error: null }).isAdmin).toBe(false);
  });
});

describe('useFullAccess', () => {
  it('resolves to the access of the signed-in user', async () => {
    m.profile.mockResolvedValue({ data: { is_pro: true }, error: null });
    m.role.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useFullAccess());
    expect(result.current.hasAccess).toBeNull();
    await waitFor(() => expect(result.current.hasAccess).toBe(true));
    expect(result.current.isPro).toBe(true);
  });

  it('does not stay "loading" forever when a request rejects', async () => {
    m.profile.mockRejectedValue(new Error('network'));
    m.role.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useFullAccess());
    await waitFor(() => expect(result.current.hasAccess).toBe(false));
    expect(result.current.error).toBe(true);
  });

  it('a missing profile row (null data) means no PRO, not an error', async () => {
    m.profile.mockResolvedValue({ data: null, error: null });
    m.role.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useFullAccess());
    await waitFor(() => expect(result.current.hasAccess).toBe(false));
    expect(result.current.error).toBe(false);
  });

  it('guests have no access without any request', () => {
    m.user = null;
    const { result } = renderHook(() => useFullAccess());
    expect(result.current.hasAccess).toBe(false);
    expect(m.profile).not.toHaveBeenCalled();
  });

  it('a slow answer for the previous account never overwrites the new account', async () => {
    const slowU1 = deferred<Res>();
    m.profile.mockImplementation(uid => (uid === 'u1' ? slowU1.promise : Promise.resolve({ data: { is_pro: false }, error: null })));
    m.role.mockResolvedValue({ data: null, error: null });

    const { result, rerender } = renderHook(() => useFullAccess());
    m.user = { id: 'u2' };
    rerender();
    await waitFor(() => expect(result.current.hasAccess).toBe(false));

    await act(async () => { slowU1.resolve({ data: { is_pro: true }, error: null }); });
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.isPro).toBe(false);
  });
});
