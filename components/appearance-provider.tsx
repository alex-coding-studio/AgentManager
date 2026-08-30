'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { resolveUiTheme, type UiTheme } from '@/lib/ui-theme';

const AppearanceContext = createContext<{
  theme: UiTheme;
  setTheme: (theme: UiTheme) => void;
}>({ theme: 'system', setTheme: () => {} });

export function AppearanceProvider({
  theme: initialTheme,
  children,
}: {
  theme: UiTheme;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.classList.toggle(
        'dark',
        resolveUiTheme(theme, media.matches) === 'dark',
      );
    };
    apply();
    if (theme === 'system') media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return (
    <AppearanceContext.Provider value={{ theme, setTheme }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export const useAppearance = () => useContext(AppearanceContext);
