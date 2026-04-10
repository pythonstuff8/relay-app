import React, { createContext, useContext, useState, useEffect } from 'react';
import { SUPPORTED_LANGUAGES } from '../utils/languages';

interface LanguageContextType {
  langIndex: number;
  setLangIndex: (index: number) => void;
  activeLang: typeof SUPPORTED_LANGUAGES[0];
}

const LanguageContext = createContext<LanguageContextType>({
  langIndex: 0,
  setLangIndex: () => {},
  activeLang: SUPPORTED_LANGUAGES[0],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [langIndex, setLangIndex] = useState(0);

  return (
    <LanguageContext.Provider value={{ langIndex, setLangIndex, activeLang: SUPPORTED_LANGUAGES[langIndex] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
