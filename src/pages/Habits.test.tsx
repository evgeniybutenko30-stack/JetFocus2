import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HabitCompletionRow, HabitWithTags } from '@/lib/habitsService';
import { getTodayStr } from '@/lib/constants';

const h = vi.hoisted(() => ({
  listHabits: vi.fn(),
  listCompletions: vi.fn(),
  ensureDefaultTags: vi.fn(),
  getStarsSummary: vi.fn(),
  incrementCompletion: vi.fn(),
  resetCompletion: vi.fn(),
  deleteHabit: vi.fn(),
  listGoals: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/starsService', () => ({ awardStars: vi.fn(), revokeStars: vi.fn() }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: { user: { id: string } }) => T) => selector({ user: { id: 'u1' } }),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));
vi.mock('@/lib/goalsService', () => ({ listGoals: h.listGoals }));
vi.mock('@/lib/habitsService', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/habitsService')>();
  return {
    ...actual,
    listHabits: h.listHabits,
    listCompletions: h.listCompletions,
    ensureDefaultTags: h.ensureDefaultTags,
    getStarsSummary: h.getStarsSummary,
    incrementCompletion: h.incrementCompletion,
    resetCompletion: h.resetCompletion,
    deleteHabit: h.deleteHabit,
  };
});

import HabitsPage from './Habits';

const habit: HabitWithTags = {
  id: 'h1',
  user_id: 'u1',
  title: 'Пить воду',
  period_type: 'none',
  period_start: null,
  period_end: null,
  goal_id: null,
  life_sphere: 'health',
  repetitions_per_day: 2,
  target_days: [1, 2, 3, 4, 5, 6, 7],
  icon: 'water',
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
  tags: [],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/habits']}>
        <HabitsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HabitsPage', () => {
  beforeEach(() => {
    Object.values(h).forEach(fn => fn.mockReset());
    h.listHabits.mockResolvedValue({ data: [habit], error: null });
    h.listCompletions.mockResolvedValue({ data: [], error: null });
    h.ensureDefaultTags.mockResolvedValue([]);
    h.getStarsSummary.mockResolvedValue({ today: 0, week: 0, total: 0 });
    h.listGoals.mockResolvedValue({ data: [], error: null });
  });

  it('ignores a second click while the first completion is still being saved', async () => {
    const saved: HabitCompletionRow = { id: 'c1', user_id: 'u1', habit_id: 'h1', date: getTodayStr(), count: 1, created_at: '' };
    let resolve: (v: { data: HabitCompletionRow | null; starsAwarded: number; justCompleted: boolean; error: string | null }) => void = () => {};
    h.incrementCompletion.mockReturnValue(new Promise(r => { resolve = r; }));
    h.listCompletions
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValue({ data: [saved], error: null });
    renderPage();

    const button = await screen.findByRole('button', { name: 'Отметить выполнение' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(h.incrementCompletion).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await act(async () => {
      resolve({ data: saved, starsAwarded: 0, justCompleted: false, error: null });
    });
    // Released after the write finished; the server row is shown (1 of 2) and the list revalidated.
    await waitFor(() => expect(h.listCompletions).toHaveBeenCalledTimes(2));
    const after = screen.getByRole('button', { name: 'Отметить выполнение' });
    expect(after).not.toBeDisabled();
    expect(after).toHaveTextContent('1');
  });

  it('shows an error (not the "no habits" empty state) when habits fail to load', async () => {
    h.listHabits.mockResolvedValue({ data: [], error: 'Нет соединения с сервером.' });
    renderPage();
    expect(await screen.findByText('Ошибка загрузки')).toBeInTheDocument();
    expect(screen.queryByText('Нет привычек')).not.toBeInTheDocument();
  });

  it('shows an error instead of "nothing done" when completions fail to load', async () => {
    h.listCompletions.mockResolvedValue({ data: [], error: 'Нет соединения с сервером.' });
    renderPage();
    expect(await screen.findByText('Ошибка загрузки')).toBeInTheDocument();
  });
});
