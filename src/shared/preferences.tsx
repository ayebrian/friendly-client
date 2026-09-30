import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
const Context = createContext<{ theme: Theme; setTheme: (value: Theme) => void }>({
  theme: 'system',
  setTheme: () => {},
});
export const usePreferences = () => useContext(Context);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const value = localStorage.getItem('friendly.theme');
      return value === 'dark' || value === 'light' ? value : 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && !!media?.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          'content',
          getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim(),
        );
    };
    apply();
    media?.addEventListener('change', apply);
    try {
      localStorage.setItem('friendly.theme', theme);
    } catch {
      /* Optional preference storage. */
    }
    return () => media?.removeEventListener('change', apply);
  }, [theme]);
  return <Context value={{ theme, setTheme }}>{children}</Context>;
}
