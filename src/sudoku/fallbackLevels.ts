import { emptyDrafts, isDigit } from './cells';
import { hasValidSolution } from './rules';
import { Digit, SudokuCell, SudokuGuruDifficulty } from './types';

const FALLBACKS: Record<SudokuGuruDifficulty, { puzzle: string; solution: string }> = {
  easy: {
    puzzle: '000904600040000831820610000090832107218745000703006000002000400185429060370000020',
    solution: '531984672649257831827613549496832157218745396753196284962378415185429763374561928',
  },
  medium: {
    puzzle: '010000430700000000000254900170040206000090003003006080001470060000508120090060304',
    solution: '519687432724913658386254917178345296652891743943726581231479865467538129895162374',
  },
  hard: {
    puzzle: '004860030001000090800009060500206001027001000000043006050000000009000400000400015',
    solution: '974865132261374598835129764543296871627581349198743256452917683319658427786432915',
  },
  expert: {
    puzzle: '130005000500700002000209000000000000910000087007060010050400000340000000800006305',
    solution: '132685479598734162764219538683197254915342687427568913256473891349851726871926345',
  },
  guru: {
    puzzle: '000000031028000000000000000000208400730000060000500000160070000000400200300000000',
    solution: '476982531528316974913754628691238457735149862284567193162875349857493216349621785',
  },
};

function puzzleFromDigits(puzzle: string, solution: string): SudokuCell[] {
  if (puzzle.length !== 81 || solution.length !== 81) {
    throw new Error('Fallback puzzle must contain 81 digits');
  }

  const cells: SudokuCell[] = [];
  for (let index = 0; index < 81; index++) {
    const initialValue = Number(puzzle[index]);
    const solutionValue = Number(solution[index]);
    if (!isDigit(initialValue) || !isDigit(solutionValue) || solutionValue === 0) {
      throw new Error('Fallback puzzle contains an invalid digit');
    }
    if (initialValue !== 0 && initialValue !== solutionValue) {
      throw new Error('Fallback clue does not match its solution');
    }
    cells.push({
      initialValue,
      userValue: 0,
      solutionValue,
      draftValues: emptyDrafts(),
    });
  }

  if (!hasValidSolution(cells)) {
    throw new Error('Fallback solution is not a completed sudoku');
  }

  return cells;
}

const FALLBACK_CELLS = Object.fromEntries(
  Object.entries(FALLBACKS).map(([difficulty, level]) => [
    difficulty,
    puzzleFromDigits(level.puzzle, level.solution),
  ]),
) as Record<SudokuGuruDifficulty, SudokuCell[]>;

export function fallbackCells(difficulty: SudokuGuruDifficulty): SudokuCell[] {
  return FALLBACK_CELLS[difficulty].map(cell => ({
    ...cell,
    userValue: 0 as Digit,
    draftValues: emptyDrafts(),
  }));
}
