'use client';

import { GameSettingsType } from '@/types';
import { useMessages } from '../Locale';
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

const SETTING_KEYS: (keyof GameSettingsType)[] = [
  'highlightRowAndColumn',
  'highlightSameNumbers',
  'highlightSameHints',
  'highlightCrossForNumbers',
  'highlightCrossForHints',
  'hideImpossibleValuesInSelector',
  'hideImpossibleValuesInHints',
  'highlightCurrentQuadrant',
  'highlightQuadrantsWithSameNumber',
  'highlightAllObviousCells',
  'highlightObviousCellsForCurrentNumber',
];

export default function GameSettings({ settings, onSettingChange, onClose }: GameSettingsProps) {
  const text = useMessages();
  return (
    <>
      <DialogTitle sx={{
        m: 0,
        p: 2,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {text.settings}
        <IconButton
          aria-label={text.close}
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
          {SETTING_KEYS.map(key => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  checked={settings[key]}
                  onChange={() => onSettingChange(key)}
                />
              }
              label={text.settingLabels[key]}
            />
          ))}
        </FormGroup>
      </DialogContent>
    </>
  );
}
