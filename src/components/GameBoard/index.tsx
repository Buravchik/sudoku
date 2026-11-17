import { cellValue, isChangeable } from '@/sudoku/cells';
import { boxStart, colOf, nakedSingleIndexes, nakedSingleIndexesForNumber, rowOf } from '@/sudoku/rules';
import { Digit, SudokuCell } from '@/sudoku/types';
import { GameSettingsType } from '@/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CellPopup from '../CellPopup';
import styles from './GameBoard.module.css';

interface GameBoardProps {
  cells: SudokuCell[];
  onCellValueChange: (index: number, value: Digit) => void;
  onCellHintToggle: (index: number, hint: number) => void;
  onCellClear: (index: number) => void;
  settings: GameSettingsType;
}

interface CellContentProps {
  cell: SudokuCell;
  highlightedHints: Set<number>;
  settings: GameSettingsType;
}

interface HighlightSets {
  cellHighlights: Set<number>;
  hintHighlights: Set<number>;
}

export default function GameBoard({
  cells,
  onCellValueChange,
  onCellHintToggle,
  onCellClear,
  settings,
}: GameBoardProps) {
  const [selectedForEdit, setSelectedForEdit] = useState<number | null>(null);
  const [clickedCell, setClickedCell] = useState<number | null>(null);
  const [highlightedCells, setHighlightedCells] = useState<Set<number>>(new Set());
  const [highlightedHints, setHighlightedHints] = useState<Set<number>>(new Set());
  const [isPencilMode, setIsPencilMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const calculateHighlights = useCallback((
    board: SudokuCell[],
    index: number,
    value: Digit,
    activeSettings: GameSettingsType,
  ): HighlightSets => {
    const row = rowOf(index);
    const col = colOf(index);
    const { row: boxRow, col: boxCol } = boxStart(index);
    const cellHighlights = new Set<number>();
    const hintHighlights = new Set<number>();

    if (activeSettings.highlightCurrentQuadrant) {
      for (let rowOffset = 0; rowOffset < 3; rowOffset++) {
        for (let colOffset = 0; colOffset < 3; colOffset++) {
          cellHighlights.add((boxRow + rowOffset) * 9 + boxCol + colOffset);
        }
      }
    }

    if (activeSettings.highlightRowAndColumn) {
      for (let offset = 0; offset < 9; offset++) {
        cellHighlights.add(row * 9 + offset);
        cellHighlights.add(offset * 9 + col);
      }
    }

    if (value !== 0) {
      cellHighlights.add(index);

      if (activeSettings.highlightSameNumbers) {
        const matchingCells: number[] = [];
        for (let cellIndex = 0; cellIndex < 81; cellIndex++) {
          if (cellValue(board[cellIndex]) !== value) continue;
          cellHighlights.add(cellIndex);
          matchingCells.push(cellIndex);

          if (activeSettings.highlightQuadrantsWithSameNumber) {
            const { row: matchBoxRow, col: matchBoxCol } = boxStart(cellIndex);
            for (let rowOffset = 0; rowOffset < 3; rowOffset++) {
              for (let colOffset = 0; colOffset < 3; colOffset++) {
                cellHighlights.add((matchBoxRow + rowOffset) * 9 + matchBoxCol + colOffset);
              }
            }
          }
        }

        if (activeSettings.highlightCrossForNumbers) {
          matchingCells.forEach(cellIndex => {
            const matchRow = rowOf(cellIndex);
            const matchCol = colOf(cellIndex);
            for (let offset = 0; offset < 9; offset++) {
              cellHighlights.add(matchRow * 9 + offset);
              cellHighlights.add(offset * 9 + matchCol);
            }
          });
        }
      }

      if (activeSettings.highlightSameHints) {
        hintHighlights.add(value);
        if (activeSettings.highlightCrossForHints) {
          for (let cellIndex = 0; cellIndex < 81; cellIndex++) {
            const cell = board[cellIndex];
            if (cellValue(cell) !== 0 || !cell.draftValues[value - 1]) continue;
            const hintRow = rowOf(cellIndex);
            const hintCol = colOf(cellIndex);
            for (let offset = 0; offset < 9; offset++) {
              cellHighlights.add(hintRow * 9 + offset);
              cellHighlights.add(offset * 9 + hintCol);
            }
          }
        }
      }
    } else if (activeSettings.highlightSameHints) {
      const selectedDrafts = board[index].draftValues;
      const selectedHint = selectedDrafts.findIndex(isSet => isSet);
      const selectedCount = selectedDrafts.filter(isSet => isSet).length;
      if (selectedHint !== -1 && selectedCount === 1) {
        hintHighlights.add(selectedHint + 1);
        cellHighlights.add(index);
        for (let cellIndex = 0; cellIndex < 81; cellIndex++) {
          const cell = board[cellIndex];
          if (cellIndex !== index && cellValue(cell) === 0 && cell.draftValues[selectedHint]) {
            cellHighlights.add(cellIndex);
          }
        }
      }
    }

    return { cellHighlights, hintHighlights };
  }, []);

  useEffect(() => {
    if (clickedCell === null) return;
    const value = cellValue(cells[clickedCell]);
    const next = calculateHighlights(cells, clickedCell, value, settings);
    setHighlightedCells(next.cellHighlights);
    setHighlightedHints(next.hintHighlights);
  }, [cells, clickedCell, settings, calculateHighlights]);

  const obviousCells = useMemo(() => {
    if (settings.highlightAllObviousCells) return nakedSingleIndexes(cells);
    if (
      settings.highlightObviousCellsForCurrentNumber &&
      clickedCell !== null &&
      cellValue(cells[clickedCell]) !== 0
    ) {
      return nakedSingleIndexesForNumber(cells, cellValue(cells[clickedCell]));
    }
    return new Set<number>();
  }, [cells, settings.highlightAllObviousCells, settings.highlightObviousCellsForCurrentNumber, clickedCell]);

  const handleCellClick = (index: number) => {
    if (selectedCell === index && isChangeable(cells[index])) {
      setSelectedForEdit(index);
    }
    setSelectedCell(index);
    setClickedCell(index);
  };

  const handleCellDoubleClick = (index: number) => {
    if (isChangeable(cells[index])) {
      setSelectedCell(index);
      setClickedCell(index);
      setSelectedForEdit(index);
    }
  };

  const cellClassName = (index: number) => {
    const classNames = [styles.cell];
    if (highlightedCells.has(index)) classNames.push(styles.highlighted);
    if (obviousCells.has(index)) classNames.push(styles.obvious);
    if (selectedCell === index) classNames.push(styles.clicked);
    return classNames.join(' ');
  };

  const editingCell = selectedForEdit !== null ? cells[selectedForEdit] : null;

  return (
    <div className={styles.gameBoard}>
      <div className={`${styles.boardGrid} board-grid`}>
        {cells.map((cell, index) => (
          <div
            key={index}
            className={cellClassName(index)}
            onClick={() => handleCellClick(index)}
            onDoubleClick={() => handleCellDoubleClick(index)}
          >
            <CellContent
              cell={cell}
              highlightedHints={highlightedHints}
              settings={settings}
            />
          </div>
        ))}
      </div>
      {editingCell && selectedForEdit !== null && (
        <CellPopup
          open={true}
          onClose={() => setSelectedForEdit(null)}
          selectedValue={cellValue(editingCell)}
          hints={editingCell.draftValues}
          isPencilMode={isPencilMode}
          onPencilModeChange={setIsPencilMode}
          onValueSelect={(value) => onCellValueChange(selectedForEdit, value)}
          onClear={() => onCellClear(selectedForEdit)}
          onHintToggle={(hint) => onCellHintToggle(selectedForEdit, hint)}
          cellIndex={selectedForEdit}
          cells={cells}
          settings={settings}
        />
      )}
    </div>
  );
}

function CellContent({ cell, highlightedHints, settings }: CellContentProps) {
  if (cell.initialValue !== 0) {
    return <span className={styles.initialValue}>{cell.initialValue}</span>;
  }

  if (cell.userValue !== 0) {
    return <span className={styles.userValue}>{cell.userValue}</span>;
  }

  if (cell.draftValues.some(flag => flag)) {
    return (
      <div className={styles.hintsContainer}>
        {cell.draftValues.map((isSet, index) => {
          const shouldHighlight = settings.highlightSameHints && highlightedHints.has(index + 1);
          return (
            <div
              key={index}
              className={`${styles.hint} ${isSet && shouldHighlight ? styles.highlighted : ''}`}
            >
              {isSet ? index + 1 : ''}
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}
