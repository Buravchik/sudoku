import { GameSettingsType } from '@/types';
import { PaceSample, sanitizePace } from './pace';
import { SUDOKU_GURU_LEVEL_MAX, SUDOKU_GURU_LEVEL_MIN, SudokuGuruDifficulty } from './types';

const SETTING_KEYS: (keyof GameSettingsType)[] = [
  'highlightRowAndColumn',
  'highlightSameNumbers',
  'highlightSameHints',
  'highlightCrossForNumbers',
  'highlightCrossForHints',
  'hideImpossibleValuesInSelector',
  'hideImpossibleValuesInHints',
  'highlightCurrentQuadrant',
  'highlightQuadrantsWithSameNumber',
  'highlightAllObviousCells',
  'highlightObviousCellsForCurrentNumber',
  'undoMoves',
  'highlightConflicts',
  'countMistakes',
];

const OPTIONAL_OFF: (keyof GameSettingsType)[] = ['undoMoves', 'highlightConflicts', 'countMistakes'];

export interface GhostRace {
  id: string;
  name: string;
  difficulty: SudokuGuruDifficulty;
  level: number;
  seconds: number;
  total: number;
  samples: PaceSample[];
  settings: GameSettingsType;
}

export function parseDuelId(value: string | null | undefined): string | null {
  const match = /^d([a-f0-9]{16})$/.exec(value ?? '');
  return match?.[1] ?? null;
}

export function restoreGhost(value: unknown): GhostRace | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<GhostRace>;
  if (!parseDuelId(typeof record.id === 'string' ? `d${record.id}` : null)) return null;
  if (typeof record.name !== 'string' || !isDifficulty(record.difficulty)) return null;
  if (!Number.isInteger(record.level) || record.level! < SUDOKU_GURU_LEVEL_MIN || record.level! > SUDOKU_GURU_LEVEL_MAX) return null;
  if (!Number.isInteger(record.seconds) || record.seconds! < 0 || !Number.isInteger(record.total)) return null;
  const samples = sanitizePace(record.samples, record.total!, record.seconds!);
  const settings = readSettingsSnapshot(record.settings);
  if (!samples || !settings) return null;
  return {
    id: record.id!,
    name: record.name.slice(0, 32),
    difficulty: record.difficulty,
    level: record.level!,
    seconds: record.seconds!,
    total: record.total!,
    samples,
    settings,
  };
}

export function readSettingsSnapshot(value: unknown): GameSettingsType | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const settings = {} as GameSettingsType;
  for (const key of SETTING_KEYS) {
    if (typeof record[key] === 'boolean') settings[key] = record[key];
    else if (OPTIONAL_OFF.includes(key)) settings[key] = false;
    else return null;
  }
  return settings;
}

function isDifficulty(value: unknown): value is SudokuGuruDifficulty {
  return typeof value === 'string' && (Object.values(SudokuGuruDifficulty) as string[]).includes(value);
}
