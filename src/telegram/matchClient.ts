import { readSettingsSnapshot } from '@/sudoku/duel';
import { compactPaceForSend, PaceSample, sanitizePace } from '@/sudoku/pace';
import { SudokuGuruDifficulty } from '@/sudoku/types';
import { GameSettingsType } from '@/types';
import { GroupPlayer, LiveRival } from './submitScore';
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
  settings: GameSettingsType | null;
  players: GroupPlayer[];
  rival: LiveRival | null;
}

export interface MatchProgress {
  settings?: GameSettingsType;
  forfeit?: boolean;
  left?: number;
  total?: number;
  seconds?: number;
  samples?: PaceSample[];
  look?: boolean;
  matchId?: string;
}

function endpoint(suffix: string): string | null {
  const url = process.env.NEXT_PUBLIC_SCORE_URL?.replace(/\/score\/?$/, suffix);
  return url || null;
}

export async function fetchMatchState(progress: MatchProgress = {}): Promise<MatchState | null> {
  const url = endpoint('/match/state');
  const initData = window.Telegram?.WebApp?.initData;
  if (!url || !initData) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData,
        matchId: progress.matchId ?? readStartParam(),
        look: progress.look === true,
        settings: progress.settings,
        forfeit: progress.forfeit === true,
        left: progress.left,
        total: progress.total,
        seconds: progress.seconds,
        samples: progress.samples ? compactPaceForSend(progress.samples) : undefined,
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as {
      ok?: boolean;
      difficulty?: SudokuGuruDifficulty;
      level?: number;
      leader?: MatchLeader | null;
      settings?: unknown;
      players?: unknown;
      rival?: unknown;
    };
    if (!payload.ok || !payload.difficulty || typeof payload.level !== 'number') return null;
    return {
      difficulty: payload.difficulty,
      level: payload.level,
      leader: readRival(payload.leader),
      settings: readSettingsSnapshot(payload.settings),
      players: readPlayers(payload.players),
      rival: readRival(payload.rival),
    };
  } catch (error) {
    console.error('Failed to open the shared puzzle.', error);
    return null;
  }
}

function readPlayers(value: unknown): GroupPlayer[] {
  if (!Array.isArray(value)) return [];
  const players: GroupPlayer[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const player = item as { name?: unknown; left?: unknown; total?: unknown; finished?: unknown };
    if (typeof player.name !== 'string' || typeof player.left !== 'number' || typeof player.total !== 'number') continue;
    players.push({ name: player.name, left: player.left, total: player.total, finished: player.finished === true });
  }
  return players;
}

function readRival(value: unknown): LiveRival | null {
  if (!value || typeof value !== 'object') return null;
  const rival = value as { name?: unknown; seconds?: unknown; total?: unknown; samples?: unknown };
  if (typeof rival.name !== 'string' || typeof rival.seconds !== 'number' || typeof rival.total !== 'number') return null;
  const samples = sanitizePace(rival.samples, rival.total, rival.seconds);
  if (!samples) return null;
  return { name: rival.name, seconds: rival.seconds, total: rival.total, samples };
}

export async function reportMatchResult(
  seconds: number,
  samples: PaceSample[],
  total: number,
): Promise<{ leader: LiveRival | null; rival: LiveRival | null } | null> {
  const url = endpoint('/match/result');
  const initData = window.Telegram?.WebApp?.initData;
  if (!url || !initData) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, matchId: readStartParam(), seconds, total, samples: compactPaceForSend(samples) }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; leader?: unknown; rival?: unknown };
    if (!payload.ok) return null;
    return { leader: readRival(payload.leader), rival: readRival(payload.rival) };
  } catch (error) {
    console.error('Failed to record the shared result.', error);
    return null;
  }
}
