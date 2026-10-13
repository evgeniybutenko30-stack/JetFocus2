import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AdminUser } from '@/lib/adminService';

const m = vi.hoisted(() => ({
  role: 'admin' as string | null,
  getAdminUsers: vi.fn(),
  getStarsLedger: vi.fn(),
  adminGrantStars: vi.fn(),
  getPromoCodes: vi.fn(),
  createPromoCode: vi.fn(),
  togglePromoCode: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: { user: { id: string; email: string } }) => T) =>
    selector({ user: { id: 'actor-1', email: 'boss@example.com' } }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/adminService', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/adminService')>();
  return {
    ...actual,
    getUserAdminRole: vi.fn(async () => m.role),
    getAdminUsers: m.getAdminUsers,
    getStarsLedger: m.getStarsLedger,
    adminGrantStars: m.adminGrantStars,
    getPromoCodes: m.getPromoCodes,
    createPromoCode: m.createPromoCode,
    togglePromoCode: m.togglePromoCode,
  };
});

import AdminUsersPage from './AdminUsersPage';
import AdminStarsPage from './AdminStarsPage';
import AdminPromosPage from './AdminPromosPage';
import { AdminServiceError } from '@/lib/adminService';

const TARGET = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';

function user(id: string, name: string): AdminUser {
  return {
    user_id: id, email: `${name}@example.com`, display_name: name, avatar_url: null,
    is_pro: false, is_banned: false, stars_balance: 0, created_at: '2026-10-01T00:00:00Z',
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

function renderPage(page: JSX.Element) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

beforeEach(() => {
  m.role = 'admin';
  for (const fn of [m.getAdminUsers, m.getStarsLedger, m.adminGrantStars, m.getPromoCodes, m.createPromoCode, m.togglePromoCode]) {
    fn.mockReset();
  }
  m.getStarsLedger.mockResolvedValue([]);
  m.getPromoCodes.mockResolvedValue([]);
});

describe('AdminUsersPage', () => {
  it('ignores a slow response for an outdated search', async () => {
    const slow = deferred<AdminUser[]>();
    m.getAdminUsers.mockImplementation(async (_actor: string, opts: { search?: string }) =>
      (opts.search === 'bob' ? [user('b', 'bob')] : slow.promise));

    renderPage(<AdminUsersPage />);
    await waitFor(() => expect(m.getAdminUsers).toHaveBeenCalledTimes(1));
    expect(m.getAdminUsers.mock.calls[0][0]).toBe('actor-1');

    fireEvent.change(await screen.findByPlaceholderText('Поиск по имени или email…'), { target: { value: 'bob' } });
    expect(await screen.findByText('bob', {}, { timeout: 2000 })).toBeInTheDocument();

    // The first (unfiltered) request finishes last — it must not replace the "bob" results.
    await act(async () => { slow.resolve([user('a', 'alice')]); });
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('shows a load error instead of crashing', async () => {
    m.getAdminUsers.mockRejectedValue(new AdminServiceError('Недостаточно прав для этого действия'));
    renderPage(<AdminUsersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Недостаточно прав для этого действия');
  });
});

describe('AdminStarsPage grant dialog', () => {
  it('keeps the target/amount fields inside the dialog and grants with the signed-in actor', async () => {
    m.adminGrantStars.mockResolvedValue(undefined);
    renderPage(<AdminStarsPage />);
    fireEvent.click(await screen.findByText('Начислить'));

    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByText('Подтвердить');
    fireEvent.change(within(dialog).getByPlaceholderText('uuid пользователя…'), { target: { value: 'not-a-uuid' } });
    fireEvent.change(within(dialog).getByPlaceholderText('Укажите причину действия…'), { target: { value: 'конкурс' } });
    expect(within(dialog).getByText('Введите корректный User ID (UUID)')).toBeInTheDocument();
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText('uuid пользователя…'), { target: { value: ` ${TARGET} ` } });
    fireEvent.change(within(dialog).getByDisplayValue('50'), { target: { value: '25' } });
    await act(async () => { fireEvent.click(confirm); });

    expect(m.adminGrantStars).toHaveBeenCalledWith('actor-1', TARGET, 25, 'конкурс');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('caps support grants at 100 before calling the server', async () => {
    m.role = 'support';
    renderPage(<AdminStarsPage />);
    fireEvent.click(await screen.findByText('Начислить'));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('uuid пользователя…'), { target: { value: TARGET } });
    fireEvent.change(within(dialog).getByDisplayValue('50'), { target: { value: '150' } });
    expect(within(dialog).getAllByText(/не более 100/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Подтвердить')).toBeDisabled();
  });

  it('shows the server error and keeps the dialog open', async () => {
    m.adminGrantStars.mockRejectedValue(new AdminServiceError('Пользователь не найден'));
    renderPage(<AdminStarsPage />);
    fireEvent.click(await screen.findByText('Начислить'));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('uuid пользователя…'), { target: { value: TARGET } });
    fireEvent.change(within(dialog).getByPlaceholderText('Укажите причину действия…'), { target: { value: 'тест' } });
    await act(async () => { fireEvent.click(within(dialog).getByText('Подтвердить')); });
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Пользователь не найден');
  });
});

describe('AdminPromosPage', () => {
  it('validates the form and creates the code from whitelisted fields only', async () => {
    m.createPromoCode.mockResolvedValue(undefined);
    renderPage(<AdminPromosPage />);
    fireEvent.click(await screen.findByText('Создать'));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByPlaceholderText('JETFOCUS50'), { target: { value: 'sale-10' } });
    fireEvent.click(within(dialog).getByText('% Скидка'));
    const [valueInput] = within(dialog).getAllByRole('textbox').filter(el => el.getAttribute('inputmode') === 'decimal');
    fireEvent.change(valueInput, { target: { value: '150' } });
    await act(async () => { fireEvent.click(within(dialog).getAllByText('Создать').at(-1) as HTMLElement); });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('от 1 до 100');
    expect(m.createPromoCode).not.toHaveBeenCalled();

    fireEvent.change(valueInput, { target: { value: '10' } });
    await act(async () => { fireEvent.click(within(dialog).getAllByText('Создать').at(-1) as HTMLElement); });
    expect(m.createPromoCode).toHaveBeenCalledWith('actor-1', {
      code: 'SALE-10', type: 'percent', value: 10, expires_at: null, max_uses: null, is_active: true,
    });
  });

  it('shows an error state when promo codes cannot be loaded', async () => {
    m.getPromoCodes.mockRejectedValue(new AdminServiceError('Нет соединения с сервером. Проверьте интернет'));
    renderPage(<AdminPromosPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения с сервером');
    expect(screen.getByText('Список недоступен')).toBeInTheDocument();
  });

  it('is denied for roles without promo access', async () => {
    m.role = 'analyst';
    renderPage(<AdminPromosPage />);
    expect(await screen.findByText('Доступ запрещён')).toBeInTheDocument();
    expect(m.getPromoCodes).not.toHaveBeenCalled();
  });
});
