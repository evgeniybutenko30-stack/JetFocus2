import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ActionRow, GoalRow } from '@/lib/goalsService';

interface MockAuthState {
  user: { id: string } | null;
  loadProfile: () => Promise<void>;
  addStars: (n: number) => void;
}

const { authState, svc, toastMock } = vi.hoisted(() => ({
  authState: { current: null as MockAuthState | null },
  svc: {
    getGoalById: vi.fn(),
    listMilestones: vi.fn(),
    listActions: vi.fn(),
    addAction: vi.fn(),
  },
  toastMock: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: MockAuthState) => T) => selector(authState.current as MockAuthState),
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/lib/goalsService', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/goalsService')>();
  return { ...actual, ...svc };
});

import GoalDetailPage from './GoalDetail';
import GoalEditPage from './GoalEdit';

const GOAL: GoalRow = {
  id: 'g1',
  user_id: 'u1',
  title: 'Выучить испанский',
  sphere: 'development',
  status: 'active',
  progress: 20,
  is_pinned: false,
  target_date: null,
  created_at: '2026-10-01T10:00:00Z',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/goals" element={<p>goals list</p>} />
        <Route path="/goals/:id" element={<GoalDetailPage />} />
        <Route path="/goals/:id/edit" element={<GoalEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.current = { user: { id: 'u1' }, loadProfile: vi.fn(async () => undefined), addStars: vi.fn() };
  Object.values(svc).forEach(fn => fn.mockReset());
  Object.values(toastMock).forEach(fn => fn.mockReset());
  svc.getGoalById.mockResolvedValue({ data: GOAL, error: null });
  svc.listMilestones.mockResolvedValue({ data: [], error: null });
  svc.listActions.mockResolvedValue({ data: [], error: null });
});

describe('GoalDetailPage', () => {
  it('shows "not found" (not an endless spinner) for a missing or foreign goal', async () => {
    svc.getGoalById.mockResolvedValue({ data: null, error: null });
    renderAt('/goals/does-not-exist');
    expect(await screen.findByText('Цель не найдена')).toBeInTheDocument();
  });

  it('shows an error instead of an empty plan when steps fail to load', async () => {
    svc.listActions.mockResolvedValue({ data: [], error: { message: 'timeout' } });
    renderAt('/goals/g1');
    expect(await screen.findByText('timeout')).toBeInTheDocument();
    expect(screen.queryByText(/Нет шагов/)).not.toBeInTheDocument();
  });

  it('creates a step only once on a double tap and clamps its numbers', async () => {
    let resolveAdd: (v: { data: ActionRow; error: null }) => void = () => undefined;
    svc.addAction.mockImplementation(() => new Promise(r => { resolveAdd = r; }));
    renderAt('/goals/g1');

    fireEvent.click(await screen.findByText('+ Добавить шаг'));
    fireEvent.change(screen.getByPlaceholderText('Название шага'), { target: { value: 'Повторить слова' } });
    fireEvent.change(screen.getByPlaceholderText('5'), { target: { value: '-50' } });
    const create = screen.getAllByText('Создать').find(el => el.tagName === 'BUTTON') as HTMLButtonElement;
    fireEvent.click(create);
    fireEvent.click(create);

    expect(svc.addAction).toHaveBeenCalledTimes(1);
    expect(svc.addAction.mock.calls[0][0]).toMatchObject({ title: 'Повторить слова', impact: 1, user_id: 'u1', goal_id: 'g1' });

    resolveAdd({
      data: {
        id: 'a1', goal_id: 'g1', user_id: 'u1', title: 'Повторить слова', status: 'todo', impact: 1,
        due_date: null, created_at: '2026-10-13T10:00:00Z',
      },
      error: null,
    });
    // Shown both as the "next step" CTA and in the steps list.
    expect(await screen.findAllByText('Повторить слова')).toHaveLength(2);
    expect(svc.addAction).toHaveBeenCalledTimes(1);
  });
});

describe('GoalEditPage', () => {
  it('does not spin forever for a guest', async () => {
    authState.current = { ...(authState.current as MockAuthState), user: null };
    renderAt('/goals/g1/edit');
    expect(await screen.findByText(/Войдите в аккаунт/)).toBeInTheDocument();
    await waitFor(() => expect(svc.getGoalById).not.toHaveBeenCalled());
  });
});
