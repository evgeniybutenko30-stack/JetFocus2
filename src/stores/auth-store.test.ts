import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';

type QueryResult = { data: unknown; error: { message: string } | null };

interface Builder extends PromiseLike<QueryResult> {
  select: () => Builder;
  eq: () => Builder;
  update: (payload: unknown) => Builder;
  upsert: () => Builder;
  maybeSingle: () => Promise<QueryResult>;
}

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    auth: {
      signOut: mocks.signOut,
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
    },
  },
}));

import { useAuthStore } from './auth-store';

function builder(result: QueryResult | Promise<QueryResult>, onUpdate?: (payload: unknown) => void): Builder {
  const promise = Promise.resolve(result);
  const b: Builder = {
    select: () => b,
    eq: () => b,
    update: (payload) => {
      onUpdate?.(payload);
      return b;
    },
    upsert: () => b,
    maybeSingle: () => promise,
    then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
  };
  return b;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function makeUser(id: string, email = `${id}@example.com`): User {
  return {
    id,
    email,
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    app_metadata: {},
    user_metadata: {},
  } as User;
}

function makeSession(user: User): Session {
  return {
    user,
    access_token: `token-${user.id}-${Math.random()}`,
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
  } as Session;
}

/** Default tables: profile with a name per user id, empty stats/referrals. */
function mockTables(profiles: Record<string, () => QueryResult | Promise<QueryResult>>) {
  let currentUserId = '';
  mocks.from.mockImplementation((table: string) => {
    if (table === 'user_profiles') {
      const make = profiles[currentUserId];
      return builder(make ? make() : { data: null, error: null });
    }
    return builder({ data: null, error: null });
  });
  return {
    setCurrentUser: (id: string) => { currentUserId = id; },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const initialState = useAuthStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  useAuthStore.setState({ ...initialState }, true);
});

describe('auth store session lifecycle', () => {
  it('finishes loading and loads the profile for a new session', async () => {
    const tables = mockTables({ a: () => ({ data: { display_name: 'Анна', avatar_url: 'https://x/a.png', stars_balance: 12 }, error: null }) });
    tables.setCurrentUser('a');
    const user = makeUser('a');

    useAuthStore.getState().setSession(makeSession(user));
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().displayName).toBe('a'); // email prefix until the profile arrives

    await flush();
    await flush();
    const s = useAuthStore.getState();
    expect(s.displayName).toBe('Анна');
    expect(s.avatarUrl).toBe('https://x/a.png');
    expect(s.stars).toBe(12);
  });

  it('keeps the same user reference and does not reload on token refresh', async () => {
    const tables = mockTables({ a: () => ({ data: { display_name: 'Анна' }, error: null }) });
    tables.setCurrentUser('a');
    useAuthStore.getState().setSession(makeSession(makeUser('a')));
    await flush();
    const firstUser = useAuthStore.getState().user;
    mocks.from.mockClear();

    // TOKEN_REFRESHED delivers a brand-new but identical User object
    useAuthStore.getState().setSession(makeSession(makeUser('a')));
    await flush();

    expect(useAuthStore.getState().user).toBe(firstUser);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('resets all profile data on sign-out / session expiry', async () => {
    const tables = mockTables({ a: () => ({ data: { display_name: 'Анна', avatar_url: 'https://x/a.png', stars_balance: 50 }, error: null }) });
    tables.setCurrentUser('a');
    useAuthStore.getState().setSession(makeSession(makeUser('a')));
    await flush();
    await flush();
    useAuthStore.getState().addXP(10);

    useAuthStore.getState().setSession(null);

    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.displayName).toBe('Гость');
    expect(s.avatarUrl).toBeNull();
    expect(s.stars).toBe(0);
    expect(s.xp).toBe(0);
    expect(s.level).toBe(1);
  });

  it('never applies a slow profile response of a previous account', async () => {
    const slowA = deferred<QueryResult>();
    const tables = mockTables({
      a: () => slowA.promise,
      b: () => ({ data: { display_name: 'Борис', stars_balance: 3 }, error: null }),
    });

    tables.setCurrentUser('a');
    useAuthStore.getState().setSession(makeSession(makeUser('a')));
    await flush(); // load for A is now in flight

    tables.setCurrentUser('b');
    useAuthStore.getState().setSession(makeSession(makeUser('b')));
    await flush();
    await flush();
    expect(useAuthStore.getState().displayName).toBe('Борис');

    // A's response finally arrives — it must be ignored.
    slowA.resolve({ data: { display_name: 'Анна', stars_balance: 999 }, error: null });
    await flush();
    await flush();
    const s = useAuthStore.getState();
    expect(s.user?.id).toBe('b');
    expect(s.displayName).toBe('Борис');
    expect(s.stars).toBe(3);
  });

  it('finishLoading ends the initial loading state without touching the session', () => {
    expect(useAuthStore.getState().isLoading).toBe(true);
    useAuthStore.getState().finishLoading();
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().session).toBeNull();
  });
});

