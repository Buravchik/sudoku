'use client';

import { Lang, langFrom, messages, Copy } from '@/i18n';
import { telegramLanguage } from '@/telegram/webApp';
import { createContext, useContext, useSyncExternalStore } from 'react';

const LangContext = createContext<Lang>('en');

let cached: Lang | null = null;

function readLang(): Lang | null {
  if (typeof window === 'undefined') return null;
  if (cached) return cached;
  cached = langFrom(telegramLanguage());
  return cached;
}

function subscribe(onChange: () => void): () => void {
  const timer = window.setTimeout(onChange, 0);
  return () => window.clearTimeout(timer);
}

function snapshot(): Lang | null {
  return readLang();
}

function serverSnapshot(): Lang | null {
  return null;
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!lang) return null;
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useMessages(): Copy {
  return messages(useContext(LangContext));
}
