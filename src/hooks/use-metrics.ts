import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { listCompletions, toLocalDateStr, addLocalDays, type HabitCompletionRow, type HabitRow } from '@/lib/habitsService';
import { listTasks, type TaskRow } from '@/lib/tasksService';
import { listGoals, isGoalActive, type GoalRow } from '@/lib/goalsService';
import {
  calculateDayProgressScore,
  computeFinanceSummary,
  computeFocusMinutes,
  computeHabitTaskMetrics,
  type FinanceSummary,
  type HabitTaskDayMetrics,
} from '@/lib/dashboardStats';

/*
 * Habits, tasks and goals live in Supabase; finance operations / accounts and focus sessions
 * live in Dexie. All query keys start with 'metrics', so useInvalidateMetrics() refreshes
 * every dashboard number at once.
 *
 * Query functions THROW on a failed Supabase read: React Query then keeps the last good data
 * (and retries) instead of replacing real numbers with zeros on a flaky refetch.
 */

export interface DayMetrics extends HabitTaskDayMetrics, FinanceSummary {
  focusMinutesToday: number;
  goalsActiveCount: number;
  dayProgressScore: number;
}

async function fetchHabitRows(userId: string): Promise<HabitRow[]> {
  // Plain select (listHabits() also loads tags, which the dashboard does not need).
  const { data, error } = await supabase.from('habits').select('*').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as HabitRow[];
}

async function fetchCompletionRows(userId: string, fromDate?: string): Promise<HabitCompletionRow[]> {
  const { data, error } = await listCompletions(userId, fromDate);
  if (error) throw new Error(error);
  return data;
}

async function fetchTaskRows(userId: string): Promise<TaskRow[]> {
  const { data, error } = await listTasks(userId);
  if (error) throw new Error(error.message);
  return data;
}

async function fetchGoalRows(userId: string): Promise<GoalRow[]> {
  const { data, error } = await listGoals(userId);
  if (error) throw new Error(error.message);
  return data;
}

/** Dexie reads are local; a broken/blocked IndexedDB must not take the whole dashboard down. */
async function safeLocal<T>(read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch (e) {
    console.warn('[metrics] local read failed:', e);
    return [];
  }
}

export async function loadDayMetrics(userId: string, now: Date = new Date()): Promise<DayMetrics> {
  const today = toLocalDateStr(now);
  const [habits, completions, tasks, goalsResult, sessions, ops, accounts] = await Promise.all([
    fetchHabitRows(userId),
    fetchCompletionRows(userId, today),
    fetchTaskRows(userId),
    // Goals only feed a secondary counter: tolerate their failure.
    listGoals(userId),
    safeLocal(() => db.focusSessions.where('date').equals(today).toArray()),
    safeLocal(() => db.financeOperations.where('userId').equals(userId).toArray()),
    safeLocal(() => db.financeAccounts.where('userId').equals(userId).toArray()),
  ]);
  if (goalsResult.error) console.warn('[metrics] goals:', goalsResult.error.message);

  const dayCounts = computeHabitTaskMetrics(habits, completions, tasks, now);
  const focusMinutesToday = computeFocusMinutes(sessions, userId, today);
  return {
    ...dayCounts,
    ...computeFinanceSummary(ops, accounts, today),
    focusMinutesToday,
    goalsActiveCount: (goalsResult.data ?? []).filter(isGoalActive).length,
    dayProgressScore: calculateDayProgressScore({ ...dayCounts, focusMinutesToday }),
  };
}

export function useMetrics() {
  const userId = useAuthStore(s => s.user?.id ?? null);
  return useQuery({
    queryKey: ['metrics', userId ?? 'guest'],
    enabled: !!userId,
    queryFn: () => loadDayMetrics(userId as string),
    refetchInterval: 30000,
  });
}

export interface DashboardData {
  habits: HabitRow[];
  completions: HabitCompletionRow[];
  tasks: TaskRow[];
  goals: GoalRow[];
}

const EMPTY_DASHBOARD: DashboardData = { habits: [], completions: [], tasks: [], goals: [] };

/**
 * Supabase data for the analytics screens (Моя динамика, Статистика, Сферы, Архив).
 * `completionDays`: how many local days of habit completions to load (ending today);
 * 0 = none, null = all history.
 */
export function useDashboardData(completionDays: number | null) {
  const userId = useAuthStore(s => s.user?.id ?? null);
  const query = useQuery({
    queryKey: ['metrics', userId ?? 'guest', 'dashboard', completionDays],
    enabled: !!userId,
    queryFn: async (): Promise<DashboardData> => {
      const uid = userId as string;
      const fromDate = completionDays === null
        ? undefined
        : toLocalDateStr(addLocalDays(new Date(), -Math.max(0, completionDays - 1)));
      const [habits, completions, tasks, goals] = await Promise.all([
        fetchHabitRows(uid),
        completionDays === 0 ? Promise.resolve([]) : fetchCompletionRows(uid, fromDate),
        fetchTaskRows(uid),
        fetchGoalRows(uid),
      ]);
      return { habits, completions, tasks, goals };
    },
  });
  return { ...query, data: query.data ?? EMPTY_DASHBOARD, isGuest: !userId };
}

/** Stable callback (safe in effect / callback deps). */
export function useInvalidateMetrics() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ['metrics'] }), [qc]);
}
