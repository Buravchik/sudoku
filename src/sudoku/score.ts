import { SudokuGuruDifficulty } from './types';

export interface ScoreMark {
  t: number;
  stake: number;
  hit: boolean;
}

const LADDER: Record<SudokuGuruDifficulty, { multiplier: number; halfLife: number }> = {
  easy: { multiplier: 1, halfLife: 4 * 60 },
  medium: { multiplier: 2, halfLife: 8 * 60 },
  hard: { multiplier: 4, halfLife: 16 * 60 },
  expert: { multiplier: 8, halfLife: 32 * 60 },
  guru: { multiplier: 16, halfLife: 64 * 60 },
};

export function difficultyMultiplier(difficulty: SudokuGuruDifficulty): number {
  return LADDER[difficulty].multiplier;
}

/** Points shown for a committed digit. Halves at the casual time for that difficulty, never below 10. */
export function stakeAt(difficulty: SudokuGuruDifficulty, elapsedSeconds: number): number {
  const elapsed = Math.max(0, elapsedSeconds);
  const raw = 100 * Math.pow(2, -elapsed / LADDER[difficulty].halfLife);
  return Math.max(10, Math.round(raw));
}

export function shownTotal(marks: readonly ScoreMark[]): number {
  return marks.reduce((sum, mark) => sum + mark.stake, 0);
}

export function missedStake(marks: readonly ScoreMark[]): number {
  return marks.reduce((sum, mark) => sum + (mark.hit ? 0 : mark.stake), 0);
}

export function finalScore(marks: readonly ScoreMark[], difficulty: SudokuGuruDifficulty): number {
  const net = Math.max(0, shownTotal(marks) - missedStake(marks));
  return difficultyMultiplier(difficulty) * net;
}

export function restoreMarks(value: unknown): ScoreMark[] {
  if (!Array.isArray(value)) return [];
  const marks: ScoreMark[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { t?: unknown; stake?: unknown; hit?: unknown };
    if (typeof record.t !== 'number' || !Number.isInteger(record.t) || record.t < 0 || record.t > 24 * 60 * 60) continue;
    if (typeof record.stake !== 'number' || !Number.isInteger(record.stake) || record.stake < 10 || record.stake > 100) continue;
    if (typeof record.hit !== 'boolean') continue;
    marks.push({ t: record.t, stake: record.stake, hit: record.hit });
    if (marks.length >= 400) break;
  }
  return marks;
}
