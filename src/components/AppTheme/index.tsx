"use client";

import { telegramWebApp } from '@/telegram/webApp';
import { ReactNode, useEffect } from 'react';

export default function AppTheme({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const scheme = telegramWebApp()?.colorScheme ?? (media.matches ? 'dark' : 'light');
      root.classList.remove('light', 'dark');
      root.classList.add(scheme);
    };
    apply();
    media.addEventListener('change', apply);
    const webApp = telegramWebApp();
    webApp?.onEvent('themeChanged', apply);
    return () => {
      media.removeEventListener('change', apply);
      webApp?.offEvent('themeChanged', apply);
    };
  }, []);

  return children;
}
