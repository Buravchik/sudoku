import { PaceSample, compactPaceForSend, sanitizePace } from '@/sudoku/pace';

export interface GroupLeader {
  name: string;
  seconds: number;
  total: number;
  samples: PaceSample[];
}

export interface GroupPlayer {
  name: string;
  left: number;
  total: number;
  finished: boolean;
}

export interface LiveRival {
  name: string;
  seconds: number;
  total: number;
  samples: PaceSample[];
}

function readRival(value: unknown): LiveRival | null {
  if (!value || typeof value !== 'object') return null;
  const rival = value as { name?: unknown; seconds?: unknown; total?: unknown; samples?: unknown };
  if (typeof rival.name !== 'string' || rival.name.trim() === '') return null;
  if (typeof rival.seconds !== 'number' || !Number.isInteger(rival.seconds) || rival.seconds < 0) return null;
  if (typeof rival.total !== 'number' || !Number.isInteger(rival.total) || rival.total < 0) return null;
  const samples = sanitizePace(rival.samples, rival.total, rival.seconds);
  if (!samples) return null;
  return { name: rival.name, seconds: rival.seconds, total: rival.total, samples };
}

export async function submitGroupScore(
  seconds: number,
  samples: PaceSample[],
  total: number,
): Promise<{ place: number; improved: boolean } | null> {
  const url = process.env.NEXT_PUBLIC_SCORE_URL;
  const initData = window.Telegram?.WebApp?.initData;
  if (!url || !initData) return null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, seconds, total, samples: compactPaceForSend(samples) }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; place?: number; improved?: boolean };
    if (!payload.ok || typeof payload.place !== 'number' || typeof payload.improved !== 'boolean') return null;
    return { place: payload.place, improved: payload.improved };
  } catch (error) {
    console.error('Failed to submit the chat score.', error);
    return null;
  }
}

export async function syncGroupRace(
  left: number,
  total: number,
  seconds: number,
  samples: PaceSample[],
): Promise<{ leader: GroupLeader | null; players: GroupPlayer[]; rival: LiveRival | null } | null> {
  const url = process.env.NEXT_PUBLIC_SCORE_URL?.replace(/\/score\/?$/, '/progress');
  const initData = window.Telegram?.WebApp?.initData;
  if (!url || !initData) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, left, total, seconds, samples: compactPaceForSend(samples) }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; leader?: GroupLeader | null; players?: GroupPlayer[]; rival?: LiveRival | null };
    if (!payload.ok || !Array.isArray(payload.players)) return null;
    return { leader: payload.leader ?? null, players: payload.players, rival: readRival(payload.rival) };
  } catch (error) {
    console.error('Failed to sync the live race.', error);
    return null;
  }
}
