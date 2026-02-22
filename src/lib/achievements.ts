import type { Achievement } from './types';

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: '1', code: 'first_habit', title: 'Первые шаги',
    description: 'Создать первую привычку', icon: '🌱',
    xpReward: 10, starsReward: 5, category: 'habits',
    condition: (s) => s.totalHabitsCreated >= 1,
  },
  {
    id: '2', code: 'planner', title: 'Планировщик',
    description: 'Создать 5 задач', icon: '📋',
    xpReward: 15, starsReward: 10, category: 'tasks',
    condition: (s) => s.totalTasksCreated >= 5,
  },
  {
    id: '3', code: 'achiever', title: 'Целеустремлённый',
    description: 'Создать первую цель', icon: '🎯',
    xpReward: 20, starsReward: 15, category: 'goals',
    condition: (s) => s.totalGoalsCreated >= 1,
  },
  {
    id: '4', code: 'week_power', title: 'Неделя силы',
    description: 'Серия 7 дней', icon: '🔥',
    xpReward: 100, starsReward: 25, category: 'streak',
    condition: (s) => s.currentStreak >= 7,
  },
  {
    id: '5', code: 'month_power', title: 'Месяц власти',
    description: 'Серия 30 дней', icon: '👑',
    xpReward: 500, starsReward: 100, category: 'streak',
    condition: (s) => s.currentStreak >= 30,
  },
  {
    id: '6', code: 'finance_guru', title: 'Финансовая грамотность',
    description: '50 финансовых операций', icon: '💰',
    xpReward: 50, starsReward: 30, category: 'finance',
    condition: (s) => s.totalFinanceOps >= 50,
  },
  {
    id: '7', code: 'task_master', title: 'Мастер задач',
    description: 'Выполнить 25 задач', icon: '✅',
    xpReward: 75, starsReward: 40, category: 'tasks',
    condition: (s) => s.totalTasksCompleted >= 25,
  },
  {
    id: '8', code: 'habit_hero', title: 'Герой привычек',
    description: 'Выполнить 100 привычек', icon: '🏆',
    xpReward: 100, starsReward: 50, category: 'habits',
    condition: (s) => s.totalHabitsCompleted >= 100,
  },
  {
    id: '9', code: 'focus_master', title: 'Мастер фокуса',
    description: '10 сессий Pomodoro', icon: '⏱️',
    xpReward: 50, starsReward: 20, category: 'focus',
    condition: (s) => s.totalPomodoroSessions >= 10,
  },
  {
    id: '10', code: 'first_task', title: 'Дело сделано',
    description: 'Выполнить первую задачу', icon: '☑️',
    xpReward: 10, starsReward: 5, category: 'tasks',
    condition: (s) => s.totalTasksCompleted >= 1,
  },
];
