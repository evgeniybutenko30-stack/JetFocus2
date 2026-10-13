import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FinanceOperation } from '@/lib/types';

// In-memory stand-in for the Dexie table (jsdom has no IndexedDB).
const h = vi.hoisted(() => {
  const rows = new Map<string, FinanceOperation>();
  return {
    rows,
    user: { id: 'u1' } as { id: string } | null,
    addXP: vi.fn(),
    addStars: vi.fn(),
    add: vi.fn(async (row: FinanceOperation) => {
      rows.set(row.id, row);
      return row.id;
    }),
    update: vi.fn(async (id: string, changes: Partial<FinanceOperation>) => {
      const row = rows.get(id);
      if (!row) return 0;
      rows.set(id, { ...row, ...changes });
      return 1;
    }),
    remove: vi.fn(async (id: string) => {
      rows.delete(id);
    }),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/db', () => ({
  db: {
    financeOperations: {
      get: (id: string) => Promise.resolve(h.rows.get(id)),
      add: h.add,
      update: h.update,
      delete: h.remove,
    },
    transaction: (_mode: string, _table: unknown, fn: () => Promise<unknown>) => fn(),
  },
}));
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: { user: { id: string } | null; addXP: () => void; addStars: () => void }) => T) =>
    selector({ user: h.user, addXP: h.addXP, addStars: h.addStars }),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: h.toastSuccess, error: h.toastError }),
}));

import FinanceEditPage from './FinanceEdit';
import FinanceNewPage from './FinanceNew';

const OP_ID = 'op-1';

function makeOp(partial: Partial<FinanceOperation> = {}): FinanceOperation {
  return {
    id: OP_ID,
    userId: 'u1',
    type: 'EXPENSE',
    amount: 1250,
    category: 'Еда',
    tags: [],
    date: '2026-10-13',
    sphere: 'finance',
    emotionalTag: 'neutral',
    createdAt: 1,
    ...partial,
  };
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/finance" element={<div>finance list</div>} />
          <Route path="/finance/new" element={<FinanceNewPage />} />
          <Route path="/finance/:id/edit" element={<FinanceEditPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function amountInput(): HTMLInputElement {
  // The amount field is the only one with inputMode="decimal".
  const input = document.querySelector('input[inputmode="decimal"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('amount input not found');
  return input;
}

beforeEach(() => {
  h.rows.clear();
  h.user = { id: 'u1' };
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FinanceEditPage', () => {
  it('does not open an operation that belongs to another user', async () => {
    h.rows.set(OP_ID, makeOp({ userId: 'someone-else' }));
    renderAt(`/finance/${OP_ID}/edit`);
    expect(await screen.findByText('finance list')).toBeInTheDocument();
    expect(h.toastError).toHaveBeenCalledWith('Операция не найдена');
  });

  it('redirects with an error for a missing operation', async () => {
    renderAt('/finance/nope/edit');
    expect(await screen.findByText('finance list')).toBeInTheDocument();
    expect(h.toastError).toHaveBeenCalledWith('Операция не найдена');
  });

  it('pre-fills kopecks exactly and saves a comma amount', async () => {
    h.rows.set(OP_ID, makeOp());
    renderAt(`/finance/${OP_ID}/edit`);
    await screen.findByText('Сохранить');
    expect(amountInput().value).toBe('12,50');

    fireEvent.change(amountInput(), { target: { value: '99,90' } });
    fireEvent.click(screen.getByText('Сохранить'));

    expect(await screen.findByText('finance list')).toBeInTheDocument();
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.rows.get(OP_ID)?.amount).toBe(9990);
    expect(h.toastSuccess).toHaveBeenCalledWith('Сохранено');
  });

  it('rejects a negative / garbage amount instead of storing NaN or a negative value', async () => {
    h.rows.set(OP_ID, makeOp());
    renderAt(`/finance/${OP_ID}/edit`);
    await screen.findByText('Сохранить');

    for (const bad of ['-5', 'abc', '0']) {
      fireEvent.change(amountInput(), { target: { value: bad } });
      fireEvent.click(screen.getByText('Сохранить'));
    }
    expect(h.update).not.toHaveBeenCalled();
    expect(h.rows.get(OP_ID)?.amount).toBe(1250);
    expect(h.toastError).toHaveBeenCalledWith('Заполните сумму и категорию');
  });

  it('does not report success when the operation vanished before saving', async () => {
    h.rows.set(OP_ID, makeOp());
    renderAt(`/finance/${OP_ID}/edit`);
    await screen.findByText('Сохранить');
    h.rows.delete(OP_ID);

    fireEvent.click(screen.getByText('Сохранить'));
    expect(await screen.findByText('finance list')).toBeInTheDocument();
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith('Операция не найдена');
  });

  it('asks for confirmation before deleting', async () => {
    h.rows.set(OP_ID, makeOp());
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAt(`/finance/${OP_ID}/edit`);
    await screen.findByText('Сохранить');

    fireEvent.click(screen.getByLabelText('Удалить операцию'));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(h.remove).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByLabelText('Удалить операцию'));
    expect(await screen.findByText('finance list')).toBeInTheDocument();
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.rows.has(OP_ID)).toBe(false);
  });
});

describe('FinanceNewPage', () => {
  it('asks a guest to sign in instead of failing with a save error', async () => {
    h.user = null;
    renderAt('/finance/new?type=expense');
    fireEvent.change(amountInput(), { target: { value: '100' } });
    fireEvent.click(screen.getByText(/Еда/));
    fireEvent.click(screen.getByText('Добавить'));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Войдите в аккаунт'));
    expect(h.add).not.toHaveBeenCalled();
  });

  it('parses "12,50" as 1250 kopecks and saves only once on a double tap', async () => {
    let release: () => void = () => {};
    h.add.mockImplementationOnce(
      (row: FinanceOperation) =>
        new Promise<string>(resolve => {
          release = () => {
            h.rows.set(row.id, row);
            resolve(row.id);
          };
        }),
    );
    renderAt('/finance/new?type=expense');
    fireEvent.change(amountInput(), { target: { value: '12,50' } });
    fireEvent.click(screen.getByText(/Еда/));

    fireEvent.click(screen.getByText('Добавить'));
    fireEvent.click(screen.getByText('Сохранение…'));
    expect(h.add).toHaveBeenCalledTimes(1);
    expect(h.add.mock.calls[0][0]).toMatchObject({ amount: 1250, type: 'EXPENSE', category: 'Еда', userId: 'u1' });

    await act(async () => release());
    expect(await screen.findByText('finance list')).toBeInTheDocument();
    expect(h.addXP).toHaveBeenCalledTimes(1);
    expect(h.addStars).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty date', async () => {
    renderAt('/finance/new?type=income');
    fireEvent.change(amountInput(), { target: { value: '5000' } });
    fireEvent.click(screen.getByText(/Зарплата/));
    const dateInput = document.querySelector('input[type="date"]');
    if (!(dateInput instanceof HTMLInputElement)) throw new Error('date input not found');
    fireEvent.change(dateInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Добавить'));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Укажите дату'));
    expect(h.add).not.toHaveBeenCalled();
  });
});
