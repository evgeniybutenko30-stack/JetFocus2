import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DailyPlan, NotificationItem } from '@/lib/types';

// Regression: /topfocus and /notifications white-screened for guests
// ("Cannot read properties of null (reading 'id')").

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  plan: undefined as DailyPlan | undefined,
  notifications: [] as NotificationItem[],
  planAdd: vi.fn(async () => 'id'),
  planUpdate: vi.fn(async () => 1),
  modify: vi.fn(async () => 1),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('dexie-react-hooks', async () => {
  const React = await import('react');
  return {
    // Minimal stand-in for Dexie's live query (jsdom has no IndexedDB): run the querier once per deps change.
    useLiveQuery: <T,>(querier: () => Promise<T> | T, deps: unknown[] = [], defaultValue?: T) => {
      const [value, setValue] = React.useState<T | undefined>(defaultValue);
      const querierRef = React.useRef(querier);
      querierRef.current = querier;
      const depsKey = JSON.stringify(deps);
      React.useEffect(() => {
        let cancelled = false;
        Promise.resolve(querierRef.current()).then(v => { if (!cancelled) setValue(v); });
        return () => { cancelled = true; };
      }, [depsKey]);
      return value;
    },
  };
});
vi.mock('@/lib/db', () => ({
  db: {
    dailyPlans: {
      where: () => ({ first: async () => h.plan }),
      add: h.planAdd,
      update: h.planUpdate,
    },
    notifications: {
      where: () => ({
        equals: () => ({
          reverse: () => ({ sortBy: async () => h.notifications }),
          filter: () => ({ modify: h.modify }),
        }),
      }),
      update: vi.fn(async () => 1),
    },
    transaction: (_mode: string, _table: unknown, fn: () => Promise<unknown>) => fn(),
  },
}));
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: { user: { id: string } | null }) => T) => selector({ user: h.user }),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: h.toastSuccess, error: h.toastError, info: vi.fn() }),
}));

import TopFocusPage from './TopFocus';
import NotificationsPage from './Notifications';

function renderPage(ui: React.ReactElement, path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.user = null;
  h.plan = undefined;
  h.notifications = [];
  vi.clearAllMocks();
});

describe('TopFocusPage', () => {
  it('renders for a guest and does not save a plan without an account', async () => {
    renderPage(<TopFocusPage />);
    expect(screen.getByText('JetFocus — План дня')).toBeInTheDocument();
    expect(screen.getByText(/Войдите в аккаунт, чтобы сохранять план дня/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Сохранить'));
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.planAdd).not.toHaveBeenCalled();
  });

  it('loads the saved plan, pads it to 3 items and saves with a success toast', async () => {
    h.user = { id: 'u1' };
    h.plan = { id: 'p1', userId: 'u1', date: '2026-10-13', planItems: ['Первое'], focusOfDay: 'Фокус', createdAt: 1, updatedAt: 1 };
    renderPage(<TopFocusPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Первое')).toBeInTheDocument());
    expect(screen.getAllByPlaceholderText(/Пункт/)).toHaveLength(3);
    fireEvent.click(screen.getByText('Сохранить'));
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledWith('План дня сохранён'));
    expect(h.planUpdate).toHaveBeenCalledWith('p1', expect.objectContaining({ planItems: ['Первое', '', ''], focusOfDay: 'Фокус' }));
  });
});

describe('NotificationsPage', () => {
  it('renders demo notifications for a guest instead of crashing', async () => {
    renderPage(<NotificationsPage />);
    expect(screen.getByText('Уведомления')).toBeInTheDocument();
    expect(await screen.findByText('Добро пожаловать!')).toBeInTheDocument();
  });

  it('does not mix demo items into a tab when the user has real notifications', async () => {
    h.user = { id: 'u1' };
    h.notifications = [
      { id: 'n1', userId: 'u1', type: 'task', title: 'Реальная задача', body: 'b', isRead: false, createdAt: Date.now() },
    ];
    renderPage(<NotificationsPage />);
    expect(await screen.findByText('Реальная задача')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Социальные'));
    expect(screen.queryByText('Новый лайк')).not.toBeInTheDocument();
    expect(screen.getByText('Нет уведомлений')).toBeInTheDocument();
  });

  it('marks all as read with one scoped write', async () => {
    h.user = { id: 'u1' };
    h.notifications = [
      { id: 'n1', userId: 'u1', type: 'system', title: 'A', body: 'b', isRead: false, createdAt: Date.now() },
      { id: 'n2', userId: 'u1', type: 'system', title: 'B', body: 'b', isRead: false, createdAt: Date.now() },
    ];
    renderPage(<NotificationsPage />);
    fireEvent.click(await screen.findByText('Прочитать все'));
    await waitFor(() => expect(h.modify).toHaveBeenCalledTimes(1));
    expect(h.modify).toHaveBeenCalledWith({ isRead: true });
  });
});
