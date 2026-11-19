'use client';

import { ACHIEVEMENT_IDS, AchievementId } from '@/sudoku/achievements';
import { pinAchievement, PublicAchievements, readAchievements } from '@/telegram/achievementClient';
import { NICKNAME_BITS, nicknameIndexes, nicknameWords, settingsFromIndexes } from '@/sudoku/nicknames';
import { GameSettingsType } from '@/types';
import { useEffect, useState } from 'react';
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
  const [achievements, setAchievements] = useState<PublicAchievements | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readAchievements().then(profile => {
      if (!cancelled && profile) setAchievements(profile);
    });
    return () => { cancelled = true; };
  }, []);
  const togglePin = (id: AchievementId) => {
    void pinAchievement(id).then(profile => {
      if (profile) setAchievements(profile);
    });
  };
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
      <details className={styles.advanced}>
        <summary className={styles.advancedSummary}>{text.namedSettings}</summary>
        <p className={styles.note}>{text.namedSettingsHint}</p>
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
      </details>
      <details className={styles.advanced}>
        <summary className={styles.advancedSummary}>{text.achievements}</summary>
        <p className={styles.note}>{text.achievementsHint}</p>
        <div className={styles.list}>
          {ACHIEVEMENT_IDS.map(id => {
            const earned = achievementEarned(achievements, id);
            const pinned = achievements?.pins.includes(id) ?? false;
            const grade = id === 'blind' ? achievements?.blind : id === 'pencil' ? achievements?.pencil : null;
            return (
              <div key={id} className={styles.option}>
                <span className={styles.optionText}>
                  <strong>{text.achievementNames[id]}{grade ? ` · ${text.difficulties[grade]}` : ''}</strong>
                  <span className={styles.rule}>{text.achievementRules[id]}</span>
                </span>
                <button
                  type="button"
                  className={styles.pin}
                  disabled={!earned || (!pinned && (achievements?.pins.length ?? 0) >= 2)}
                  aria-pressed={pinned}
                  onClick={() => togglePin(id)}
                >
                  {pinned ? text.onCard : text.showOnCard}
                </button>
              </div>
            );
          })}
        </div>
      </details>
    </>
  );
}

function achievementEarned(profile: PublicAchievements | null, id: AchievementId): boolean {
  if (!profile) return false;
  if (id === 'blind') return profile.blind !== null;
  if (id === 'pencil') return profile.pencil !== null;
  if (id === 'tomorrow') return profile.tomorrow;
  if (id === 'table') return profile.table;
  if (id === 'first') return profile.first;
  if (id === 'streak') return profile.streak;
  return profile.reply;
}
