import { describe, it, expect, beforeEach } from 'vitest';
import { parseStoredTheme, useThemeStore } from './theme-store';

describe('parseStoredTheme', () => {
  it('reads the persisted zustand payload', () => {
    expect(parseStoredTheme('{"state":{"theme":"light"},"version":0}')).toBe('light');
    expect(parseStoredTheme('{"state":{"theme":"dark"},"version":0}')).toBe('dark');
  });

  it('falls back to dark for missing, corrupted or unknown values', () => {
    expect(parseStoredTheme(null)).toBe('dark');
    expect(parseStoredTheme('')).toBe('dark');
    expect(parseStoredTheme('{not json')).toBe('dark');
    expect(parseStoredTheme('"light"')).toBe('dark');
    expect(parseStoredTheme('{"state":{"theme":"purple"}}')).toBe('dark');
    expect(parseStoredTheme('null')).toBe('dark');
  });
});

describe('useThemeStore', () => {
  beforeEach(() => {
    useThemeStore.getState().setTheme('dark');
  });

  it('setTheme updates state and the <html> class', () => {
    useThemeStore.getState().setTheme('light');
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);

    useThemeStore.getState().setTheme('dark');
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('toggle flips the theme and persists it', () => {
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(parseStoredTheme(window.localStorage.getItem('jetfocus-theme'))).toBe('light');
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe('dark');
  });
});
