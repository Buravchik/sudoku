import { PaceSample, compactPaceForSend } from '@/sudoku/pace';

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

export async function syncGroupRace(left: number, total: number): Promise<{ leader: GroupLeader | null; players: GroupPlayer[] } | null> {
  const url = process.env.NEXT_PUBLIC_SCORE_URL?.replace(/\/score\/?$/, '/progress');
  const initData = window.Telegram?.WebApp?.initData;
  if (!url || !initData) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, left, total }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; leader?: GroupLeader | null; players?: GroupPlayer[] };
    if (!payload.ok || !Array.isArray(payload.players)) return null;
    return { leader: payload.leader ?? null, players: payload.players };
  } catch (error) {
    console.error('Failed to sync the live race.', error);
    return null;
  }
}
