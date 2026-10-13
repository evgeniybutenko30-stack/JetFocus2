import { describe, it, expect } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { applyXp, defaultDisplayName, isSameAuthUser, translateAuthError } from './auth-utils';
import { xpForLevel } from './constants';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-a',
    email: 'anna@example.com',
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    ...overrides,
  } as User;
}

describe('isSameAuthUser', () => {
  it('treats a fresh object with identical data as the same user (token refresh)', () => {
    expect(isSameAuthUser(makeUser(), makeUser())).toBe(true);
  });

  it('detects a different account', () => {
    expect(isSameAuthUser(makeUser(), makeUser({ id: 'user-b' }))).toBe(false);
  });

  it('detects updated user data (email / metadata change)', () => {
    expect(isSameAuthUser(makeUser(), makeUser({ email: 'new@example.com' }))).toBe(false);
    expect(isSameAuthUser(makeUser(), makeUser({ user_metadata: { name: 'Anna' } }))).toBe(false);
    expect(isSameAuthUser(makeUser(), makeUser({ updated_at: '2026-02-01T00:00:00Z' }))).toBe(false);
  });

  it('handles null users', () => {
    expect(isSameAuthUser(null, null)).toBe(true);
    expect(isSameAuthUser(makeUser(), null)).toBe(false);
    expect(isSameAuthUser(null, makeUser())).toBe(false);
  });
});

describe('defaultDisplayName', () => {
  it('uses the local part of the email', () => {
    expect(defaultDisplayName('ivan.petrov@mail.ru')).toBe('ivan.petrov');
  });

  it('falls back when email is missing or empty', () => {
    expect(defaultDisplayName(undefined)).toBe('Пользователь');
    expect(defaultDisplayName('')).toBe('Пользователь');
    expect(defaultDisplayName('@mail.ru')).toBe('Пользователь');
  });
});

describe('applyXp', () => {
  it('uses the same thresholds the UI shows (xpForLevel)', () => {
    const almost = xpForLevel(1) - 1;
    expect(applyXp(1, 0, almost)).toEqual({ level: 1, xp: almost });
    expect(applyXp(1, almost, 1)).toEqual({ level: 2, xp: 0 });
  });

  it('rolls over several levels at once and keeps the remainder', () => {
    const amount = xpForLevel(1) + xpForLevel(2) + 7;
    expect(applyXp(1, 0, amount)).toEqual({ level: 3, xp: 7 });
  });

  it('ignores non-finite amounts and never goes negative', () => {
    expect(applyXp(2, 10, Number.NaN)).toEqual({ level: 2, xp: 10 });
    expect(applyXp(2, 10, Number.POSITIVE_INFINITY)).toEqual({ level: 2, xp: 10 });
    expect(applyXp(2, 10, -50)).toEqual({ level: 2, xp: 0 });
  });

  it('repairs an invalid starting level', () => {
    expect(applyXp(0, 0, 5)).toEqual({ level: 1, xp: 5 });
  });
});

describe('translateAuthError', () => {
  it('translates common Supabase auth errors to Russian', () => {
    expect(translateAuthError('Invalid login credentials')).toBe('Неверный email или пароль');
    expect(translateAuthError('Email not confirmed')).toMatch(/не подтверждён/);
    expect(translateAuthError('User already registered')).toMatch(/уже зарегистрирован/);
    expect(translateAuthError('Password should be at least 6 characters.')).toMatch(/минимум 6/);
    expect(translateAuthError('Unable to validate email address: invalid format')).toBe('Некорректный email');
    expect(translateAuthError('For security purposes, you can only request this after 42 seconds.')).toMatch(/Слишком много/);
    expect(translateAuthError('Failed to fetch')).toMatch(/Нет соединения/);
  });

  it('passes through unknown messages and handles empty input', () => {
    expect(translateAuthError('Something odd')).toBe('Something odd');
    expect(translateAuthError('')).toMatch(/ошибка/i);
    expect(translateAuthError(null)).toMatch(/ошибка/i);
  });
});
