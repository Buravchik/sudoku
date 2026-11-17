import { SUDOKU_GURU_LEVEL_MAX, SUDOKU_GURU_LEVEL_MIN, SudokuGuruDifficulty } from './types';

const CODE_BY_DIFFICULTY: Record<SudokuGuruDifficulty, string> = {
  easy: 'e',
  medium: 'm',
  hard: 'h',
  expert: 'x',
  guru: 'g',
};

const DIFFICULTY_BY_CODE: Record<string, SudokuGuruDifficulty> = {
  e: SudokuGuruDifficulty.easy,
  m: SudokuGuruDifficulty.medium,
  h: SudokuGuruDifficulty.hard,
  x: SudokuGuruDifficulty.expert,
  g: SudokuGuruDifficulty.guru,
};

export interface DailyChallenge {
  day: string;
  difficulty: SudokuGuruDifficulty;
  cardId: string;
}

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

export function dailyLevel(day: string, difficulty: SudokuGuruDifficulty): number {
  const span = SUDOKU_GURU_LEVEL_MAX - SUDOKU_GURU_LEVEL_MIN + 1;
  return SUDOKU_GURU_LEVEL_MIN + (fnv(`${day}:${difficulty}`) % span);
}

export function buildStartParam(challenge: DailyChallenge): string {
  return `${CODE_BY_DIFFICULTY[challenge.difficulty]}${challenge.day}-${challenge.cardId}`;
}

export function parseStartParam(value: string | null | undefined): DailyChallenge | null {
  if (!value) return null;
  const match = /^([emhxg])(\d{8})-([a-z0-9]{8})$/.exec(value);
  if (!match) return null;
  const difficulty = DIFFICULTY_BY_CODE[match[1]];
  const day = match[2];
  if (!difficulty || !isRealDay(day)) return null;
  return { day, difficulty, cardId: match[3] };
}

export function parseDifficultyArg(value: string | undefined): SudokuGuruDifficulty | null {
  if (!value) return SudokuGuruDifficulty.easy;
  const normalized = value.trim().toLowerCase();
  if ((Object.values(SudokuGuruDifficulty) as string[]).includes(normalized)) {
    return normalized as SudokuGuruDifficulty;
  }
  return null;
}

function isRealDay(day: string): boolean {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(4, 6));
  const date = Number(day.slice(6, 8));
  if (month < 1 || month > 12 || date < 1 || date > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === date;
}

function fnv(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
