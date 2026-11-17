import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import path from 'path';
import { DailyChallenge, todayKey } from '@/sudoku/daily';
import { PaceSample, pacePercent, sanitizePace } from '@/sudoku/pace';
import { SudokuGuruDifficulty } from '@/sudoku/types';

const LIVE_STALE_MS = 90_000;

const MIN_SECONDS = 15;
const MAX_SECONDS = 24 * 60 * 60;
const CARD_HISTORY_DAYS = 14;

export interface ScoreEntry {
  userId: number;
  name: string;
  seconds: number;
}

export interface ChatRecord {
  name: string;
  seconds: number;
  day: string;
}

export interface LeaderPace {
  userId: number;
  name: string;
  seconds: number;
  total: number;
  samples: PaceSample[];
}

export interface LivePlayer {
  userId: number;
  name: string;
  left: number;
  total: number;
  updatedAt: number;
  finished: boolean;
}

export interface RacePlayer {
  name: string;
  left: number;
  total: number;
  finished: boolean;
}

export interface RaceView {
  leader: { name: string; seconds: number; total: number; samples: PaceSample[] } | null;
  players: RacePlayer[];
}

export interface ChallengeCard {
  id: string;
  day: string;
  difficulty: SudokuGuruDifficulty;
  messageId: number;
  entries: ScoreEntry[];
  leader?: LeaderPace;
  live?: LivePlayer[];
}

interface ChatState {
  cards: ChallengeCard[];
  records: Partial<Record<SudokuGuruDifficulty, ChatRecord>>;
}

interface RecordFile {
  chats: Record<string, ChatState>;
}

export type ScoreUpdate =
  | { ok: true; place: number; improved: boolean; chatId: number; card: ChallengeCard; record: ChatRecord | null }
  | { ok: false; reason: 'unknown' | 'mismatch' | 'time' };

const filePath = process.env.RECORDS_PATH || path.join(process.cwd(), 'data', 'group-records.json');

let chain: Promise<unknown> = Promise.resolve();

export function withRecords<T>(update: (file: RecordFile) => T | Promise<T>): Promise<T> {
  const run = process.env.RECORDS_BACKEND === 'firestore'
    ? chain.then(() => updateFirestore(update))
    : chain.then(() => updateFile(update));
  chain = run.then(() => undefined, () => undefined);
  return run;
}

export function findTodayCard(file: RecordFile, chatId: number, difficulty: SudokuGuruDifficulty, day = todayKey()): ChallengeCard {
  const chat = chatState(file, chatId);
  const existing = chat.cards.find(card => card.day === day && card.difficulty === difficulty);
  if (existing) return existing;
  const card: ChallengeCard = {
    id: randomBytes(4).toString('hex'),
    day,
    difficulty,
    messageId: 0,
    entries: [],
  };
  chat.cards.push(card);
  pruneCards(chat, day);
  return card;
}

