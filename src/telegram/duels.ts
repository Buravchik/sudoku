import { mkdir, readFile, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import path from 'path';
import { Lang } from '@/i18n';
import { GhostRace, readSettingsSnapshot } from '@/sudoku/duel';
import { PaceSample, sanitizePace } from '@/sudoku/pace';
import { readSubmittedScore } from '@/sudoku/score';
import { SUDOKU_GURU_LEVEL_MAX, SUDOKU_GURU_LEVEL_MIN, SudokuGuruDifficulty } from '@/sudoku/types';

const MAX_SECONDS = 24 * 60 * 60;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const duelDir = path.join(process.cwd(), 'data', 'duels');

export interface DuelGuest {
  userId: number;
  name: string;
  seconds: number | null;
  joinedAt?: number;
  forfeited?: boolean;
  score?: number;
  total?: number;
  samples?: PaceSample[];
}

export interface StoredDuel extends GhostRace {
  userId: number;
  bestSeconds: number | null;
  createdAt: number;
  lang?: Lang;
  score?: number;
  inlineMessageId?: string;
  guests?: DuelGuest[];
  notices?: DuelNotice[];
}

export interface DuelNotice {
  chatId: number;
  messageId: number;
  widget?: boolean;
}

export interface NewDuel {
  userId: number;
  name: string;
  difficulty: unknown;
  level: number;
  seconds: number;
  total: number;
  samples: unknown;
  settings: unknown;
  score?: unknown;
}

export function acceptDuel(input: NewDuel): Omit<StoredDuel, 'id' | 'createdAt' | 'bestSeconds'> | null {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return null;
  if (!isDifficulty(input.difficulty)) return null;
  if (!Number.isInteger(input.level) || input.level < SUDOKU_GURU_LEVEL_MIN || input.level > SUDOKU_GURU_LEVEL_MAX) return null;
  if (!Number.isInteger(input.seconds) || input.seconds < 1 || input.seconds > MAX_SECONDS) return null;
  if (!Number.isInteger(input.total) || input.total < 1 || input.total > 81) return null;
  const samples = sanitizePace(input.samples, input.total, input.seconds);
  const settings = readSettingsSnapshot(input.settings);
  if (!samples || !settings) return null;
  const score = readScore(input.score);
  return {
    userId: input.userId,
    name: input.name.slice(0, 32) || 'Игрок',
    difficulty: input.difficulty,
    level: input.level,
    seconds: input.seconds,
    total: input.total,
    samples,
    settings,
    ...(score === undefined ? {} : { score }),
  };
}

export async function saveDuel(duel: Omit<StoredDuel, 'id' | 'createdAt' | 'bestSeconds'>): Promise<StoredDuel> {
  const stored: StoredDuel = {
    ...duel,
    id: randomBytes(8).toString('hex'),
    bestSeconds: null,
    createdAt: Date.now(),
  };
  if (process.env.RECORDS_BACKEND === 'firestore') {
    const { Firestore } = await import('@google-cloud/firestore');
    await new Firestore().collection('duels').doc(stored.id).set(stored);
    return stored;
  }
  await mkdir(duelDir, { recursive: true });
  await writeFile(path.join(duelDir, `${stored.id}.json`), JSON.stringify(stored));
  return stored;
}

export async function readDuel(id: string): Promise<StoredDuel | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  const stored = process.env.RECORDS_BACKEND === 'firestore'
    ? await readFirestoreDuel(id)
    : await readFileDuel(id);
  if (!stored || Date.now() - stored.createdAt > MAX_AGE_MS) return null;
  return stored;
}

export async function bindDuelMessage(id: string, inlineMessageId: string): Promise<StoredDuel | null> {
  if (!/^[a-f0-9]{16}$/.test(id) || !inlineMessageId) return null;
  return updateDuel(id, duel => ({ ...duel, inlineMessageId }));
}

export async function noteDuelGuest(id: string, userId: number, name: string): Promise<StoredDuel | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const guestName = name.replace(/\s+/g, ' ').trim().slice(0, 32);
  if (!guestName) return null;
  return updateDuel(id, duel => {
    if (duel.userId === userId) return duel;
    const guests = duel.guests ? [...duel.guests] : [];
    const existing = guests.find(guest => guest.userId === userId);
    if (existing) {
      existing.name = guestName;
      existing.joinedAt ??= Date.now();
      return { ...duel, guests };
    }
    guests.push({ userId, name: guestName, seconds: null, joinedAt: Date.now() });
    return { ...duel, guests };
  });
}

