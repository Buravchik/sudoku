import { cellValue, isDigit } from './cells';
import { Digit, SudokuCell } from './types';

export function rowOf(index: number): number {
  return Math.floor(index / 9);
}

export function colOf(index: number): number {
  return index % 9;
}

export function boxStart(index: number): { row: number; col: number } {
  return {
    row: Math.floor(rowOf(index) / 3) * 3,
    col: Math.floor(colOf(index) / 3) * 3,
  };
}

export function peerIndexes(index: number): number[] {
  const row = rowOf(index);
  const col = colOf(index);
  const { row: boxRow, col: boxCol } = boxStart(index);
  const peers = new Set<number>();

  for (let offset = 0; offset < 9; offset++) {
    peers.add(row * 9 + offset);
    peers.add(offset * 9 + col);
  }

  for (let rowOffset = 0; rowOffset < 3; rowOffset++) {
    for (let colOffset = 0; colOffset < 3; colOffset++) {
      peers.add((boxRow + rowOffset) * 9 + boxCol + colOffset);
    }
  }

  peers.delete(index);
  return [...peers];
}

export function candidates(cells: readonly SudokuCell[], index: number): Set<Digit> {
  const possible = new Set<Digit>([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const peer of peerIndexes(index)) {
    const value = cellValue(cells[peer]);
    if (value !== 0) possible.delete(value);
  }
  return possible;
}

export function isValueAllowed(cells: readonly SudokuCell[], index: number, value: number): boolean {
  if (value === 0) return true;
  if (!isDigit(value)) return false;
  return candidates(cells, index).has(value);
}

export function nakedSingleIndexes(cells: readonly SudokuCell[]): Set<number> {
  const obvious = new Set<number>();
  for (let index = 0; index < cells.length; index++) {
    if (cellValue(cells[index]) !== 0) continue;
    if (candidates(cells, index).size === 1) obvious.add(index);
  }
  return obvious;
}

export function nakedSingleIndexesForNumber(cells: readonly SudokuCell[], number: Digit): Set<number> {
  const obvious = new Set<number>();
  if (number === 0) return obvious;
  for (let index = 0; index < cells.length; index++) {
    if (cellValue(cells[index]) !== 0) continue;
    const possible = candidates(cells, index);
    if (possible.size === 1 && possible.has(number)) obvious.add(index);
  }
  return obvious;
}

function indexesAreUnique(cells: readonly SudokuCell[], indexes: number[]): boolean {
  const seen = new Set<number>();
  for (const index of indexes) {
    const value = cellValue(cells[index]);
    if (value === 0 || seen.has(value)) return false;
    seen.add(value);
  }
  return seen.size === 9;
}

export function isSolved(cells: readonly SudokuCell[]): boolean {
  if (cells.length !== 81) return false;
  for (let index = 0; index < 81; index++) {
    if (cellValue(cells[index]) === 0) return false;
  }

  for (let band = 0; band < 9; band++) {
    const row: number[] = [];
    const column: number[] = [];
    for (let offset = 0; offset < 9; offset++) {
      row.push(band * 9 + offset);
      column.push(offset * 9 + band);
    }
    if (!indexesAreUnique(cells, row) || !indexesAreUnique(cells, column)) return false;
  }

  for (let boxRow = 0; boxRow < 3; boxRow++) {
    for (let boxCol = 0; boxCol < 3; boxCol++) {
      const box: number[] = [];
      for (let rowOffset = 0; rowOffset < 3; rowOffset++) {
        for (let colOffset = 0; colOffset < 3; colOffset++) {
          box.push((boxRow * 3 + rowOffset) * 9 + boxCol * 3 + colOffset);
        }
      }
      if (!indexesAreUnique(cells, box)) return false;
    }
  }

  return true;
}

export function hasValidSolution(cells: readonly SudokuCell[]): boolean {
  if (cells.length !== 81) return false;
  const solved = cells.map(cell => ({
    initialValue: cell.solutionValue,
    userValue: 0 as Digit,
    solutionValue: cell.solutionValue,
    draftValues: cell.draftValues,
  }));
  return isSolved(solved);
}
