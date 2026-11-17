import { Digit, SudokuCell } from '@/sudoku/types';
import { isDigit } from '@/sudoku/cells';
import { isValueAllowed } from '@/sudoku/rules';
import { GameSettingsType } from '@/types';
import {
  Box,
  Button,
  Dialog,
  ToggleButton,
  Switch,
  FormControlLabel,
  styled,
} from '@mui/material';

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

const NumberGrid = styled(Box)({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
  padding: 16,
});

const NumberButton = styled(ToggleButton)({
  width: 48,
  height: 48,
  fontSize: '1.2rem',
  '&.invalid': {
    opacity: 0.3,
    cursor: 'not-allowed',
    '&:hover': {
      backgroundColor: 'inherit',
    },
  },
});

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
    <Dialog open={open} onClose={onClose}>
      <Box sx={{ p: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={isPencilMode}
              onChange={(event) => handlePencilModeChange(event.target.checked)}
            />
          }
          label="Pencil mode"
        />
        <NumberGrid>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => {
            const isValid = shouldCheckValidity ? isValueAllowed(cells, cellIndex, number) : true;

            return (
              <NumberButton
                key={number}
                value={number}
                selected={isPencilMode ? hints[number - 1] : selectedValue === number}
                onClick={() => handleNumberClick(number)}
                disabled={!isValid}
                className={shouldCheckValidity && !isValid ? 'invalid' : ''}
              >
                {number}
              </NumberButton>
            );
          })}
        </NumberGrid>
        <Button fullWidth onClick={handleClear}>
          Clear
        </Button>
      </Box>
    </Dialog>
  );
}
