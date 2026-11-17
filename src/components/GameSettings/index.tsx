import { GameSettingsType } from '@/types';
import {
  DialogTitle,
  DialogContent,
  FormGroup,
  FormControlLabel,
  Checkbox,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface GameSettingsProps {
  settings: GameSettingsType;
  onSettingChange: (setting: keyof GameSettingsType) => void;
  onClose: () => void;
}

const SETTING_FIELDS: { key: keyof GameSettingsType; label: string }[] = [
  { key: 'highlightRowAndColumn', label: 'Highlight row and column' },
  { key: 'highlightSameNumbers', label: 'Highlight the same numbers' },
  { key: 'highlightSameHints', label: 'Highlight the same pencil marks' },
  { key: 'highlightCrossForNumbers', label: 'Highlight crosses for the same numbers' },
  { key: 'highlightCrossForHints', label: 'Highlight crosses for the same pencil marks' },
  { key: 'hideImpossibleValuesInSelector', label: 'Hide impossible numbers in the selector' },
  { key: 'hideImpossibleValuesInHints', label: 'Hide impossible pencil marks' },
  { key: 'highlightCurrentQuadrant', label: 'Highlight the current block' },
  { key: 'highlightQuadrantsWithSameNumber', label: 'Highlight blocks that contain the same number' },
  { key: 'highlightAllObviousCells', label: 'Highlight every obvious cell' },
  { key: 'highlightObviousCellsForCurrentNumber', label: 'Highlight obvious cells for the selected number' },
];

export default function GameSettings({ settings, onSettingChange, onClose }: GameSettingsProps) {
  return (
    <>
      <DialogTitle sx={{
        m: 0,
        p: 2,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        Settings
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <FormGroup>
          {SETTING_FIELDS.map(({ key, label }) => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  checked={settings[key]}
                  onChange={() => onSettingChange(key)}
                />
              }
              label={label}
            />
          ))}
        </FormGroup>
      </DialogContent>
    </>
  );
}
