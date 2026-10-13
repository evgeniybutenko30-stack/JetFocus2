import type { User } from '@supabase/supabase-js';
import { xpForLevel } from '@/lib/constants';

/**
 * Returns true when two Supabase user objects describe the same account in the
 * same state. Supabase hands out a fresh `User` object on every auth event
 * (INITIAL_SESSION, TOKEN_REFRESHED, SIGNED_IN on tab focus, ...). Keeping the
 * previous reference when nothing meaningful changed prevents every
 * `useEffect(..., [user])` in the app from re-running (and refetching) on each
 * token refresh.
 */
export function isSameAuthUser(prev: User | null | undefined, next: User | null | undefined): boolean {
  if (!prev || !next) return prev === next;
  if (prev === next) return true;
  return (
    prev.id === next.id &&
    prev.email === next.email &&
    prev.phone === next.phone &&
    prev.updated_at === next.updated_at &&
    prev.email_confirmed_at === next.email_confirmed_at &&
    JSON.stringify(prev.user_metadata ?? {}) === JSON.stringify(next.user_metadata ?? {}) &&
    JSON.stringify(prev.app_metadata ?? {}) === JSON.stringify(next.app_metadata ?? {})
  );
}

/** Default display name for a freshly signed-in user before the profile row is loaded. */
export function defaultDisplayName(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0]?.trim();
  return local || 'Пользователь';
}

/**
 * Adds XP and rolls over levels using the same thresholds the UI shows
 * (`xpForLevel` from constants). Non-finite amounts are ignored and XP never
 * goes below zero.
 */
export function applyXp(level: number, xp: number, amount: number): { level: number; xp: number } {
  let nextLevel = Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
  let nextXp = Number.isFinite(xp) ? xp : 0;
  if (Number.isFinite(amount)) nextXp += amount;
  if (nextXp < 0) nextXp = 0;
  while (nextXp >= xpForLevel(nextLevel)) {
    nextXp -= xpForLevel(nextLevel);
    nextLevel += 1;
  }
  return { level: nextLevel, xp: nextXp };
}

const AUTH_ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Неверный email или пароль'],
  [/email not confirmed/i, 'Email не подтверждён. Перейдите по ссылке из письма'],
  [/user already registered|already been registered/i, 'Пользователь с таким email уже зарегистрирован'],
  [/password should be at least/i, 'Пароль должен содержать минимум 6 символов'],
  [/unable to validate email address|invalid format|email address .* is invalid/i, 'Некорректный email'],
  [/rate limit|too many requests|for security purposes/i, 'Слишком много попыток. Попробуйте позже'],
  [/failed to fetch|network ?error|load failed|fetch failed/i, 'Нет соединения с сервером. Проверьте интернет'],
  [/signups? not allowed|signup is disabled/i, 'Регистрация временно недоступна'],
];

/** Maps common Supabase auth error messages (English) to user-facing Russian text. */
export function translateAuthError(message: string | null | undefined): string {
  const text = (message ?? '').trim();
  if (!text) return 'Произошла ошибка. Попробуйте ещё раз';
  for (const [pattern, translated] of AUTH_ERROR_TRANSLATIONS) {
    if (pattern.test(text)) return translated;
  }
  return text;
}
