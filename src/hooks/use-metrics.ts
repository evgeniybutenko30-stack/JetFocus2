import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/auth-store';
import { getTodayStr } from '@/lib/constants';

function calculateDayProgressScore(metrics: {
  totalHabitsToday: number;
  habitsDoneCount: number;
  totalTasksToday: number;
  tasksDoneCount: number;
  focusMinutesToday: number;
}): number {
  const habitsCompletion = metrics.totalHabitsToday > 0
    ? metrics.habitsDoneCount / metrics.totalHabitsToday : 0;
  const tasksCompletion = metrics.totalTasksToday > 0
    ? metrics.tasksDoneCount / metrics.totalTasksToday : 0;
  const focusCompletion = Math.min(metrics.focusMinutesToday / 25, 1);
  return Math.round((0.4 * habitsCompletion + 0.4 * tasksCompletion + 0.2 * focusCompletion) * 100);
}

export function useMetrics() {
  const user = useAuthStore(s => s.user);
  return useQuery({
    queryKey: ['metrics', user?.id ?? 'guest'],
    enabled: !!user?.id,
    queryFn: async () => {
      const userId = user!.id;
      const today = getTodayStr();
      const dow = new Date().getDay() === 0 ? 7 : new Date().getDay();

      // ─── Habits from Supabase ───
      const { data: allHabits } = await supabase
        .from('habits')
        .select('id, target_days, repetitions_per_day')
        .eq('user_id', userId);

      const habitsToday = (allHabits ?? []).filter(
        (h: any) => Array.isArray(h.target_days) && h.target_days.includes(dow)
      );

      const { data: completions } = await supabase
        .from('habit_completions')
        .select('habit_id, count')
        .eq('user_id', userId)
        .eq('date', today);

      const habitsDoneCount = habitsToday.filter((h: any) => {
        const comp = (completions ?? []).find((c: any) => c.habit_id === h.id);
        return comp && comp.count >= h.repetitions_per_day;
      }).length;

      // ─── Tasks from Supabase ───
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('id, status, due_date, created_at')
        .eq('user_id', userId);

      const tasksToday = (allTasks ?? []).filter((t: any) => {
        if (t.status === 'CANCELLED') return false;
        if (t.due_date === today) return true;
        if (!t.due_date) {
          const created = t.created_at?.slice(0, 10);
          return created === today;
        }
        return false;
      });

      const tasksDoneCount = tasksToday.filter((t: any) => t.status === 'DONE').length;
      const tasksTodoCount = tasksToday.filter((t: any) => t.status === 'TODO' || t.status === 'IN_PROGRESS').length;

      // ─── Goals from Supabase ───
      const { data: allGoals } = await supabase
        .from('goals')
        .select('id, status')
        .eq('user_id', userId);
      const goalsActiveCount = (allGoals ?? []).filter((g: any) => g.status !== 'achieved' && g.status !== 'ACHIEVED').length;

      // ─── Focus sessions from Dexie (no Supabase table) ───
      let focusMinutesToday = 0;
      try {
        const sessions = await db.focusSessions.where('date').equals(today).toArray();
        const userSessions = sessions.filter(s => s.userId === userId);
        focusMinutesToday = Math.floor(userSessions.reduce((s, ses) => s + ses.durationSeconds, 0) / 60);
      } catch { /* table may not exist */ }

      // ─── Finance from Dexie (no Supabase table for finance ops) ───
      let todayIncome = 0;
      let todayExpense = 0;
      let balanceTotal = 0;
      try {
        const allOps = await db.financeOperations.where('userId').equals(userId).toArray();
        const todayOps = allOps.filter(op => op.date === today);
        todayIncome = todayOps.filter(op => op.type === 'INCOME').reduce((s, op) => s + op.amount, 0);
        todayExpense = todayOps.filter(op => op.type === 'EXPENSE').reduce((s, op) => s + op.amount, 0);
        const totalIncome = allOps.filter(op => op.type === 'INCOME').reduce((s, op) => s + op.amount, 0);
        const totalExpense = allOps.filter(op => op.type === 'EXPENSE').reduce((s, op) => s + op.amount, 0);
        balanceTotal = totalIncome - totalExpense;
      } catch { /* table may not exist */ }

      const dayProgressScore = calculateDayProgressScore({
        totalHabitsToday: habitsToday.length,
        habitsDoneCount,
        totalTasksToday: tasksToday.length,
        tasksDoneCount,
        focusMinutesToday,
      });

      return {
        totalHabitsToday: habitsToday.length,
        habitsDoneCount,
        habitsTodoCount: habitsToday.length - habitsDoneCount,
        totalTasksToday: tasksToday.length,
        tasksDoneCount,
        tasksTodoCount,
        focusMinutesToday,
        goalsActiveCount,
        todayIncome,
        todayExpense,
        balanceTotal,
        dayProgressScore,
      };
    },
    refetchInterval: 30000,
  });
}

export function useInvalidateMetrics() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['metrics'] });
}
