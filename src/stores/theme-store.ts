import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'jetfocus-theme';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

/**
 * Parses the persisted zustand payload (`{"state":{"theme":"light"},"version":0}`).
 * Anything unexpected (missing, corrupted JSON, unknown value) falls back to dark.
 */
export function parseStoredTheme(raw: string | null | undefined): Theme {
  if (!raw) return 'dark';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'state' in parsed) {
      const state = (parsed as { state?: { theme?: unknown } }).state;
      if (state?.theme === 'light') return 'light';
    }
  } catch {
    // Corrupted value — ignore and use the default theme.
  }
  return 'dark';
}

/**
 * localStorage can throw (blocked site data, Safari private mode, sandboxed
 * iframes, quota). A failing storage must never crash the app at import time.
 */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Storage unavailable — the theme just won't be remembered.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Storage unavailable — nothing to remove.
    }
  },
};

function applyThemeClass(theme: Theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
}

// Apply theme on load (before first paint of React content)
const initialTheme = parseStoredTheme(safeLocalStorage.getItem(STORAGE_KEY) as string | null);
applyThemeClass(initialTheme);

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: initialTheme,
      toggle: () =>
        set((state) => {
          const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
          applyThemeClass(next);
          return { theme: next };
        }),
      setTheme: (theme) => {
        applyThemeClass(theme);
        set({ theme });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ theme: state.theme }),
      // Never trust the persisted value blindly; keep state and <html> class consistent.
      merge: (persisted, current) => {
        const theme: Theme = (persisted as { theme?: unknown } | undefined)?.theme === 'light' ? 'light' : 'dark';
        applyThemeClass(theme);
        return { ...current, theme };
      },
    },
  ),
);
