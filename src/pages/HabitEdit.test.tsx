import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HabitWithTags } from '@/lib/habitsService';

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  getHabitById: vi.fn(),
  ensureDefaultTags: vi.fn(),
  updateHabit: vi.fn(),
  deleteHabit: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/starsService', () => ({ awardStars: vi.fn(), revokeStars: vi.fn() }));
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: { user: { id: string } | null }) => T) => selector({ user: h.user }),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));
vi.mock('@/lib/habitsService', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/habitsService')>();
  return {
    ...actual,
    getHabitById: h.getHabitById,
    ensureDefaultTags: h.ensureDefaultTags,
    updateHabit: h.updateHabit,
    deleteHabit: h.deleteHabit,
  };
});

import HabitEditPage from './HabitEdit';

const HABIT_ID = '11111111-2222-4333-8444-555555555555';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/habits/${HABIT_ID}/edit`]}>
        <Routes>
          <Route path="/habits/:id/edit" element={<HabitEditPage />} />
          <Route path="/habits" element={<div>habits list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const habit: HabitWithTags = {
  id: HABIT_ID,
  user_id: 'u1',
  title: 'Читать 20 минут',
  period_type: 'none',
  period_start: null,
  period_end: null,
  goal_id: null,
  life_sphere: 'health',
  repetitions_per_day: 1,
  target_days: [1, 2, 3, 4, 5, 6, 7],
  icon: 'book',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  tags: [],
};

describe('HabitEditPage', () => {
  beforeEach(() => {
    h.user = { id: 'u1' };
    h.getHabitById.mockReset();
    h.ensureDefaultTags.mockReset().mockResolvedValue([]);
    h.updateHabit.mockReset();
    h.deleteHabit.mockReset();
  });

  it('shows "not found" for a missing/foreign habit instead of an empty, saveable form', async () => {
    h.getHabitById.mockResolvedValue({ data: null, error: null });
    renderPage();
    expect(await screen.findByText('Привычка не найдена')).toBeInTheDocument();
    expect(screen.queryByText('Сохранить')).not.toBeInTheDocument();
    expect(h.updateHabit).not.toHaveBeenCalled();
  });

  it('shows an error with retry when loading fails (no endless skeleton)', async () => {
    h.getHabitById.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    expect(await screen.findByText('Ошибка загрузки')).toBeInTheDocument();

    h.getHabitById.mockResolvedValue({ data: habit, error: null });
    fireEvent.click(screen.getByText('Повторить'));
    expect(await screen.findByDisplayValue('Читать 20 минут')).toBeInTheDocument();
  });

  it('asks a guest to sign in instead of spinning forever', async () => {
    h.user = null;
    renderPage();
    expect(await screen.findByText('Войдите в аккаунт')).toBeInTheDocument();
    expect(h.getHabitById).not.toHaveBeenCalled();
  });

  it('still opens the form when tags fail to load', async () => {
    h.getHabitById.mockResolvedValue({ data: habit, error: null });
    h.ensureDefaultTags.mockRejectedValue(new Error('tags down'));
    renderPage();
    expect(await screen.findByDisplayValue('Читать 20 минут')).toBeInTheDocument();
  });

  it('deletes only once on a double click', async () => {
    h.getHabitById.mockResolvedValue({ data: habit, error: null });
    h.deleteHabit.mockReturnValue(new Promise(() => { /* pending */ }));
    const { container } = renderPage();
    await screen.findByDisplayValue('Читать 20 минут');

    const trash = container.querySelector('button.text-destructive');
    expect(trash).not.toBeNull();
    fireEvent.click(trash as Element);
    const confirm = await screen.findByRole('button', { name: 'Удалить' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(h.deleteHabit).toHaveBeenCalledTimes(1);
  });
});
