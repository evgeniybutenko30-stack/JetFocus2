import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FinanceAccount, FinanceGoal, FinanceOperation } from '@/lib/types';
import { getTodayStr } from '@/lib/constants';

// In-memory stand-in for the three Dexie tables the page reads (jsdom has no IndexedDB),
// plus a change feed so the useLiveQuery stand-in re-runs after writes like the real one.
const h = vi.hoisted(() => {
  interface Row { id: string; userId: string; [key: string]: unknown }
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());

  function makeTable() {
    const rows = new Map<string, Row>();
    return {
      rows,
      where: (field: 'userId') => ({
        equals: (value: string) => ({
          toArray: async () => [...rows.values()].filter(r => r[field] === value),
          modify: async (changes: Partial<Row>) => {
            for (const r of [...rows.values()]) if (r[field] === value) rows.set(r.id, { ...r, ...changes });
            notify();
          },
        }),
      }),
      get: async (id: string) => rows.get(id),
      add: vi.fn(async (row: Row) => {
        rows.set(row.id, row);
        notify();
        return row.id;
      }),
      update: vi.fn(async (id: string, changes: Partial<Row>) => {
        const row = rows.get(id);
        if (!row) return 0;
        rows.set(id, { ...row, ...changes });
        notify();
        return 1;
      }),
    };
  }

  return {
    listeners,
    user: { id: 'u1' } as { id: string } | null,
    financeOperations: makeTable(),
    financeAccounts: makeTable(),
    financeGoals: makeTable(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/db', () => ({
  db: {
    financeOperations: h.financeOperations,
    financeAccounts: h.financeAccounts,
    financeGoals: h.financeGoals,
    transaction: (_mode: string, _table: unknown, fn: () => Promise<unknown>) => fn(),
  },
}));
vi.mock('dexie-react-hooks', async () => {
  const { useEffect, useRef, useState } = await import('react');
  function useLiveQueryStandIn<T>(querier: () => Promise<T>, deps: unknown[], defaultValue: T): T {
    const [value, setValue] = useState<T>(defaultValue);
    const [version, setVersion] = useState(0);
    const querierRef = useRef(querier);
    querierRef.current = querier;
    const depsKey = JSON.stringify(deps);
    useEffect(() => {
      const listener = () => setVersion(v => v + 1);
      h.listeners.add(listener);
      return () => {
        h.listeners.delete(listener);
      };
    }, []);
    useEffect(() => {
      let alive = true;
      void querierRef.current().then(v => {
        if (alive) setValue(v);
      });
      return () => {
        alive = false;
      };
    }, [depsKey, version]);
    return value;
  }
  return { useLiveQuery: useLiveQueryStandIn };
});
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: { user: { id: string } | null; addXP: () => void; addStars: () => void }) => T) =>
    selector({ user: h.user, addXP: vi.fn(), addStars: vi.fn() }),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: h.toastSuccess, error: h.toastError }),
}));
// Recharts needs ResizeObserver / layout, which jsdom does not have; the charts are not under test.
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    PieChart: Box, Pie: Box, Cell: Nothing, ResponsiveContainer: Box, LineChart: Box,
    Line: Nothing, XAxis: Nothing, YAxis: Nothing, CartesianGrid: Nothing, Tooltip: Nothing,
  };
});

import FinancePage from './Finance';

const plain = (s: string | null | undefined) => (s ?? '').replace(/\u00A0/g, ' ');

function account(partial: Partial<FinanceAccount> & { id: string }): FinanceAccount {
  return {
    userId: 'u1', name: partial.id, type: 'CARD', balance: 0, currency: '₽', icon: '💳',
    color: '#3B82F6', isDefault: false, hideFromTotal: false, createdAt: 1, ...partial,
  };
}

