import { AchievementId } from '@/sudoku/achievements';
import { SudokuGuruDifficulty } from '@/sudoku/types';
import { GameSettingsType } from '@/types';

export interface PublicAchievements {
  tomorrow: boolean;
  table: boolean;
  first: boolean;
  streak: boolean;
  reply: boolean;
  blind: SudokuGuruDifficulty | null;
  pencil: SudokuGuruDifficulty | null;
  pins: AchievementId[];
}

function endpoint(): string | null {
  const score = process.env.NEXT_PUBLIC_SCORE_URL;
  if (!score) return null;
  return score.replace(/\/score\/?$/, '/achievement');
}

export async function readAchievements(): Promise<PublicAchievements | null> {
  return postAchievement({});
}

export async function reportAchievement(win: {
  difficulty: SudokuGuruDifficulty;
  settings: GameSettingsType;
  pencilUsed: boolean;
  seconds: number;
}): Promise<PublicAchievements | null> {
  return postAchievement({ win });
}

export async function pinAchievement(pin: AchievementId): Promise<PublicAchievements | null> {
  return postAchievement({ pin });
}

async function postAchievement(body: { win?: unknown; pin?: AchievementId }): Promise<PublicAchievements | null> {
  const url = endpoint();
  const initData = window.Telegram?.WebApp?.initData;
  if (!url || !initData) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, ...body }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; achievements?: PublicAchievements };
    if (!payload.ok || !payload.achievements) return null;
    return payload.achievements;
  } catch (error) {
    console.error('Failed to update achievements.', error);
    return null;
  }
}
