import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardData } from '@/hooks/use-metrics';
import type { HabitRow } from '@/lib/habitsService';
import type { TaskRow } from '@/lib/tasksService';
import type { GoalRow } from '@/lib/goalsService';

const h = vi.hoisted(() => ({
  data: { habits: [], completions: [], tasks: [], goals: [] } as DashboardData,
  isGuest: false,
  isError: false,
  updateTask: vi.fn(async () => ({ error: null })),
  deleteTask: vi.fn(async () => ({ error: null })),
  revokeStars: vi.fn(async () => undefined),
  invalidate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: <T,>(_q: () => unknown, _deps: unknown[], defaultValue: T) => defaultValue,
}));
vi.mock('@/hooks/use-metrics', () => ({
  useDashboardData: () => ({ data: h.data, isLoading: false, isError: h.isError, refetch: vi.fn(), isGuest: h.isGuest }),
  useInvalidateMetrics: () => h.invalidate,
}));
vi.mock('@/lib/tasksService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tasksService')>()),
  updateTask: h.updateTask,
  deleteTask: h.deleteTask,
}));
vi.mock('@/lib/starsService', () => ({ revokeStars: h.revokeStars, awardStars: vi.fn() }));
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: <T,>(selector: (s: { user: { id: string } | null; loadProfile: () => Promise<void> }) => T) =>
    selector({ user: h.isGuest ? null : { id: 'u1' }, loadProfile: async () => {} }),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: h.toastSuccess, error: h.toastError, info: vi.fn() }),
}));

import StatisticsPage from './Statistics';
import SectionsPage from './Sections';
import ArchivePage from './Archive';
import { getTodayStr } from '@/lib/constants';

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver (absent in jsdom).
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
});

const nowIso = new Date().toISOString();

function populated(): DashboardData {
  const today = getTodayStr();
  const habit: HabitRow = {
    id: 'h1', user_id: 'u1', title: 'Зарядка', period_type: 'none', period_start: null, period_end: null,
    goal_id: null, life_sphere: 'health', repetitions_per_day: 1, target_days: [1, 2, 3, 4, 5, 6, 7], icon: '💪',
    created_at: '2026-01-01T09:00:00Z', updated_at: '2026-01-01T09:00:00Z',
  };
  const task: TaskRow = {
    id: 't1', user_id: 'u1', title: 'Сдать отчёт', sphere: 'career', priority: 'HIGH', status: 'DONE',
    due_date: today, completed_at: nowIso, created_at: nowIso, updated_at: nowIso,
  };
  const goal: GoalRow = {
    id: 'g1', user_id: 'u1', title: 'Марафон', sphere: 'health', status: 'active', progress: 40, is_pinned: false,
    created_at: nowIso, target_date: today,
  };
  return {
    habits: [habit],
    completions: [{ id: 'c1', user_id: 'u1', habit_id: 'h1', date: today, count: 1, created_at: nowIso }],
    tasks: [task],
    goals: [goal],
  };
}

function renderPage(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/** Clicks today's cell (the same day number can also appear greyed out for the adjacent month). */
function clickToday() {
  const cells = screen.getAllByText(String(new Date().getDate()), { selector: 'span' });
  const today = cells.find(el => !el.closest('button')?.className.includes('opacity-30'));
  if (!today) throw new Error("today's calendar cell not found");
  fireEvent.click(today);
}

beforeEach(() => {
  h.data = { habits: [], completions: [], tasks: [], goals: [] };
  h.isGuest = false;
  h.isError = false;
  vi.clearAllMocks();
});

describe('StatisticsPage', () => {
  it('renders every tab with no data (no NaN, no "100% social" for an empty account)', () => {
    h.isGuest = true;
    renderPage(<StatisticsPage />);
    expect(screen.getByText(/Войдите в аккаунт, чтобы видеть свою статистику/)).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    fireEvent.click(screen.getByText('🎯 Сферы'));
    expect(screen.getByText('Нет активности за период')).toBeInTheDocument();
    fireEvent.click(screen.getByText('⚖️ Баланс'));
    expect(screen.getByText('Нет данных за период')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);
  });

  it('counts Supabase habits / tasks / goals', () => {
    h.data = populated();
    renderPage(<StatisticsPage />);
    expect(screen.getByText('Привычек выполнено').previousElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Задач выполнено').previousElementSibling).toHaveTextContent('1');
    expect(screen.getByText('0/1')).toBeInTheDocument(); // goals achieved / total
    expect(document.body.textContent).not.toMatch(/NaN/);
  });
});

describe('SectionsPage', () => {
  it('renders sphere cards from Supabase data', () => {
    h.data = populated();
    renderPage(<SectionsPage />);
    expect(screen.getByText('Сферы жизни')).toBeInTheDocument();
    expect(screen.getAllByText(/1 целей · 1 привычек/)).toHaveLength(1);
  });
});

describe('ArchivePage', () => {
  it('restores a completed task through the service, revoking its completion star', async () => {
    h.data = populated();
    renderPage(<ArchivePage />);
    clickToday();
    expect(await screen.findByText('Сдать отчёт')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Восстановить задачу'));
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledWith('Задача восстановлена'));
    expect(h.updateTask).toHaveBeenCalledWith('t1', 'u1', { status: 'TODO', completed_at: null });
    expect(h.revokeStars).toHaveBeenCalledWith('u1', 'task_t1');
    expect(h.invalidate).toHaveBeenCalled();
  });

  it('shows the error from a failed delete instead of a success toast', async () => {
    h.data = populated();
    h.deleteTask.mockResolvedValueOnce({ error: { message: 'нет доступа' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage(<ArchivePage />);
    clickToday();
    fireEvent.click(await screen.findByLabelText('Удалить задачу'));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Не удалось удалить задачу: нет доступа'));
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });
});