function operation(partial: Partial<FinanceOperation> & { id: string }): FinanceOperation {
  return {
    userId: 'u1', type: 'EXPENSE', amount: 0, category: 'Еда', tags: [], date: getTodayStr(),
    sphere: 'finance', createdAt: 1, ...partial,
  };
}

function goal(partial: Partial<FinanceGoal> & { id: string }): FinanceGoal {
  return {
    userId: 'u1', title: 'Ноутбук', goalType: 'saving', targetAmount: 0, currentAmount: 0,
    icon: '💻', sphere: 'finance', createdAt: 1, ...partial,
  };
}

function seed(table: { rows: Map<string, { id: string; userId: string }> }, rows: { id: string; userId: string }[]) {
  for (const r of rows) table.rows.set(r.id, r);
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/finance']}>
        <FinancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Text of the value shown right below a card label such as "Общий баланс". */
function valueAfter(label: string): string {
  return plain(screen.getByText(label).nextElementSibling?.textContent);
}

/** Balance shown on an account card (the last paragraph of the card). */
function accountCardBalance(name: string): string {
  const card = screen.getByText(name).closest('.glass-card');
  if (!(card instanceof HTMLElement)) throw new Error(`account card ${name} not found`);
  const paragraphs = card.querySelectorAll('p');
  return plain(paragraphs[paragraphs.length - 1]?.textContent);
}

function amountInput(): HTMLInputElement {
  const input = document.querySelector('input[inputmode="decimal"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('amount input not found');
  return input;
}

beforeEach(() => {
  h.user = { id: 'u1' };
  h.financeOperations.rows.clear();
  h.financeAccounts.rows.clear();
  h.financeGoals.rows.clear();
  vi.clearAllMocks();
});

describe('FinancePage', () => {
  it('renders the empty state without crashing', async () => {
    renderPage();
    expect(await screen.findByText('Нет счетов')).toBeInTheDocument();
    expect(screen.getByText('Нет финансовых целей')).toBeInTheDocument();
    expect(screen.getByText('Нет операций')).toBeInTheDocument();
    expect(valueAfter('Общий баланс')).toBe('0 ₽');
  });

  it('shows account balances with their operations and a ₽ total without hidden / foreign accounts', async () => {
    seed(h.financeAccounts, [
      account({ id: 'card', name: 'Основная', balance: 50000 }),
      account({ id: 'safe', name: 'Сейф', balance: 100000, hideFromTotal: true }),
      account({ id: 'usd', name: 'Доллары', balance: 30000, currency: '$' }),
    ]);
    seed(h.financeOperations, [
      operation({ id: 'o1', type: 'INCOME', amount: 1250, category: 'Зарплата', accountId: 'card' }),
      operation({ id: 'o2', type: 'EXPENSE', amount: 40 }),
      operation({ id: 'o3', type: 'EXPENSE', amount: 1000, accountId: 'safe' }),
    ]);
    renderPage();

    await waitFor(() => expect(accountCardBalance('Основная')).toBe('512,50 ₽'));
    expect(accountCardBalance('Сейф')).toBe('990 ₽');
    expect(accountCardBalance('Доллары')).toBe('300 $');
    // 500 ₽ card + 12,50 income on it - 0,40 unlinked expense; hidden and $ accounts stay out.
    expect(valueAfter('Общий баланс')).toBe('512,10 ₽');
    // Kopecks are shown as entered, not rounded to whole rubles.
    // (Testing Library's default normalizer turns the NBSPs into plain spaces.)
    expect(screen.getAllByText('+12,50 ₽').length).toBeGreaterThan(0);
    expect(screen.queryByText('+13 ₽')).not.toBeInTheDocument();
  });

  it('adds an expense typed with a comma to the chosen account and updates its balance', async () => {
    seed(h.financeAccounts, [account({ id: 'card', name: 'Основная', balance: 50000 })]);
    renderPage();
    await waitFor(() => expect(accountCardBalance('Основная')).toBe('500 ₽'));

    fireEvent.click(screen.getByLabelText('Добавить расход'));
    fireEvent.change(amountInput(), { target: { value: '12,50' } });
    fireEvent.click(screen.getByText(/Еда/));
    const modal = screen.getByText('💸 Новый расход').closest('div.bg-card');
    if (!(modal instanceof HTMLElement)) throw new Error('modal not found');
    // The modal loads the accounts itself (asynchronously, like useLiveQuery).
    fireEvent.click(await within(modal).findByText(/Основная/));
    await act(async () => {
      fireEvent.click(within(modal).getByText('Добавить'));
    });

    expect(h.financeOperations.add).toHaveBeenCalledTimes(1);
    expect(h.financeOperations.add.mock.calls[0][0]).toMatchObject({
      type: 'EXPENSE', amount: 1250, category: 'Еда', accountId: 'card', userId: 'u1', date: getTodayStr(),
    });
    expect(h.toastSuccess).toHaveBeenCalledWith('Добавлено');
    await waitFor(() => expect(accountCardBalance('Основная')).toBe('487,50 ₽'));
    expect(screen.queryByText('💸 Новый расход')).not.toBeInTheDocument();
  });

  it('lets the user undo the account choice in the add-operation modal', async () => {
    seed(h.financeAccounts, [account({ id: 'card', name: 'Основная', balance: 0 })]);
    renderPage();
    await screen.findByText('Основная');

    fireEvent.click(screen.getByLabelText('Добавить доход'));
    fireEvent.change(amountInput(), { target: { value: '100' } });
    fireEvent.click(screen.getByText(/Зарплата/));
    const modal = screen.getByText('💰 Новый доход').closest('div.bg-card');
    if (!(modal instanceof HTMLElement)) throw new Error('modal not found');
    // The modal loads the accounts itself (asynchronously, like useLiveQuery).
    fireEvent.click(await within(modal).findByText(/Основная/));
    fireEvent.click(within(modal).getByText('Без счёта'));
    await act(async () => {
      fireEvent.click(within(modal).getByText('Добавить'));
    });

    expect(h.financeOperations.add).toHaveBeenCalledTimes(1);
    expect(h.financeOperations.add.mock.calls[0][0]).toMatchObject({ type: 'INCOME', amount: 10000 });
    expect(h.financeOperations.add.mock.calls[0][0].accountId).toBeUndefined();
  });

  it('does not show 100 % before a goal is reached and tops it up with a comma amount', async () => {
    seed(h.financeGoals, [goal({ id: 'g1', title: 'Ноутбук', targetAmount: 100000, currentAmount: 99600 })]);
    renderPage();

    expect(await screen.findByText('99%')).toBeInTheDocument();
    expect(plain(screen.getByText(/Осталось:/).textContent)).toBe('Осталось: 4 ₽');

    fireEvent.click(screen.getByText('➕ Пополнить цель'));
    fireEvent.change(amountInput(), { target: { value: '4,00' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Пополнить'));
    });

    expect(h.financeGoals.rows.get('g1')?.currentAmount).toBe(100000);
    expect(plain(h.toastSuccess.mock.calls[0][0])).toBe('+4 ₽ к "Ноутбук"');
    expect(await screen.findByText('100%')).toBeInTheDocument();
  });

  it('rejects a garbage top-up amount without touching the goal', async () => {
    seed(h.financeGoals, [goal({ id: 'g1', targetAmount: 100000, currentAmount: 1000 })]);
    renderPage();
    fireEvent.click(await screen.findByText('➕ Пополнить цель'));
    fireEvent.change(amountInput(), { target: { value: '-5' } });
    fireEvent.click(screen.getByText('Пополнить'));

    expect(h.toastError).toHaveBeenCalledWith('Введите сумму');
    expect(h.financeGoals.update).not.toHaveBeenCalled();
    expect(h.financeGoals.rows.get('g1')?.currentAmount).toBe(1000);
  });
});
