import { cardLang, messages } from '@/i18n';
import { buildStartParam } from '@/sudoku/daily';
import { SudokuGuruDifficulty } from '@/sudoku/types';
import { ChallengeCard, ChatRecord } from './records';

export function renderCard(card: ChallengeCard, record: ChatRecord | null): string {
  const text = messages(cardLang(card.lang));
  const lines = [
    `Sudoku · ${text.difficulties[card.difficulty]} · ${formatDay(card.day, text.months)}`,
    '',
  ];
  if (card.entries.length === 0) lines.push(text.nobody);
  else {
    card.entries.slice(0, 10).forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.name} — ${formatSeconds(entry.seconds)}`);
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
  entries: { name: string; seconds: number }[],
  playing: { name: string }[] = [],
): string {
  const text = messages(lang);
  const lines = [`Sudoku · ${text.difficulties[difficulty]}`, ''];
  if (playing.length > 0) {
    lines.push(text.playing);
    playing.slice(0, 10).forEach(player => lines.push(`• ${player.name}`));
    lines.push('');
  }
  if (entries.length === 0) lines.push(text.nobody);
  else {
    entries.slice(0, 10).forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.name} — ${formatSeconds(entry.seconds)}`);
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

export function formatSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDay(day: string, months: string[]): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(4, 6));
  const date = Number(day.slice(6, 8));
  const label = `${date} ${months[month - 1] ?? ''}`.trim();
  if (year === new Date().getUTCFullYear()) return label;
  return `${label} ${year}`;
}
