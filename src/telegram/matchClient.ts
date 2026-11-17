import { compactPaceForSend, PaceSample } from '@/sudoku/pace';
import { SudokuGuruDifficulty } from '@/sudoku/types';
import { GameSettingsType } from '@/types';
import { readStartParam } from './webApp';

export interface MatchLeader {
  name: string;
  seconds: number;
  total: number;
  samples: PaceSample[];
}

export interface MatchState {
  difficulty: SudokuGuruDifficulty;
  level: number;
  leader: MatchLeader | null;
}

function endpoint(suffix: string): string | null {
  const url = process.env.NEXT_PUBLIC_SCORE_URL?.replace(/\/score\/?$/, suffix);
  return url || null;
}

export async function fetchMatchState(settings?: GameSettingsType, forfeit = false): Promise<MatchState | null> {
  const url = endpoint('/match/state');
  const initData = window.Telegram?.WebApp?.initData;
  if (!url || !initData) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, matchId: readStartParam(), settings, forfeit }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; difficulty?: SudokuGuruDifficulty; level?: number; leader?: MatchLeader | null };
    if (!payload.ok || !payload.difficulty || typeof payload.level !== 'number') return null;
    return { difficulty: payload.difficulty, level: payload.level, leader: payload.leader ?? null };
  } catch (error) {
    console.error('Failed to open the shared puzzle.', error);
    return null;
  }
}

export async function reportMatchResult(seconds: number, samples: PaceSample[], total: number): Promise<void> {
  const url = endpoint('/match/result');
  const initData = window.Telegram?.WebApp?.initData;
  if (!url || !initData) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, matchId: readStartParam(), seconds, total, samples: compactPaceForSend(samples) }),
    });
  } catch (error) {
    console.error('Failed to record the shared result.', error);
  }
}
