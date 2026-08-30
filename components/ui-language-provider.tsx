'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { translateUi, type UiLanguage } from '@/lib/ui-language';

const LanguageContext = createContext<{
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
}>({ language: 'en', setLanguage: () => {} });

export function UiLanguageProvider({
  language: initialLanguage,
  children,
}: {
  language: UiLanguage;
  children: ReactNode;
}) {
  const [language, setLanguage] = useState(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useUiText() {
  const { language, setLanguage } = useContext(LanguageContext);
  const t = useCallback(
    (text: string, values?: Record<string, string | number>) =>
      translateUi(language, text, values),
    [language],
  );
  return { language, setLanguage, t };
}
