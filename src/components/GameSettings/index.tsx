'use client';

import { NICKNAME_BITS, nicknameIndexes, nicknameWords, settingsFromIndexes } from '@/sudoku/nicknames';
import { GameSettingsType } from '@/types';
import { useLang, useMessages } from '../Locale';
import SettingDemo from './SettingDemo';
import styles from './GameSettings.module.css';

interface GameSettingsProps {
  settings: GameSettingsType;
  onSettingChange: (setting: keyof GameSettingsType) => void;
  onApply: (settings: GameSettingsType) => void;
  onClose: () => void;
}

export default function GameSettings({ settings, onSettingChange, onApply, onClose }: GameSettingsProps) {
  const text = useMessages();
  const lang = useLang();
  const words = nicknameWords(lang);
  const picked = nicknameIndexes(settings);
  return (
    <>
      <div className={styles.titleRow}>
        <h2 className={styles.title}>{text.settings}</h2>
        <button type="button" className={styles.close} aria-label={text.close} onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className={styles.nickname}>
        <label className={styles.field}>
          <span>{text.adjective}</span>
          <select
            value={picked.adjective}
            onChange={event => onApply(settingsFromIndexes(Number(event.target.value), picked.noun))}
          >
            {words.adjectives.map((word, index) => <option key={word} value={index}>{word}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>{text.noun}</span>
          <select
            value={picked.noun}
            onChange={event => onApply(settingsFromIndexes(picked.adjective, Number(event.target.value)))}
          >
            {words.nouns.map((word, index) => <option key={word} value={index}>{word}</option>)}
          </select>
        </label>
      </div>
      <div className={styles.list}>
        {NICKNAME_BITS.map(key => (
          <label key={key} className={styles.option}>
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={() => onSettingChange(key)}
            />
            <span className={styles.optionText}>{text.settingLabels[key]}</span>
            <SettingDemo setting={key} />
          </label>
        ))}
      </div>
    </>
  );
}
