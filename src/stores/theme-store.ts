import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  theme: 'dark' | 'light';
  toggle: () => void;
}

// Apply theme on load
const stored = JSON.parse(localStorage.getItem('jetfocus-theme') || '{}');
if (stored?.state?.theme === 'light') {
  document.documentElement.classList.add('light');
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: (stored?.state?.theme as 'dark' | 'light') || 'dark',
      toggle: () =>
        set((state) => {
          const next = state.theme === 'dark' ? 'light' : 'dark';
          document.documentElement.classList.toggle('light', next === 'light');
          return { theme: next };
        }),
    }),
    { name: 'jetfocus-theme' }
  )
);
