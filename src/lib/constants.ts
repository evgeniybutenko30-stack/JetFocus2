import type { SphereType, SphereCategory } from './types';

export const SPHERES: { id: SphereType; name: string; icon: string; color: string; category: SphereCategory }[] = [
  // Личное
  { id: 'health', name: 'Тело', icon: '💪', color: 'sphere-health', category: 'personal' },
  { id: 'development', name: 'Разум', icon: '🧠', color: 'sphere-development', category: 'personal' },
  { id: 'spirituality', name: 'Дух', icon: '🧘', color: 'sphere-spirituality', category: 'personal' },
  { id: 'leisure', name: 'Отдых', icon: '🍃', color: 'sphere-leisure', category: 'personal' },
  // Социальное
  { id: 'career', name: 'Дело', icon: '💼', color: 'sphere-career', category: 'social' },
  { id: 'finance', name: 'Деньги', icon: '💰', color: 'sphere-finance', category: 'social' },
  { id: 'family', name: 'Семья', icon: '👨‍👩‍👧‍👦', color: 'sphere-family', category: 'social' },
  { id: 'relationships', name: 'Связи', icon: '💖', color: 'sphere-relationships', category: 'social' },
];

export const PERSONAL_SPHERES = SPHERES.filter(s => s.category === 'personal');
export const SOCIAL_SPHERES = SPHERES.filter(s => s.category === 'social');

export const HABIT_CATEGORIES = [
  { id: 'health', name: 'Здоровье', icon: '🏥', color: '#10B981' },
  { id: 'learning', name: 'Обучение', icon: '📚', color: '#3B82F6' },
  { id: 'productivity', name: 'Продуктивность', icon: '🎯', color: '#FF9500' },
  { id: 'mindfulness', name: 'Осознанность', icon: '🧘', color: '#8B5CF6' },
  { id: 'business', name: 'Бизнес', icon: '💼', color: '#EF4444' },
  { id: 'development', name: 'Саморазвитие', icon: '🌱', color: '#10B981' },
];

export const TASK_CATEGORIES = [
  { id: 'work', name: 'Работа', icon: '💼', color: '#3B82F6' },
  { id: 'personal', name: 'Личное', icon: '👤', color: '#8B5CF6' },
  { id: 'home', name: 'Дом', icon: '🏠', color: '#F59E0B' },
  { id: 'health', name: 'Здоровье', icon: '💊', color: '#10B981' },
];

export const INCOME_CATEGORIES = [
  { name: 'Зарплата', icon: '💼' },
  { name: 'Бизнес', icon: '💰' },
  { name: 'Инвестиции', icon: '📈' },
  { name: 'Фриланс', icon: '💻' },
  { name: 'Подарок', icon: '🎁' },
  { name: 'Кэшбэк', icon: '💵' },
  { name: 'Прочее', icon: '💵' },
];

export const EXPENSE_CATEGORIES = [
  { name: 'Еда', icon: '🍔' },
  { name: 'Транспорт', icon: '🚗' },
  { name: 'Жильё', icon: '🏠' },
  { name: 'Здоровье', icon: '💊' },
  { name: 'Развлечения', icon: '🎮' },
  { name: 'Подписки', icon: '🔄' },
  { name: 'Бизнес', icon: '💼' },
  { name: 'Инвестиции', icon: '📈' },
  { name: 'Одежда', icon: '👕' },
  { name: 'Образование', icon: '📚' },
  { name: 'Связь', icon: '📱' },
  { name: 'Спорт', icon: '🏋️' },
  { name: 'Кафе', icon: '☕' },
  { name: 'Техника', icon: '💻' },
  { name: 'Подарки', icon: '🎁' },
  { name: 'Прочее', icon: '💵' },
];

export const ACCOUNT_TYPES = [
  { type: 'CARD' as const, name: 'Карта', icon: '💳' },
  { type: 'CASH' as const, name: 'Наличные', icon: '💵' },
  { type: 'SAVINGS' as const, name: 'Накопительный', icon: '🏦' },
  { type: 'INVESTMENT' as const, name: 'Инвестиции', icon: '📈' },
  { type: 'CRYPTO' as const, name: 'Крипто', icon: '🪙' },
  { type: 'OTHER' as const, name: 'Другое', icon: '➕' },
];

export const CURRENCIES = ['₽', '$', '€', '£'];

export const GOAL_TYPES: { type: 'saving' | 'investment' | 'purchase' | 'reserve'; name: string; icon: string; color: string }[] = [
  { type: 'saving', name: 'Накопление', icon: '🟢', color: '#10B981' },
  { type: 'investment', name: 'Инвестиции', icon: '🔵', color: '#3B82F6' },
  { type: 'purchase', name: 'Покупка', icon: '🟣', color: '#8B5CF6' },
  { type: 'reserve', name: 'Резерв', icon: '🟡', color: '#F59E0B' },

];

export const GOAL_ICONS = ['🎯', '🛡️', '✈️', '📈', '🏠', '🚗', '💎', '🎓', '💻', '📱', '💰', '🏖️'];

export const SCHEDULE_LABELS: Record<string, string> = {
  DAILY: 'Каждый день',
  WEEKDAYS: 'Будни',
  CUSTOM: 'Выбранные дни',
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
};

export const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export const EMOJI_LIST = [
  '💪', '🏃', '🧘', '📚', '💼', '💰', '❤️', '👨‍👩‍👧‍👦',
  '🎮', '🎵', '🎨', '✍️', '🧠', '🌟', '🔥', '⚡',
  '🍎', '💧', '😴', '🧹', '📱', '🎯', '🏆', '🌙',
];

export const COLOR_LIST = [
  '#1BDEAC', '#10b981', '#3b82f6', '#f59e0b', '#ec4899',
  '#8b5cf6', '#06b6d4', '#84cc16', '#a855f7',
  '#ef4444', '#f97316', '#14b8a6', '#6366f1',
];

export function getSphereById(id: SphereType) {
  return SPHERES.find(s => s.id === id) || SPHERES[0];
}

export function getSphereColor(id: SphereType): string {
  const map: Record<SphereType, string> = {
    health: '#10b981',
    career: '#3b82f6',
    finance: '#f59e0b',
    relationships: '#ec4899',
    family: '#8b5cf6',
    development: '#06b6d4',
    leisure: '#84cc16',
    spirituality: '#a855f7',
  };
  return map[id] || '#6B7280';
}

export function formatCurrency(kopecks: number): string {
  const rub = kopecks / 100;
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rub) + ' ₽';
}

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function getTodayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateRu(date: Date): string {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

// Gamification
export function xpForLevel(level: number): number {
  return Math.round(100 * level * 1.5);
}

export function getLevelName(level: number): string {
  if (level <= 10) return 'Новичок';
  if (level <= 25) return 'Практикующий';
  if (level <= 50) return 'Мастер';
  if (level <= 75) return 'Эксперт';
  if (level <= 100) return 'Легенда';
  return 'Грандмастер';
}

export const XP_REWARDS = {
  taskComplete: 25,
  habitComplete: 15,
  star: 10,
  streak7: 100,
  streak14: 200,
  streak30: 500,
  inviteFriend: 50,
  pomodoroComplete: 10,
};
