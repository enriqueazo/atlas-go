import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { deviceLang, strings, type Lang, type Strings } from '@/i18n';

export type Mode = 'countries' | 'capitals' | 'silhouette' | 'flags';
export type Volume = 'off' | 'low' | 'medium' | 'high';

// The appearance lives in the theme (see theme.tsx), like in Vocablo.
type Stored = {
  sound: Volume;
  lang: 'system' | Lang;
  records: Record<Mode, number>;
};

const DEFAULTS: Stored = {
  sound: 'medium',
  lang: 'system',
  records: { countries: 0, capitals: 0, silhouette: 0, flags: 0 },
};

const KEY = 'atlas-go/settings/v1';

type SettingsValue = Stored & {
  ready: boolean;
  t: Strings;
  language: Lang;
  update: (patch: Partial<Omit<Stored, 'records'>>) => void;
  saveRecord: (mode: Mode, points: number) => void;
};

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<Stored>;
        setState((s) => ({ ...s, ...saved, records: { ...s.records, ...saved.records } }));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const update = useCallback((patch: Partial<Omit<Stored, 'records'>>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const saveRecord = useCallback((mode: Mode, points: number) => {
    setState((s) =>
      points > s.records[mode] ? { ...s, records: { ...s.records, [mode]: points } } : s,
    );
  }, []);

  const value = useMemo(() => {
    const language = state.lang === 'system' ? deviceLang() : state.lang;
    return { ...state, ready, language, t: strings[language], update, saveRecord };
  }, [state, ready, update, saveRecord]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings outside SettingsProvider');
  return value;
}
