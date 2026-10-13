import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type DbError = { message: string; code?: string };
type Result = { data: unknown; error: DbError | null };

const h = vi.hoisted(() => {
  const state = {
    posts: [] as { id: string; user_id: string; content: string; media_url: string | null; created_at: string }[],
    likes: [] as { post_id: string; user_id: string }[],
    deleteResult: { data: [] as unknown[], error: null as DbError | null },
    insertError: null as DbError | null,
    calls: [] as { table: string; op: string; payload?: unknown }[],
    /** Resolves pending like writes manually (to simulate a slow network). */
    likeGate: null as Promise<void> | null,
  };
  return {
    state,
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => {
  class Query implements PromiseLike<Result> {
    private op = 'select';
    private payload: unknown;
    constructor(private table: string) {}
    select() { return this; }
    order() { return this; }
    limit() { return this; }
    in() { return this; }
    eq() { return this; }
    delete() { this.op = 'delete'; return this; }
    insert(payload: unknown) { this.op = 'insert'; this.payload = payload; return this; }
    private async run(): Promise<Result> {
      const { state } = h;
      if (this.op !== 'select') state.calls.push({ table: this.table, op: this.op, payload: this.payload });
      if (this.table === 'posts' && this.op === 'select') return { data: state.posts, error: null };
      if (this.table === 'posts' && this.op === 'delete') return state.deleteResult;
      if (this.table === 'posts' && this.op === 'insert') return { data: null, error: state.insertError };
      if (this.table === 'post_likes' && this.op === 'select') return { data: state.likes, error: null };
      if (this.table === 'post_likes') {
        if (state.likeGate) await state.likeGate;
        return { data: null, error: null };
      }
      if (this.table === 'user_profiles') return { data: [{ user_id: 'author', display_name: 'Автор', avatar_url: 'javascript:alert(1)' }], error: null };
      return { data: null, error: null };
    }
    then<T1 = Result, T2 = never>(
      onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return this.run().then(onFulfilled, onRejected);
    }
  }
  return {
    supabase: {
      from: (table: string) => new Query(table),
      storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })), getPublicUrl: () => ({ data: { publicUrl: 'https://cdn/x.png' } }) }) },
    },
  };
});
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: { user: { id: string }; displayName: string }) => T) =>
    selector({ user: { id: 'me' }, displayName: 'Я' }),
}));
vi.mock('@/hooks/use-full-access', () => ({ useFullAccess: () => ({ hasAccess: true, isPro: true, isAdmin: false }) }));
vi.mock('@/lib/adminService', () => ({ getUserAdminRole: vi.fn(async () => null) }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: h.toastSuccess, error: h.toastError, info: vi.fn() }),
}));

import SocialPage from './Social';

async function openFeed() {
  render(<MemoryRouter><SocialPage /></MemoryRouter>);
  fireEvent.click(screen.getByText(/Согласен, не нарушать/));
}

beforeEach(() => {
  h.state.posts = [
    { id: 'p-own', user_id: 'me', content: 'Мой пост', media_url: null, created_at: '2026-10-13T08:00:00Z' },
    { id: 'p-other', user_id: 'author', content: 'Чужой пост', media_url: 'javascript:alert(1)', created_at: '2026-10-12T08:00:00Z' },
  ];
  h.state.likes = [{ post_id: 'p-other', user_id: 'author' }];
  h.state.deleteResult = { data: [], error: null };
  h.state.insertError = null;
  h.state.calls = [];
  h.state.likeGate = null;
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SocialPage', () => {
  it('reports a failed delete (0 affected rows) instead of a false success', async () => {
    await openFeed();
    expect(await screen.findByText('Мой пост')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Удалить публикацию'));
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText('Мой пост')).toBeInTheDocument();
  });

  it('removes the post only after a confirmed delete', async () => {
    h.state.deleteResult = { data: [{ id: 'p-own' }], error: null };
    await openFeed();
    fireEvent.click(await screen.findByLabelText('Удалить публикацию'));
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledWith('Публикация удалена'));
    expect(screen.queryByText('Мой пост')).not.toBeInTheDocument();
  });

  it('shows like counts and sends one write for a rapid double click', async () => {
    let release: () => void = () => {};
    h.state.likeGate = new Promise<void>(resolve => { release = resolve; });
    await openFeed();
    const likeButtons = await screen.findAllByLabelText('Нравится');
    // Posts are rendered newest first: [own, other]; the other post already has 1 like.
    expect(likeButtons[1]).toHaveTextContent('1');
    fireEvent.click(likeButtons[1]);
    fireEvent.click(likeButtons[1]);
    await waitFor(() => expect(screen.getByLabelText('Убрать лайк')).toHaveTextContent('2'));
    release();
    await waitFor(() => expect(screen.getByLabelText('Убрать лайк')).not.toBeDisabled());
    expect(h.state.calls.filter(c => c.table === 'post_likes')).toHaveLength(1);
  });

  it('never renders a javascript: URL as an image source', async () => {
    await openFeed();
    await screen.findByText('Чужой пост');
    const sources = Array.from(document.querySelectorAll('img')).map(img => img.getAttribute('src') ?? '');
    expect(sources.some(src => src.startsWith('javascript:'))).toBe(false);
  });

  it('keeps the draft and shows an error when publishing fails', async () => {
    h.state.insertError = { message: 'permission denied' };
    await openFeed();
    const textarea = await screen.findByPlaceholderText('Поделитесь достижением...');
    fireEvent.change(textarea, { target: { value: 'Новый пост' } });
    fireEvent.click(screen.getByText('Опубликовать'));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Не удалось опубликовать: permission denied'));
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Новый пост')).toBeInTheDocument();
  });
});
