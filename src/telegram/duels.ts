import { mkdir, readFile, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import path from 'path';
import { GhostRace } from '@/sudoku/duel';
import { sanitizePace } from '@/sudoku/pace';
import { SUDOKU_GURU_LEVEL_MAX, SUDOKU_GURU_LEVEL_MIN, SudokuGuruDifficulty } from '@/sudoku/types';

const MAX_SECONDS = 24 * 60 * 60;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const duelDir = path.join(process.cwd(), 'data', 'duels');

export interface StoredDuel extends GhostRace {
  userId: number;
  bestSeconds: number | null;
  createdAt: number;
}

export interface NewDuel {
  userId: number;
  name: string;
  difficulty: unknown;
  level: number;
  seconds: number;
  total: number;
  samples: unknown;
}

export function acceptDuel(input: NewDuel): Omit<StoredDuel, 'id' | 'createdAt' | 'bestSeconds'> | null {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return null;
  if (!isDifficulty(input.difficulty)) return null;
  if (!Number.isInteger(input.level) || input.level < SUDOKU_GURU_LEVEL_MIN || input.level > SUDOKU_GURU_LEVEL_MAX) return null;
  if (!Number.isInteger(input.seconds) || input.seconds < 1 || input.seconds > MAX_SECONDS) return null;
  if (!Number.isInteger(input.total) || input.total < 1 || input.total > 81) return null;
  const samples = sanitizePace(input.samples, input.total, input.seconds);
  if (!samples) return null;
  return {
    userId: input.userId,
    name: input.name.slice(0, 32) || 'Игрок',
    difficulty: input.difficulty,
    level: input.level,
    seconds: input.seconds,
    total: input.total,
    samples,
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

export async function recordDuelResult(id: string, seconds: number): Promise<StoredDuel | null> {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SECONDS) return null;
  if (process.env.RECORDS_BACKEND === 'firestore') return recordFirestoreResult(id, seconds);
  const duel = await readDuel(id);
  if (!duel || (duel.bestSeconds !== null && seconds >= duel.bestSeconds)) return duel;
  const next = { ...duel, bestSeconds: seconds };
  await writeFile(path.join(duelDir, `${id}.json`), JSON.stringify(next));
  return next;
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

async function recordFirestoreResult(id: string, seconds: number): Promise<StoredDuel | null> {
  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore();
  const ref = db.collection('duels').doc(id);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const duel = snapshot.data() as StoredDuel;
    if (Date.now() - duel.createdAt > MAX_AGE_MS) return null;
    if (duel.bestSeconds !== null && seconds >= duel.bestSeconds) return duel;
    const next = { ...duel, bestSeconds: seconds };
    transaction.set(ref, next);
    return next;
  });
}

function isDifficulty(value: unknown): value is SudokuGuruDifficulty {
  return typeof value === 'string' && (Object.values(SudokuGuruDifficulty) as string[]).includes(value);
}