export async function forfeitDuelGuest(id: string, userId: number, name: string): Promise<StoredDuel | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const guestName = name.replace(/\s+/g, ' ').trim().slice(0, 32);
  if (!guestName) return null;
  return updateDuel(id, duel => {
    if (duel.userId === userId) return duel;
    const guests = duel.guests ? [...duel.guests] : [];
    const existing = guests.find(guest => guest.userId === userId);
    if (existing) {
      existing.name = guestName;
      existing.forfeited = true;
      existing.joinedAt ??= Date.now();
      return { ...duel, guests };
    }
    guests.push({ userId, name: guestName, seconds: null, joinedAt: Date.now(), forfeited: true });
    return { ...duel, guests };
  });
}

export async function recordDuelResult(
  id: string,
  userId: number,
  name: string,
  seconds: number,
  pace?: { total: number; samples: unknown; score?: unknown },
): Promise<StoredDuel | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SECONDS) return null;
  const guestName = name.replace(/\s+/g, ' ').trim().slice(0, 32) || 'Player';
  const samples = pace ? sanitizePace(pace.samples, pace.total, seconds) : null;
  const score = readSubmittedScore(pace?.score);
  return updateDuel(id, duel => {
    const bestSeconds = duel.bestSeconds !== null && seconds >= duel.bestSeconds ? duel.bestSeconds : seconds;
    if (duel.userId === userId) return { ...duel, bestSeconds };
    const guests = (duel.guests ?? []).filter(guest => guest.userId !== userId);
    const previousGuest = duel.guests?.find(guest => guest.userId === userId);
    if (previousGuest?.forfeited) return duel;
    const previous = previousGuest?.seconds ?? null;
    const keepPrevious = previous !== null && previous <= seconds;
    guests.push({
      userId,
      name: guestName,
      seconds: keepPrevious ? previous : seconds,
      joinedAt: previousGuest?.joinedAt ?? Date.now(),
      ...(keepPrevious
        ? { score: previousGuest?.score, total: previousGuest?.total, samples: previousGuest?.samples }
        : {
          ...(score === undefined ? {} : { score }),
          ...(samples && pace ? { total: pace.total, samples } : {}),
        }),
    });
    return { ...duel, bestSeconds, guests };
  });
}

async function updateDuel(id: string, change: (duel: StoredDuel) => StoredDuel): Promise<StoredDuel | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  if (process.env.RECORDS_BACKEND === 'firestore') return updateFirestoreDuel(id, change);
  const duel = await readDuel(id);
  if (!duel) return null;
  const next = change(duel);
  await writeFile(path.join(duelDir, `${id}.json`), JSON.stringify(next));
  return next;
}

export async function rememberDuelNotice(
  id: string,
  chatId: number,
  messageId: number,
  widget = false,
): Promise<StoredDuel | null> {
  if (!Number.isInteger(chatId) || !Number.isInteger(messageId)) return null;
  return updateDuel(id, duel => {
    const notices = duel.notices ?? [];
    if (notices.some(item => item.chatId === chatId && item.messageId === messageId)) return duel;
    return {
      ...duel,
      notices: [...notices, { chatId, messageId, ...(widget ? { widget: true } : {}) }].slice(-20),
    };
  });
}

export async function replaceDuelNotice(id: string, from: DuelNotice, to: DuelNotice): Promise<StoredDuel | null> {
  return updateDuel(id, duel => {
    const notices = (duel.notices ?? []).filter(item => item.chatId !== from.chatId || item.messageId !== from.messageId);
    return { ...duel, notices: [...notices, to].slice(-20) };
  });
}

export function toGhost(duel: StoredDuel): GhostRace {
  return {
    id: duel.id,
    name: duel.name,
    difficulty: duel.difficulty,
    level: duel.level,
    seconds: duel.seconds,
    total: duel.total,
    samples: duel.samples,
    settings: duel.settings,
  };
}

async function readFileDuel(id: string): Promise<StoredDuel | null> {
  try {
    const raw = await readFile(path.join(duelDir, `${id}.json`), 'utf8');
    return JSON.parse(raw) as StoredDuel;
  } catch {
    return null;
  }
}

async function readFirestoreDuel(id: string): Promise<StoredDuel | null> {
  const { Firestore } = await import('@google-cloud/firestore');
  const snapshot = await new Firestore().collection('duels').doc(id).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as StoredDuel;
}

async function updateFirestoreDuel(id: string, change: (duel: StoredDuel) => StoredDuel): Promise<StoredDuel | null> {
  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore();
  const ref = db.collection('duels').doc(id);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const duel = snapshot.data() as StoredDuel;
    if (Date.now() - duel.createdAt > MAX_AGE_MS) return null;
    const next = change(duel);
    transaction.set(ref, next);
    return next;
  });
}

function readScore(value: unknown): number | undefined {
  return readSubmittedScore(value);
}

function isDifficulty(value: unknown): value is SudokuGuruDifficulty {
  return typeof value === 'string' && (Object.values(SudokuGuruDifficulty) as string[]).includes(value);
}
