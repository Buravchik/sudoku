import { emptyDrafts, isDigit } from './cells';
import { dailyLevel } from './daily';
import { fallbackCells } from './fallbackLevels';
import { hasValidSolution } from './rules';
import { Digit, LoadedPuzzle, SUDOKU_GURU_LEVEL_MAX, SUDOKU_GURU_LEVEL_MIN, SudokuCell, SudokuGuruDifficulty } from './types';

const ONLINE_ATTEMPTS = 3;

export class PuzzleTransportError extends Error {
  constructor(cause: unknown) {
    super('Could not reach the puzzle server');
    this.name = 'PuzzleTransportError';
    this.cause = cause;
  }
}

export async function loadPuzzle(difficulty: SudokuGuruDifficulty): Promise<LoadedPuzzle> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ONLINE_ATTEMPTS; attempt++) {
    const levelNumber = randomLevelNumber();
    try {
      const cells = await fetchLevel(difficulty, levelNumber);
      return { difficulty, level: levelNumber, cells, source: 'online' };
    } catch (error) {
      lastError = error;
      if (error instanceof PuzzleTransportError) break;
    }
  }

  console.error('Online puzzle load failed, using an offline puzzle.', lastError);
  return {
    difficulty,
    level: null,
    cells: fallbackCells(difficulty),
    source: 'offline',
  };
}

export async function loadDailyPuzzle(difficulty: SudokuGuruDifficulty, day: string): Promise<LoadedPuzzle> {
  const level = dailyLevel(day, difficulty);
  try {
    const cells = await fetchLevel(difficulty, level);
    return { difficulty, level, cells, source: 'online' };
  } catch (error) {
    console.error('Daily puzzle load failed, using an offline puzzle.', error);
    return {
      difficulty,
      level: null,
      cells: fallbackCells(difficulty),
      source: 'offline',
    };
  }
}

export async function loadLevelPuzzle(difficulty: SudokuGuruDifficulty, level: number): Promise<LoadedPuzzle> {
  if (!Number.isInteger(level) || level < SUDOKU_GURU_LEVEL_MIN || level > SUDOKU_GURU_LEVEL_MAX) {
    throw new Error('Puzzle level is out of range');
  }
  const cells = await fetchLevel(difficulty, level);
  return { difficulty, level, cells, source: 'online' };
}

function randomLevelNumber(): number {
  const span = SUDOKU_GURU_LEVEL_MAX - SUDOKU_GURU_LEVEL_MIN + 1;
  return SUDOKU_GURU_LEVEL_MIN + Math.floor(Math.random() * span);
}

async function fetchLevel(difficulty: SudokuGuruDifficulty, levelNumber: number): Promise<SudokuCell[]> {
  const url = `https://sudoku-guru.com/levels/${difficulty}/Level_${levelNumber}.txt`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new PuzzleTransportError(error);
  }

  if (!response.ok) {
    throw new Error(`Puzzle request failed (${response.status}) for level ${levelNumber}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Puzzle level ${levelNumber} was not valid JSON`);
  }

  const cells = parseBlocks(payload);
  if (!cells || !hasValidSolution(cells)) {
    throw new Error(`Puzzle level ${levelNumber} is invalid`);
  }
  return cells;
}

function parseBlocks(payload: unknown): SudokuCell[] | null {
  if (!payload || typeof payload !== 'object' || !('blocks' in payload)) return null;
  const blocks = (payload as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks) || blocks.length !== 81) return null;

  const cells: SudokuCell[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') return null;
    const record = block as { num?: unknown; andNum?: unknown };
    if (!isDigit(record.num) || !isDigit(record.andNum)) return null;
    if (record.num !== 0 && record.num !== record.andNum) return null;
    cells.push({
      initialValue: record.num,
      userValue: 0,
      solutionValue: record.andNum as Digit,
      draftValues: emptyDrafts(),
    });
  }

  return cells;
}
