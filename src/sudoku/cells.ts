import { Digit, SudokuCell } from './types';

export function isDigit(value: unknown): value is Digit {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9;
}

export function emptyDrafts(): boolean[] {
  return [false, false, false, false, false, false, false, false, false];
}

export function cellValue(cell: SudokuCell): Digit {
  return cell.initialValue || cell.userValue;
}

export function isChangeable(cell: SudokuCell): boolean {
  return cell.initialValue === 0;
}

export function setUserValue(cell: SudokuCell, value: Digit): SudokuCell {
  if (!isChangeable(cell)) return cell;
  const draftsEmpty = cell.draftValues.every(flag => !flag);
  if (cell.userValue === value && draftsEmpty) return cell;
  return {
    ...cell,
    userValue: value,
    draftValues: emptyDrafts(),
  };
}

export function toggleHint(cell: SudokuCell, hint: number): SudokuCell {
  if (!isChangeable(cell) || cell.userValue !== 0 || hint < 1 || hint > 9) return cell;
  const draftValues = cell.draftValues.slice();
  draftValues[hint - 1] = !draftValues[hint - 1];
  return { ...cell, draftValues };
}

export function clearCell(cell: SudokuCell): SudokuCell {
  if (!isChangeable(cell)) return cell;
  if (cell.userValue === 0 && cell.draftValues.every(flag => !flag)) return cell;
  return {
    ...cell,
    userValue: 0,
    draftValues: emptyDrafts(),
  };
}

export function resetProgress(cell: SudokuCell): SudokuCell {
  return {
    initialValue: cell.initialValue,
    solutionValue: cell.solutionValue,
    userValue: 0,
    draftValues: emptyDrafts(),
  };
}
