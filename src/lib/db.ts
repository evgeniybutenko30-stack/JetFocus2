import Dexie, { type Table } from 'dexie';
import type {
  Habit, HabitLog, Task, FinanceOperation, FocusSession, DailyPlan,
  Goal, GoalMilestone, GoalAction, GoalProgressLog, GoalStep,
  UserAchievement, Post, NotificationSetting,
  FinanceAccount, FinanceGoal, RecurringPayment, NotificationItem
} from './types';

class ProductivityDB extends Dexie {
  habits!: Table<Habit>;
  habitLogs!: Table<HabitLog>;
  tasks!: Table<Task>;
  goals!: Table<Goal>;
  goalMilestones!: Table<GoalMilestone>;
  goalActions!: Table<GoalAction>;
  goalSteps!: Table<GoalStep>;
  goalProgressLogs!: Table<GoalProgressLog>;
  financeOperations!: Table<FinanceOperation>;
  financeAccounts!: Table<FinanceAccount>;
  financeGoals!: Table<FinanceGoal>;
  recurringPayments!: Table<RecurringPayment>;
  focusSessions!: Table<FocusSession>;
  dailyPlans!: Table<DailyPlan>;
  userAchievements!: Table<UserAchievement>;
  posts!: Table<Post>;
  notifications!: Table<NotificationItem>;
  notificationSettings!: Table<NotificationSetting>;

  constructor() {
    super('ProductivityApp');
    this.version(3).stores({
      habits: 'id, userId, sphere, isArchived',
      habitLogs: 'id, habitId, userId, date',
      tasks: 'id, userId, status, sphere, dueDate',
      goals: 'id, userId, sphere, isAchieved',
      financeOperations: 'id, userId, type, date, category, sphere, accountId',
      financeAccounts: 'id, userId, type',
      financeGoals: 'id, userId, sphere',
      recurringPayments: 'id, userId, isActive',
      focusSessions: 'id, userId, date, type',
      dailyPlans: 'id, userId, date',
      userAchievements: 'id, userId, achievementCode',
      posts: 'id, userId, createdAt',
      notifications: 'id, userId, type, isRead, createdAt',
      notificationSettings: 'id, userId',
    });
    this.version(4).stores({
      habits: 'id, userId, sphere, isArchived',
      habitLogs: 'id, habitId, userId, date',
      tasks: 'id, userId, status, sphere, dueDate',
      goals: 'id, userId, sphere, isAchieved, status, isPinned',
      goalMilestones: 'id, goalId, userId, status, orderIndex',
      goalActions: 'id, goalId, userId, milestoneId, status, dueDate',
      goalProgressLogs: 'id, goalId, userId, date',
      financeOperations: 'id, userId, type, date, category, sphere, accountId',
      financeAccounts: 'id, userId, type',
      financeGoals: 'id, userId, sphere',
      recurringPayments: 'id, userId, isActive',
      focusSessions: 'id, userId, date, type',
      dailyPlans: 'id, userId, date',
      userAchievements: 'id, userId, achievementCode',
      posts: 'id, userId, createdAt',
      notifications: 'id, userId, type, isRead, createdAt',
      notificationSettings: 'id, userId',
    });
    this.version(5).stores({
      habits: 'id, userId, sphere, isArchived',
      habitLogs: 'id, habitId, userId, date',
      tasks: 'id, userId, status, sphere, dueDate',
      goals: 'id, userId, sphere, isAchieved, status, isPinned',
      goalMilestones: 'id, goalId, userId, status, orderIndex',
      goalActions: 'id, goalId, userId, milestoneId, status, dueDate',
      goalSteps: 'id, goalId, milestoneId, userId, status, dueDate, orderIndex',
      goalProgressLogs: 'id, goalId, userId, date',
      financeOperations: 'id, userId, type, date, category, sphere, accountId',
      financeAccounts: 'id, userId, type',
      financeGoals: 'id, userId, sphere',
      recurringPayments: 'id, userId, isActive',
      focusSessions: 'id, userId, date, type',
      dailyPlans: 'id, userId, date',
      userAchievements: 'id, userId, achievementCode',
      posts: 'id, userId, createdAt',
      notifications: 'id, userId, type, isRead, createdAt',
      notificationSettings: 'id, userId',
    });
  }
}

export const db = new ProductivityDB();
