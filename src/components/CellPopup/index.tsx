'use client';

import { Digit, SudokuCell } from '@/sudoku/types';
import { useMessages } from '../Locale';
import { isDigit } from '@/sudoku/cells';
import { isValueAllowed } from '@/sudoku/rules';
import { GameSettingsType } from '@/types';
import { useEffect } from 'react';
import styles from './CellPopup.module.css';

interface CellPopupProps {
  open: boolean;
  onClose: () => void;
  selectedValue: Digit;
  hints: boolean[];
  isPencilMode: boolean;
  onPencilModeChange: (isOn: boolean) => void;
  onValueSelect: (value: Digit) => void;
  onClear: () => void;
  onHintToggle: (hint: number) => void;
  cellIndex: number;
  cells: SudokuCell[];
  settings: GameSettingsType;
}

export default function CellPopup({
  open,
  onClose,
  selectedValue,
  hints,
  isPencilMode,
  onPencilModeChange,
  onValueSelect,
  onClear,
  onHintToggle,
  cellIndex,
  cells,
  settings,
}: CellPopupProps) {
  const text = useMessages();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handlePencilModeChange = (checked: boolean) => {
    if (checked && selectedValue !== 0) {
      onClear();
    }
    onPencilModeChange(checked);
  };

  const handleNumberClick = (value: number) => {
    if (!isDigit(value) || value === 0) return;

    if (isPencilMode) {
      onHintToggle(value);
      return;
    }

    onValueSelect(selectedValue === value ? 0 : value);
    onClose();
  };

  const handleClear = () => {
    onClear();
    if (!isPencilMode) onClose();
  };

  const shouldCheckValidity = isPencilMode
    ? settings.hideImpossibleValuesInHints
    : settings.hideImpossibleValuesInSelector;

  return (
    <div className={styles.scrim} onMouseDown={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={text.pencil}
        onMouseDown={event => event.stopPropagation()}
      >
        <label className={styles.switch}>
          <input
            type="checkbox"
            checked={isPencilMode}
            onChange={event => handlePencilModeChange(event.target.checked)}
          />
          <span className={styles.track} aria-hidden="true" />
          <span>{text.pencil}</span>
        </label>
        <div className={styles.grid}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(number => {
            const isValid = shouldCheckValidity ? isValueAllowed(cells, cellIndex, number) : true;
            const pressed = isPencilMode ? hints[number - 1] : selectedValue === number;
            return (
              <button
                key={number}
                type="button"
                className={styles.digit}
                aria-pressed={pressed}
                disabled={!isValid}
                onClick={() => handleNumberClick(number)}
              >
                {number}
              </button>
            );
          })}
        </div>
        <button type="button" className={styles.clear} onClick={handleClear}>
          {text.clear}
        </button>
      </div>
    </div>
  );
}
