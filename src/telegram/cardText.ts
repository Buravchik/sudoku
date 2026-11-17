import { buildStartParam } from '@/sudoku/daily';
import { ChallengeCard, ChatRecord } from './records';

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export function renderCard(card: ChallengeCard, record: ChatRecord | null): string {
  const lines = [
    `Sudoku · ${card.difficulty} · ${formatDay(card.day)}`,
    '',
  ];
  if (card.entries.length === 0) {
    lines.push('Пока никто не решил.');
  } else {
    card.entries.slice(0, 10).forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.name} — ${formatSeconds(entry.seconds)}`);
    });
    if (card.entries.length > 10) {
      lines.push(`Ещё ${card.entries.length - 10}`);
    }
  }
  if (record) {
    lines.push('', `Рекорд чата: ${formatSeconds(record.seconds)} · ${record.name} · ${formatDay(record.day)}`);
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

function formatDay(day: string): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(4, 6));
  const date = Number(day.slice(6, 8));
  const label = `${date} ${MONTHS[month - 1] ?? ''}`.trim();
  if (year === new Date().getUTCFullYear()) return label;
  return `${label} ${year}`;
}
