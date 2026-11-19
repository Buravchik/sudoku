import { NICKNAME_BITS } from './nicknames';
import { SudokuGuruDifficulty } from './types';
import { GameSettingsType } from '@/types';

export const ACHIEVEMENT_IDS = ['tomorrow', 'table', 'first', 'blind', 'pencil', 'streak', 'reply'] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

const RANK: Record<SudokuGuruDifficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
  expert: 3,
  guru: 4,
};

const BLIND_ICON: Partial<Record<SudokuGuruDifficulty, string>> = {
  medium: '◇',
  hard: '◆',
  expert: '✦',
  guru: '★',
};

const ICON: Record<Exclude<AchievementId, 'blind'>, string> = {
  tomorrow: '🌱',
  table: '👥',
  first: '🏁',
  pencil: '🧠',
  streak: '🔥',
  reply: '⚔',
};

export interface AchievementState {
  winDays: string[];
  bareDays: string[];
  blind: SudokuGuruDifficulty | null;
  pencil: SudokuGuruDifficulty | null;
  tomorrow: boolean;
  table: boolean;
  first: boolean;
  streak: boolean;
  reply: boolean;
  starters: number[];
  pins: AchievementId[];
}

export interface WinFacts {
  day: string;
  difficulty: SudokuGuruDifficulty;
  bare: boolean;
  pencilUsed: boolean | null;
  firstInChat?: boolean;
  beatBareAuthor?: boolean;
}

export function emptyAchievements(): AchievementState {
  return {
    winDays: [],
    bareDays: [],
    blind: null,
    pencil: null,
    tomorrow: false,
    table: false,
    first: false,
    streak: false,
    reply: false,
    starters: [],
    pins: [],
  };
}

export function bareSettings(settings: GameSettingsType): boolean {
  return NICKNAME_BITS.every(key => settings[key] === false);
}

export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === 'string' && (ACHIEVEMENT_IDS as readonly string[]).includes(value);
}

export function applyWin(state: AchievementState, facts: WinFacts): AchievementState {
  const next: AchievementState = {
    ...state,
    winDays: rememberDay(state.winDays, facts.day),
    bareDays: facts.bare ? rememberDay(state.bareDays, facts.day) : state.bareDays,
    tomorrow: state.tomorrow,
    table: state.table,
    first: state.first || facts.firstInChat === true,
    streak: state.streak,
    reply: state.reply || facts.beatBareAuthor === true,
    blind: state.blind,
    pencil: state.pencil,
    starters: state.starters,
    pins: state.pins,
  };
  next.tomorrow = next.winDays.length >= 2;
  if (facts.bare && RANK[facts.difficulty] >= RANK.medium) {
    next.blind = higher(next.blind, facts.difficulty);
  }
  if (facts.bare && facts.pencilUsed === false && RANK[facts.difficulty] >= RANK.hard) {
    next.pencil = higher(next.pencil, facts.difficulty);
  }
  next.streak = next.streak || consecutiveBareDays(next.bareDays);
  return next;
}

export function applyStart(state: AchievementState, starterId: number): AchievementState {
  if (!Number.isInteger(starterId) || starterId <= 0 || state.starters.includes(starterId)) return state;
  const starters = [...state.starters, starterId].slice(-50);
  return { ...state, starters, table: starters.length >= 3 };
}

export function applyPin(state: AchievementState, id: AchievementId): AchievementState | null {
  if (!earned(state, id)) return null;
  if (state.pins.includes(id)) return { ...state, pins: state.pins.filter(pin => pin !== id) };
  if (state.pins.length >= 2) return null;
  return { ...state, pins: [...state.pins, id] };
}

export function earned(state: AchievementState, id: AchievementId): boolean {
  if (id === 'blind') return state.blind !== null;
  if (id === 'pencil') return state.pencil !== null;
  return state[id];
}

export function cardPrefix(state: AchievementState, difficultyName: (difficulty: SudokuGuruDifficulty) => string): string {
  const chosen = state.pins.filter(id => earned(state, id)).slice(0, 2);
  const shown = chosen.length > 0 ? chosen : state.blind ? ['blind' as const] : [];
  if (shown.length === 0) return '';
  return `${shown.map(id => mark(state, id, difficultyName)).join('  ')}  `;
}

function mark(state: AchievementState, id: AchievementId, difficultyName: (difficulty: SudokuGuruDifficulty) => string): string {
  if (id === 'blind') return state.blind ? `${BLIND_ICON[state.blind] ?? '◇'} ${difficultyName(state.blind)}` : '';
  if (id === 'pencil') return state.pencil ? `🧠 ${difficultyName(state.pencil)}` : '';
  return ICON[id];
}

function higher(current: SudokuGuruDifficulty | null, next: SudokuGuruDifficulty): SudokuGuruDifficulty {
  if (!current || RANK[next] > RANK[current]) return next;
  return current;
}

function rememberDay(days: string[], day: string): string[] {
  if (!/^\d{8}$/.test(day) || days.includes(day)) return days;
  return [...days, day].sort().slice(-40);
}

function consecutiveBareDays(days: string[]): boolean {
  const numbers = [...new Set(days)].map(dayNumber).filter(number => Number.isFinite(number)).sort((left, right) => left - right);
  let run = 1;
  for (let index = 1; index < numbers.length; index += 1) {
    if (numbers[index] === numbers[index - 1] + 1) {
      run += 1;
      if (run >= 3) return true;
    } else if (numbers[index] !== numbers[index - 1]) {
      run = 1;
    }
  }
  return false;
}

function dayNumber(day: string): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(4, 6));
  const date = Number(day.slice(6, 8));
  return Date.UTC(year, month - 1, date) / 86_400_000;
}
