"use client";

import { telegramWebApp } from '@/telegram/webApp';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ReactNode, useEffect } from 'react';

const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  colorSchemes: {
    light: true,
    dark: true,
  },
});

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

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
