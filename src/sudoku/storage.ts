import { allowDeviceWrites, readDeviceItem, removeDeviceItem, writeDeviceItem } from '@/telegram/webApp';
import { emptyDrafts, isDigit } from './cells';
import { GameSettingsType } from '@/types';
import { DailyChallenge, buildStartParam, parseStartParam } from './daily';
import { parseMatchId } from './match';
import { GhostRace, restoreGhost } from './duel';
import { PaceSample, restorePace } from './pace';
import { ScoreMark, restoreMarks } from './score';
import { Digit, GlobalGameState, LoadedPuzzle, SudokuCell, SudokuGuruDifficulty } from './types';

const SETTINGS_KEY = 'sudokuGameSettings';
const GAME_KEY = 'sudokuGameState';

export const DEFAULT_SETTINGS: GameSettingsType = {
  highlightRowAndColumn: true,
  highlightSameNumbers: true,
  highlightSameHints: true,
  highlightCrossForNumbers: true,
  highlightCrossForHints: false,
  hideImpossibleValuesInSelector: true,
  hideImpossibleValuesInHints: true,
  highlightCurrentQuadrant: true,
  highlightQuadrantsWithSameNumber: true,
  highlightAllObviousCells: true,
  highlightObviousCellsForCurrentNumber: true,
  undoMoves: false,
  highlightConflicts: false,
  countMistakes: false,
};

export function usualSettings(settings: Partial<GameSettingsType>): boolean {
  return (Object.keys(DEFAULT_SETTINGS) as (keyof GameSettingsType)[]).every(
    key => (settings[key] ?? DEFAULT_SETTINGS[key]) === DEFAULT_SETTINGS[key],
  );
}

export interface StoredSession {
  gameState: GlobalGameState;
  difficultyState: SudokuGuruDifficulty | '';
  board: LoadedPuzzle | null;
  elapsedSeconds: number;
  challenge: DailyChallenge | null;
  pace: PaceSample[];
  ghost: GhostRace | null;
  matchId: string | null;
  mistakes: number;
  marks: ScoreMark[];
}

const EMPTY_SESSION: StoredSession = {
  gameState: 'notStarted',
  difficultyState: '',
  board: null,
  elapsedSeconds: 0,
  challenge: null,
  pace: [],
  ghost: null,
  matchId: null,
  mistakes: 0,
  marks: [],
};

export function loadSettings(): GameSettingsType {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if ('highlightObviousCell' in parsed && typeof parsed.highlightAllObviousCells !== 'boolean') {
      parsed.highlightAllObviousCells = parsed.highlightObviousCell;
      delete parsed.highlightObviousCell;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
    }
    return settingsFromJson(JSON.stringify(parsed));
  } catch (error) {
    console.error('Failed to restore settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function settingsFromJson(raw: string | null): GameSettingsType {
  if (!raw) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if ('highlightObviousCell' in parsed && typeof parsed.highlightAllObviousCells !== 'boolean') {
      parsed.highlightAllObviousCells = parsed.highlightObviousCell;
    }

    const settings = { ...DEFAULT_SETTINGS };
    (Object.keys(DEFAULT_SETTINGS) as (keyof GameSettingsType)[]).forEach(key => {
      if (typeof parsed[key] === 'boolean') settings[key] = parsed[key];
    });
    return settings;
  } catch (error) {
    console.error('Failed to restore settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettingsType): void {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(settings);
  localStorage.setItem(SETTINGS_KEY, json);
  writeDeviceItem(SETTINGS_KEY, json);
}

export function loadStoredSession(): StoredSession {
  if (typeof window === 'undefined') return EMPTY_SESSION;
  return sessionFromJson(localStorage.getItem(GAME_KEY)) ?? EMPTY_SESSION;
}

export function sessionFromJson(raw: string | null): StoredSession | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredGameState> & {
      boardState?: unknown;
      timestamp?: unknown;
    };

    if (parsed.gameState !== 'playing' && parsed.gameState !== 'won') return null;
    const board = restoreBoard(parsed.boardState);
    if (!board) return null;

    return {
      gameState: parsed.gameState,
      difficultyState: isDifficulty(parsed.difficultyState) ? parsed.difficultyState : board.difficulty,
      board,
      elapsedSeconds: elapsedSecondsFrom(parsed.elapsedSeconds),
      challenge: restoreChallenge(parsed.challenge),
      pace: restorePace(parsed.pace),
      ghost: restoreGhost(parsed.ghost),
      matchId: parseMatchId(typeof parsed.matchId === 'string' ? `i${parsed.matchId}` : null),
      mistakes: restoredMistakes(parsed.mistakes),
      marks: restoreMarks(parsed.marks),
    };
  } catch (error) {
    console.error('Failed to restore game state:', error);
    return null;
  }
}

