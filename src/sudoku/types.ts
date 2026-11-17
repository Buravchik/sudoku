export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface SudokuCell {
  initialValue: Digit;
  userValue: Digit;
  solutionValue: Digit;
  draftValues: boolean[];
}

export type GlobalGameState = 'notStarted' | 'selectDifficulty' | 'playing' | 'won' | 'error';

export enum SudokuGuruDifficulty {
  easy = 'easy',
  medium = 'medium',
  hard = 'hard',
  expert = 'expert',
  guru = 'guru',
}

export type PuzzleSource = 'online' | 'offline';

export interface LoadedPuzzle {
  difficulty: SudokuGuruDifficulty;
  level: number | null;
  cells: SudokuCell[];
  source: PuzzleSource;
}

/** Inclusive range checked against sudoku-guru.com: Level_0 and Level_1099 exist, Level_1100 does not. */
export const SUDOKU_GURU_LEVEL_MIN = 0;
export const SUDOKU_GURU_LEVEL_MAX = 1099;