describe('auth store actions', () => {
  it('signOut reports failure and keeps the user signed in locally', async () => {
    const tables = mockTables({ a: () => ({ data: { display_name: 'Анна' }, error: null }) });
    tables.setCurrentUser('a');
    useAuthStore.getState().setSession(makeSession(makeUser('a')));
    await flush();
    await flush();
    mocks.signOut.mockResolvedValue({ error: { message: 'Failed to fetch' } });

    const result = await useAuthStore.getState().signOut();

    expect(result.error).toMatch(/Нет соединения/);
    expect(useAuthStore.getState().user?.id).toBe('a');
    expect(useAuthStore.getState().displayName).toBe('Анна');
  });

  it('signOut clears profile data on success', async () => {
    const tables = mockTables({ a: () => ({ data: { display_name: 'Анна', stars_balance: 5 }, error: null }) });
    tables.setCurrentUser('a');
    useAuthStore.getState().setSession(makeSession(makeUser('a')));
    await flush();
    await flush();
    mocks.signOut.mockResolvedValue({ error: null });

    const result = await useAuthStore.getState().signOut();

    expect(result.error).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().displayName).toBe('Гость');
    expect(useAuthStore.getState().stars).toBe(0);
  });

  it('updateProfile does not change local state when the write fails', async () => {
    const tables = mockTables({ a: () => ({ data: { display_name: 'Анна', avatar_url: null }, error: null }) });
    tables.setCurrentUser('a');
    useAuthStore.getState().setSession(makeSession(makeUser('a')));
    await flush();
    await flush();

    mocks.from.mockImplementation(() => builder({ data: null, error: { message: 'permission denied' } }));
    const result = await useAuthStore.getState().updateProfile({ avatar_url: 'https://x/new.png', display_name: 'Новое' });

    expect(result.error).toBe('permission denied');
    expect(useAuthStore.getState().avatarUrl).toBeNull();
    expect(useAuthStore.getState().displayName).toBe('Анна');
  });

  it('updateProfile applies local state after a successful write', async () => {
    const tables = mockTables({ a: () => ({ data: { display_name: 'Анна' }, error: null }) });
    tables.setCurrentUser('a');
    useAuthStore.getState().setSession(makeSession(makeUser('a')));
    await flush();
    await flush();

    const updates: unknown[] = [];
    mocks.from.mockImplementation(() => builder({ data: null, error: null }, (p) => updates.push(p)));
    const result = await useAuthStore.getState().updateProfile({ display_name: 'Аня', avatar_url: 'https://x/n.png' });

    expect(result.error).toBeNull();
    expect(updates).toEqual([{ display_name: 'Аня', avatar_url: 'https://x/n.png' }]);
    expect(useAuthStore.getState().displayName).toBe('Аня');
    expect(useAuthStore.getState().avatarUrl).toBe('https://x/n.png');
  });

  it('signIn trims the email and translates errors', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } });

    const result = await useAuthStore.getState().signIn('  anna@example.com ', 'secret');

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'anna@example.com', password: 'secret' });
    expect(result.error).toBe('Неверный email или пароль');
  });

  it('addXP levels up using the shared thresholds', () => {
    useAuthStore.getState().addXP(150);
    expect(useAuthStore.getState().level).toBe(2);
    expect(useAuthStore.getState().xp).toBe(0);
  });
});
