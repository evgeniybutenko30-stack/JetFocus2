// ============= Full file contents =============

export type SphereType =
  | 'health' | 'career' | 'finance' | 'relationships'
  | 'family' | 'development' | 'leisure' | 'spirituality';

export type SphereCategory = 'personal' | 'social';

export interface User {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  isGuest: boolean;
  birthDate?: string;
  location?: string;
  status?: string;
  bio?: string;
  interests?: string[];
  expertise?: string;
  helpWith?: string;
  telegram?: string;
  phone?: string;
  level: number;
  xp: number;
  stars: number;
  createdAt: number;
  syncedAt?: number;
}

export interface Habit {
  id: string;
  userId: string;
  title: string;
  icon: string;
  sphere: SphereType;
  category?: string;
  scheduleType: 'DAILY' | 'WEEKDAYS' | 'CUSTOM';
  customDays?: number[];
  reminderTime?: string;
  color: string;
  goalId?: string;
  tags?: string[];
  repetitionsPerDay?: number;
  completedRepetitions?: number;
  periodType?: 'NONE' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';
  periodEnd?: string;
  targetDays?: number[]; // 0-6 Sun-Sat
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
}

export interface HabitLog {
  id: string;
  habitId: string;
  userId: string;
  date: string;
  status: 'DONE' | 'SKIPPED' | 'PENDING';
  completedAt?: number;
  note?: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  sphere: SphereType;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  dueDate?: string;
  reminderTime?: string;
  tags: string[];
  category?: string;
  parentTaskId?: string;
  subtasks?: { id: string; title: string; done: boolean }[];
  goalId?: string;
  recurrence?: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  icon?: string;
  color?: string;
  attachments?: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// ============= GOALS SYSTEM (v2) =============

export type GoalType = 'habit_based' | 'task_based' | 'milestone_based' | 'numeric';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';
export type GoalProgressMode = 'numeric' | 'milestones' | 'binary' | 'score';

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  sphere: SphereType;
  type: GoalType;
  status: GoalStatus;
  priority: number; // 1-5
  progressMode: GoalProgressMode;
  startValue: number;
  targetValue: number;
  currentValue: number;
  startDate?: string;
  targetDate?: string; // дедлайн
  isPinned: boolean;
  visibility: 'private' | 'shared';
  // Legacy compat
  progress: number; // вычисляется из currentValue/targetValue
  isAchieved: boolean;
  milestones: { title: string; done: boolean }[]; // legacy simple milestones
  deadline?: string; // alias for targetDate
  budget?: number;
  createdAt: number;
  updatedAt: number;
}

export interface GoalMilestone {
  id: string;
  goalId: string;
  userId: string;
  title: string;
  dueDate?: string;
  orderIndex: number;
  status: 'todo' | 'done';
  rewardPoints: number;
  note?: string;
  createdAt: number;
}

export interface GoalAction {
  id: string;
  goalId: string;
  userId: string;
  milestoneId?: string;
  title: string;
  type: 'task' | 'habit' | 'one_time';
  dueDate?: string;
  estimatedMinutes?: number;
  status: 'todo' | 'done';
  impact: number; // % contribution to progress
  createdAt: number;
}

export interface GoalProgressLog {
  id: string;
  goalId: string;
  userId: string;
  date: string;
  deltaValue: number;
  sourceType: 'manual' | 'task' | 'habit' | 'milestone' | 'finance';
  sourceId?: string;
  note?: string;
  mood?: number; // 1-5
  createdAt: number;
}

export interface GoalStep {
  id: string;
  goalId: string;
  milestoneId?: string;
  userId: string;
  title: string;
  dueDate?: string;
  status: 'todo' | 'done';
  stepType: 'task' | 'habit' | 'one_time';
  priority: number; // 1-3
  estimatedMinutes: number;
  impactValue: number; // % contribution to progress
  orderIndex: number;
  reminderAt?: string;
  createdAt: number;
}

// ============= END GOALS SYSTEM =============

export type FinanceAccountType = 'CARD' | 'CASH' | 'SAVINGS' | 'CRYPTO' | 'INVESTMENT' | 'OTHER';

export interface FinanceAccount {
  id: string;
  userId: string;
  name: string;
  type: FinanceAccountType;
  balance: number; // kopecks
  currency: string; // ₽, $, €, £
  icon: string;
  color: string;
  isDefault: boolean;
  hideFromTotal: boolean;
  createdAt: number;
}

export interface FinanceOperation {
  id: string;
  userId: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: number; // kopecks
  category: string;
  description?: string;
  tags: string[];
  date: string;
  sphere: SphereType;
  accountId?: string;
  toAccountId?: string; // for transfers
  emotionalTag?: 'useful' | 'neutral' | 'impulsive';
  createdAt: number;
}

export type FinanceGoalType = 'saving' | 'investment' | 'purchase' | 'reserve';

export interface FinanceGoal {
  id: string;
  userId: string;
  title: string;
  goalType: FinanceGoalType;
  targetAmount: number; // kopecks
  currentAmount: number; // kopecks
  deadline?: string;
  accountId?: string;
  icon: string;
  sphere: SphereType;
  createdAt: number;
}

export interface RecurringPayment {
  id: string;
  userId: string;
  title: string;
  amount: number; // kopecks
  category: string;
  sphere: SphereType;
  frequency: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  nextDate: string;
  accountId?: string;
  isActive: boolean;
  createdAt: number;
}

export interface FocusSession {
  id: string;
  userId: string;
  type: 'POMODORO' | 'STOPWATCH';
  startedAt: number;
  endedAt?: number;
  durationSeconds: number;
  targetSeconds?: number;
  linkedType?: 'TASK' | 'SPHERE';
  linkedId?: string;
  isCompleted: boolean;
  date: string;
}

export interface DailyPlan {
  id: string;
  userId: string;
  date: string;
  planItems: string[];
  focusOfDay: string;
  createdAt: number;
  updatedAt: number;
}

export interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  starsReward: number;
  category: string;
  condition: (stats: AchievementStats) => boolean;
}

export interface UserAchievement {
  id: string;
  userId: string;
  achievementCode: string;
  unlockedAt: number;
}

export interface AchievementStats {
  totalHabitsCreated: number;
  totalTasksCreated: number;
  totalTasksCompleted: number;
  totalHabitsCompleted: number;
  totalGoalsCreated: number;
  totalFinanceOps: number;
  currentStreak: number;
  totalPomodoroSessions: number;
}

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  imageUrl?: string;
  likes: number;
  likedBy: string[];
  comments: { id: string; userId: string; userName: string; content: string; createdAt: number }[];
  createdAt: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'social' | 'task' | 'system';
  title: string;
  body: string;
  isRead: boolean;
  link?: string;
  createdAt: number;
}

export interface NotificationSetting {
  id: string;
  userId: string;
  pushEnabled: boolean;
  likesEnabled: boolean;
  commentsEnabled: boolean;
  tasksEnabled: boolean;
  habitsEnabled: boolean;
  goalsEnabled: boolean;
  quietMode: boolean;
}
