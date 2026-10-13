import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({
  user: { id: 'u1', email: 'boss@example.com' } as { id: string; email: string } | null,
  getUserAdminRole: vi.fn<(id: string) => Promise<string | null>>(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: { user: { id: string; email: string } | null }) => T) => selector({ user: m.user }),
}));
vi.mock('@/lib/adminService', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/adminService')>();
  return { ...actual, getUserAdminRole: m.getUserAdminRole };
});

import { AdminGuard } from './AdminGuard';
import { AdminServiceError, type AdminSection } from '@/lib/adminService';

function renderGuard(section: AdminSection) {
  const body = vi.fn(({ actorId, role }: { actorId: string; role: string }) => (
    <div data-testid="body">{`${actorId}:${role}`}</div>
  ));
  render(
    <MemoryRouter>
      <AdminGuard section={section}>{body}</AdminGuard>
    </MemoryRouter>,
  );
  return body;
}

beforeEach(() => {
  m.user = { id: 'u1', email: 'boss@example.com' };
  m.getUserAdminRole.mockReset();
});

describe('AdminGuard', () => {
  it('shows "Доступ запрещён" to guests instead of a blank page', () => {
    m.user = null;
    const body = renderGuard('users');
    expect(screen.getByText('Доступ запрещён')).toBeInTheDocument();
    expect(body).not.toHaveBeenCalled();
    expect(m.getUserAdminRole).not.toHaveBeenCalled();
  });

  it('shows "Доступ запрещён" to signed-in users without a staff role', async () => {
    m.getUserAdminRole.mockResolvedValue(null);
    const body = renderGuard('stars');
    expect(await screen.findByText('Доступ запрещён')).toBeInTheDocument();
    expect(body).not.toHaveBeenCalled();
  });

  it('denies a support user opening /admin/roles directly', async () => {
    m.getUserAdminRole.mockResolvedValue('support');
    const body = renderGuard('roles');
    expect(await screen.findByText('Доступ запрещён')).toBeInTheDocument();
    expect(screen.getByText(/Ваша роль не даёт доступа/)).toBeInTheDocument();
    expect(body).not.toHaveBeenCalled();
    // The console navigation is still available, limited to the support sections.
    expect(screen.getAllByText('Пользователи').length).toBeGreaterThan(0);
    expect(screen.queryByText('Роли и доступы')).not.toBeInTheDocument();
  });

  it('renders the page with the signed-in user id as actor for an allowed role', async () => {
    m.getUserAdminRole.mockResolvedValue('owner');
    const body = renderGuard('roles');
    expect(await screen.findByTestId('body')).toHaveTextContent('u1:owner');
    expect(m.getUserAdminRole).toHaveBeenCalledWith('u1');
    expect(body).toHaveBeenCalled();
  });

  it('shows an error with retry (not a false "denied" or an endless spinner) when the role check fails', async () => {
    m.getUserAdminRole.mockRejectedValueOnce(new AdminServiceError('Нет соединения с сервером. Проверьте интернет'));
    m.getUserAdminRole.mockResolvedValueOnce('admin');
    renderGuard('users');
    expect(await screen.findByText('Не удалось проверить доступ')).toBeInTheDocument();
    expect(screen.getByText('Нет соединения с сервером. Проверьте интернет')).toBeInTheDocument();
    expect(screen.queryByText('Доступ запрещён')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Повторить'));
    await waitFor(() => expect(screen.getByTestId('body')).toHaveTextContent('u1:admin'));
  });
});
