import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SUPPORTED_LANGUAGES, type Language } from '../utils/languages';
import { readJson, StorageKeys, writeJson } from '../utils/storage';

// Bump when the consent text changes so users see it again.
export const CONSENT_VERSION = 1;

export type Prefs = {
  langIndex: number;
  consentVersion: number;
  translateTo: number | null;
  captionScale: number;
  loudSensitivity: 'low' | 'medium' | 'high';
  alertKeywords: string[];
  // Classroom Broadcast: ask the computer for captions in the app language.
  mirrorTranslate: boolean;
};

const DEFAULT_PREFS: Prefs = {
  langIndex: 0,
  consentVersion: 0,
  translateTo: null,
  captionScale: 1,
  loudSensitivity: 'medium',
  alertKeywords: [],
  mirrorTranslate: false,
};

type PrefsContextType = {
  ready: boolean;
  prefs: Prefs;
  updatePrefs: (patch: Partial<Prefs>) => void;
  langIndex: number;
  setLangIndex: (index: number) => void;
  activeLang: Language;
  hasConsented: boolean;
};

const PrefsContext = createContext<PrefsContextType>({
  ready: false,
  prefs: DEFAULT_PREFS,
  updatePrefs: () => {},
  langIndex: 0,
  setLangIndex: () => {},
  activeLang: SUPPORTED_LANGUAGES[0],
  hasConsented: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    readJson(StorageKeys.prefs, DEFAULT_PREFS).then((stored) => {
      const langIndex = stored.langIndex >= 0 && stored.langIndex < SUPPORTED_LANGUAGES.length ? stored.langIndex : 0;
      setPrefs({ ...DEFAULT_PREFS, ...stored, langIndex });
      setReady(true);
    });
  }, []);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      writeJson(StorageKeys.prefs, next);
      return next;
    });
  }, []);

  const value = useMemo<PrefsContextType>(() => ({
    ready,
    prefs,
    updatePrefs,
    langIndex: prefs.langIndex,
    setLangIndex: (index: number) => updatePrefs({ langIndex: index }),
    activeLang: SUPPORTED_LANGUAGES[prefs.langIndex] ?? SUPPORTED_LANGUAGES[0],
    hasConsented: prefs.consentVersion >= CONSENT_VERSION,
  }), [ready, prefs, updatePrefs]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export const useLanguage = () => useContext(PrefsContext);
export const usePrefs = () => useContext(PrefsContext);
