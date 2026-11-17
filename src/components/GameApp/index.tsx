"use client";

import { startTelegramApp } from '@/telegram/webApp';
import { useEffect } from 'react';
import AppTheme from '../AppTheme';
import GameWrapper from '../GameWrapper';

export default function GameApp() {
  useEffect(() => startTelegramApp(), []);

  return (
    <AppTheme>
      <main className="game-container">
        <GameWrapper />
      </main>
    </AppTheme>
  );
}
