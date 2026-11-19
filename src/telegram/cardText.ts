import { cardLang, messages } from '@/i18n';
import { buildStartParam } from '@/sudoku/daily';
import { settingsNickname } from '@/sudoku/nicknames';
import { SudokuGuruDifficulty } from '@/sudoku/types';
import { GameSettingsType } from '@/types';
import { ChallengeCard, ChatRecord } from './records';

export function renderCard(card: ChallengeCard, record: ChatRecord | null, marks: ReadonlyMap<number, string> = new Map()): string {
  const text = messages(cardLang(card.lang));
  const lines = [
    `Sudoku · ${text.difficulties[card.difficulty]} · ${formatDay(card.day, text.months)}`,
    '',
  ];
  const joined = card.joined ?? [];
  if (joined.length > 0) {
    lines.push(text.joined);
    joined.slice(0, 10).forEach(player => {
      lines.push(`• ${tagged(player.name, player.userId, marks)} — ${formatJoined(player.joinedAt)}${settingsLabel(player.settings, card.lang)}`);
    });
    if (joined.length > 10) lines.push(text.more(joined.length - 10));
    lines.push('');
  }
  if (card.entries.length === 0) lines.push(text.nobody);
  else {
    card.entries.slice(0, 10).forEach((entry, index) => {
      lines.push(`✓ ${index + 1}. ${tagged(entry.name, entry.userId, marks)} — ${formatSeconds(entry.seconds)}`);
    });
    if (card.entries.length > 10) lines.push(text.more(card.entries.length - 10));
  }
  if (record) {
    lines.push('', text.chatRecord(formatSeconds(record.seconds), record.name, formatDay(record.day, text.months)));
  }
  return lines.join('\n');
}

export function renderMatch(
  lang: ReturnType<typeof cardLang>,
  difficulty: SudokuGuruDifficulty,
  entries: { userId?: number; name: string; seconds: number; startedAt?: number }[],
  playing: { userId?: number; name: string; startedAt?: number }[] = [],
  settings?: GameSettingsType,
  marks: ReadonlyMap<number, string> = new Map(),
): string {
  const text = messages(lang);
  const lines = [`Sudoku · ${text.difficulties[difficulty]}`];
  if (settings) lines.push(text.settingsNamed(settingsNickname(settings, cardLang(lang))));
  lines.push('');
  if (playing.length > 0) {
    lines.push(text.joined);
    playing.slice(0, 10).forEach(player => {
      const when = player.startedAt ? ` — ${formatJoined(player.startedAt)}` : '';
      lines.push(`• ${tagged(player.name, player.userId, marks)}${when}`);
    });
    lines.push('');
  }
  if (entries.length === 0) lines.push(text.nobody);
  else {
    entries.slice(0, 10).forEach((entry, index) => {
      lines.push(`✓ ${index + 1}. ${tagged(entry.name, entry.userId, marks)} — ${formatSeconds(entry.seconds)}`);
    });
    if (entries.length > 10) lines.push(text.more(entries.length - 10));
  }
  return lines.join('\n');
}

export function playLink(username: string, shortName: string | undefined, card: ChallengeCard): string {
  const startParam = buildStartParam({
    day: card.day,
    difficulty: card.difficulty,
    cardId: card.id,
  });
  const base = shortName
    ? `https://t.me/${username}/${shortName}`
    : `https://t.me/${username}`;
  return `${base}?startapp=${startParam}`;
}

export function formatJoined(epochMs: number): string {
  const date = new Date(epochMs);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}

export function formatSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function tagged(name: string, userId: number | undefined, marks: ReadonlyMap<number, string>): string {
  if (userId === undefined) return name;
  return `${marks.get(userId) ?? ''}${name}`;
}

function settingsLabel(settings: GameSettingsType | undefined, lang: string | undefined): string {
  if (!settings) return '';
  return ` · ${settingsNickname(settings, cardLang(lang))}`;
}

function formatDay(day: string, months: string[]): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(4, 6));
  const date = Number(day.slice(6, 8));
  const label = `${date} ${months[month - 1] ?? ''}`.trim();
  if (year === new Date().getUTCFullYear()) return label;
  return `${label} ${year}`;
}