export async function loadDeviceSnapshot(): Promise<{
  session: StoredSession | null;
  settings: GameSettingsType | null;
  available: boolean;
  settingsMissing: boolean;
}> {
  const [game, settings] = await Promise.all([
    readDeviceItem(GAME_KEY),
    readDeviceItem(SETTINGS_KEY),
  ]);
  const available = game.status !== 'unavailable' && settings.status !== 'unavailable';
  allowDeviceWrites(available);
  return {
    available,
    settingsMissing: settings.status === 'missing',
    session: game.status === 'value' ? sessionFromJson(game.value) : null,
    settings: settings.status === 'value' ? settingsFromJson(settings.value) : null,
  };
}

export function saveStoredSession(session: StoredSession): void {
  if (typeof window === 'undefined') return;
  if ((session.gameState !== 'playing' && session.gameState !== 'won') || !session.board) return;

  const snapshot: StoredGameState = {
    gameState: session.gameState,
    difficultyState: session.difficultyState,
    elapsedSeconds: session.elapsedSeconds,
    challenge: session.challenge,
    pace: session.pace,
    ghost: session.ghost,
    matchId: session.matchId,
    mistakes: session.mistakes,
    marks: session.marks,
    boardState: {
      difficulty: session.board.difficulty,
      level: session.board.level,
      source: session.board.source,
      cells: session.board.cells.map(cell => ({
        initialValue: cell.initialValue,
        userValue: cell.userValue,
        solutionValue: cell.solutionValue,
        draftValues: [...cell.draftValues],
      })),
    },
  };
  const json = JSON.stringify(snapshot);
  localStorage.setItem(GAME_KEY, json);
  writeDeviceItem(GAME_KEY, json);
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GAME_KEY);
  removeDeviceItem(GAME_KEY);
}

interface StoredGameState {
  gameState: 'playing' | 'won';
  difficultyState: SudokuGuruDifficulty | '';
  elapsedSeconds: number;
  challenge?: DailyChallenge | null;
  pace?: unknown;
  ghost?: unknown;
  matchId?: unknown;
  mistakes?: unknown;
  marks?: unknown;
  boardState: {
    difficulty: SudokuGuruDifficulty;
    level?: number | null;
    source?: 'online' | 'offline';
    cells: StoredCell[];
  };
}

interface StoredCell {
  initialValue: Digit;
  userValue: Digit;
  solutionValue: Digit;
  draftValues: boolean[];
}

function restoreBoard(value: unknown): LoadedPuzzle | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    difficulty?: unknown;
    level?: unknown;
    source?: unknown;
    cells?: unknown;
  };
  if (!isDifficulty(record.difficulty) || !Array.isArray(record.cells)) return null;
  const cells = restoreCells(record.cells);
  if (!cells) return null;
  return {
    difficulty: record.difficulty,
    level: Number.isInteger(record.level) ? record.level as number : null,
    source: record.source === 'offline' ? 'offline' : 'online',
    cells,
  };
}

function restoreCells(value: unknown[]): SudokuCell[] | null {
  if (value.length !== 81) return null;
  const cells: SudokuCell[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;

    if ('initialValue' in record) {
      if (!isDigit(record.initialValue) || !isDigit(record.userValue)) return null;
      const solutionValue = isDigit(record.solutionValue) ? record.solutionValue : 0;
      cells.push({
        initialValue: record.initialValue,
        userValue: record.initialValue === 0 ? record.userValue : 0,
        solutionValue,
        draftValues: normalizeDrafts(record.draftValues),
      });
      continue;
    }

    if (!isDigit(record.value)) return null;
    const isInitial = record.isInitial === true;
    const userValue = isDigit(record.userValue) ? record.userValue : 0;
    cells.push({
      initialValue: isInitial ? record.value : 0,
      userValue: isInitial ? 0 : userValue || (record.value === 0 ? 0 : record.value),
      solutionValue: 0,
      draftValues: normalizeDrafts(record.hints),
    });
  }

  return cells;
}

function normalizeDrafts(value: unknown): boolean[] {
  const drafts = emptyDrafts();
  if (!Array.isArray(value)) return drafts;
  for (let index = 0; index < drafts.length; index++) {
    drafts[index] = value[index] === true;
  }
  return drafts;
}

function restoreChallenge(value: unknown): DailyChallenge | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<DailyChallenge>;
  if (!record.day || !record.cardId || !isDifficulty(record.difficulty)) return null;
  return parseStartParam(buildStartParam({
    day: record.day,
    difficulty: record.difficulty,
    cardId: record.cardId,
  }));
}

function elapsedSecondsFrom(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function restoredMistakes(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function isDifficulty(value: unknown): value is SudokuGuruDifficulty {
  return typeof value === 'string' && (Object.values(SudokuGuruDifficulty) as string[]).includes(value);
}
