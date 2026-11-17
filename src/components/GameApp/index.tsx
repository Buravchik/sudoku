"use client";

import { startTelegramApp } from '@/telegram/webApp';
import { useEffect } from 'react';
import AppTheme from '../AppTheme';
import GameWrapper from '../GameWrapper';
import { LangProvider } from '../Locale';

export default function GameApp() {
  useEffect(() => startTelegramApp(), []);

  return (
    <LangProvider>
      <AppTheme>
        <main className="game-container">
          <GameWrapper />
        </main>
      </AppTheme>
    </LangProvider>
  );
}
