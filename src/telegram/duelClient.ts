import { GhostRace, restoreGhost } from '@/sudoku/duel';
import { PaceSample, compactPaceForSend } from '@/sudoku/pace';
import { SudokuGuruDifficulty } from '@/sudoku/types';

export interface CreatedDuel {
  id: string;
  link: string;
  messageId: string | null;
}

export async function createDuel(input: {
  difficulty: SudokuGuruDifficulty;
  level: number;
  seconds: number;
  total: number;
  samples: PaceSample[];
}): Promise<CreatedDuel | null> {
  const base = apiBase();
  const initData = window.Telegram?.WebApp?.initData;
  if (!base || !initData) return null;

  try {
    const response = await fetch(`${base}/duel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData,
        difficulty: input.difficulty,
        level: input.level,
        seconds: input.seconds,
        total: input.total,
        samples: compactPaceForSend(input.samples),
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; id?: string; link?: string; messageId?: string | null };
    if (!payload.ok || !payload.id || !payload.link) return null;
    return { id: payload.id, link: payload.link, messageId: payload.messageId ?? null };
  } catch (error) {
    console.error('Failed to create a duel.', error);
    return null;
  }
}

export async function fetchDuel(id: string): Promise<GhostRace | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/duel/${id}`);
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; duel?: unknown };
    if (!payload.ok) return null;
    return restoreGhost(payload.duel);
  } catch (error) {
    console.error('Failed to open a duel.', error);
    return null;
  }
}

export async function reportDuelResult(id: string, seconds: number): Promise<void> {
  const base = apiBase();
  const initData = window.Telegram?.WebApp?.initData;
  if (!base || !initData) return;
  try {
    await fetch(`${base}/duel/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, id, seconds }),
    });
  } catch (error) {
    console.error('Failed to report the duel result.', error);
  }
}

function apiBase(): string | null {
  const score = process.env.NEXT_PUBLIC_SCORE_URL;
  if (!score) return null;
  return score.replace(/\/score\/?$/, '');
}