export function recordScore(
  file: RecordFile,
  challenge: DailyChallenge,
  userId: number,
  name: string,
  seconds: number,
  pace?: { total: number; samples: unknown },
): ScoreUpdate {
  if (!Number.isInteger(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
    return { ok: false, reason: 'time' };
  }
  const located = locateCard(file, challenge.cardId);
  if (!located) return { ok: false, reason: 'unknown' };
  const { chat, card } = located;
  if (card.day !== challenge.day || card.difficulty !== challenge.difficulty) {
    return { ok: false, reason: 'mismatch' };
  }

  const current = card.entries.find(entry => entry.userId === userId);
  const improved = !current || seconds < current.seconds;
  if (!current) card.entries.push({ userId, name, seconds });
  else if (improved) {
    current.seconds = seconds;
    current.name = name;
  }
  card.entries.sort((left, right) => left.seconds - right.seconds || left.userId - right.userId);
  const place = card.entries.findIndex(entry => entry.userId === userId) + 1;
  if (place === 1 && improved) {
    const samples = pace ? sanitizePace(pace.samples, pace.total, seconds) : null;
    card.leader = samples && pace
      ? { userId, name, seconds, total: pace.total, samples }
      : undefined;
  }
  const playing = card.live?.find(player => player.userId === userId);
  if (playing) {
    playing.finished = true;
    playing.left = 0;
    playing.name = name;
    playing.updatedAt = Date.now();
  }

  const record = chat.records[card.difficulty] ?? null;
  if (improved && (!record || seconds < record.seconds)) {
    chat.records[card.difficulty] = { name, seconds, day: card.day };
  }

  return {
    ok: true,
    place,
    improved,
    chatId: located.chatId,
    card,
    record: chat.records[card.difficulty] ?? null,
  };
}

export function touchProgress(
  file: RecordFile,
  challenge: DailyChallenge,
  userId: number,
  name: string,
  left: number,
  total: number,
): RaceView | null {
  if (!Number.isInteger(left) || !Number.isInteger(total) || total < 1 || total > 81 || left < 0 || left > total) {
    return null;
  }
  const located = locateCard(file, challenge.cardId);
  if (!located) return null;
  const { card } = located;
  if (card.day !== challenge.day || card.difficulty !== challenge.difficulty) return null;

  const now = Date.now();
  card.live ??= [];
  const existing = card.live.find(item => item.userId === userId);
  if (existing?.finished) {
    existing.name = name;
    existing.updatedAt = now;
  } else {
    const player: LivePlayer = { userId, name, left, total, updatedAt: now, finished: false };
    if (existing) Object.assign(existing, player);
    else card.live.push(player);
  }
  card.live = card.live
    .filter(item => item.finished || now - item.updatedAt <= LIVE_STALE_MS)
    .slice(-40);

  const leader = card.leader && card.leader.userId !== userId ? card.leader : undefined;
  const players = card.live
    .filter(item => item.userId !== userId)
    .map(item => ({ name: item.name, left: item.left, total: item.total, finished: item.finished }))
    .sort((leftPlayer, rightPlayer) => (
      pacePercent(rightPlayer.total, rightPlayer.left) - pacePercent(leftPlayer.total, leftPlayer.left)
      || leftPlayer.name.localeCompare(rightPlayer.name)
    ));
  return {
    leader: leader
      ? { name: leader.name, seconds: leader.seconds, total: leader.total, samples: leader.samples }
      : null,
    players,
  };
}

async function updateFirestore<T>(update: (file: RecordFile) => T | Promise<T>): Promise<T> {
  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore();
  const ref = db.doc('sudoku/records');
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const stored = snapshot.exists ? snapshot.data() as { json?: string } : undefined;
    const file: RecordFile = stored?.json ? JSON.parse(stored.json) as RecordFile : { chats: {} };
    if (!file.chats) file.chats = {};
    const result = await update(file);
    transaction.set(ref, { json: JSON.stringify(file) });
    return result;
  });
}

async function updateFile<T>(update: (file: RecordFile) => T | Promise<T>): Promise<T> {
  const file = await readRecords();
  const result = await update(file);
  await writeRecords(file);
  return result;
}

async function readRecords(): Promise<RecordFile> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RecordFile>;
    if (!parsed.chats || typeof parsed.chats !== 'object') return { chats: {} };
    return { chats: parsed.chats };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { chats: {} };
    throw error;
  }
}

async function writeRecords(file: RecordFile): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(file));
  await rename(temporary, filePath);
}

function chatState(file: RecordFile, chatId: number): ChatState {
  const key = String(chatId);
  const existing = file.chats[key];
  if (existing) return normalizeChat(existing);
  const created: ChatState = { cards: [], records: {} };
  file.chats[key] = created;
  return created;
}

function normalizeChat(chat: ChatState): ChatState {
  chat.cards ??= [];
  chat.records ??= {};
  return chat;
}

function locateCard(file: RecordFile, cardId: string): { chatId: number; chat: ChatState; card: ChallengeCard } | null {
  for (const [chatKey, chat] of Object.entries(file.chats)) {
    const card = chat.cards?.find(item => item.id === cardId);
    if (card) return { chatId: Number(chatKey), chat: normalizeChat(chat), card };
  }
  return null;
}

function pruneCards(chat: ChatState, today: string): void {
  chat.cards = chat.cards.filter(card => dayDistance(card.day, today) <= CARD_HISTORY_DAYS);
}

function dayDistance(earlier: string, later: string): number {
  const from = Date.parse(`${earlier.slice(0, 4)}-${earlier.slice(4, 6)}-${earlier.slice(6, 8)}T00:00:00Z`);
  const to = Date.parse(`${later.slice(0, 4)}-${later.slice(4, 6)}-${later.slice(6, 8)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return CARD_HISTORY_DAYS + 1;
  return Math.abs(to - from) / 86_400_000;
}
