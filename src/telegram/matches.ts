import { createHash, randomBytes, randomInt } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { Lang } from '@/i18n';
import { PaceSample, sanitizePace } from '@/sudoku/pace';
import { SUDOKU_GURU_LEVEL_MAX, SUDOKU_GURU_LEVEL_MIN, SudokuGuruDifficulty } from '@/sudoku/types';

const MIN_SECONDS = 15;
const MAX_SECONDS = 24 * 60 * 60;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const filePath = path.join(process.cwd(), 'data', 'inline-matches.json');

export interface MatchEntry {
  userId: number;
  name: string;
  seconds: number;
}

export interface MatchLeader {
  userId: number;
  name: string;
  seconds: number;
  total: number;
  samples: PaceSample[];
}

export interface StoredMatch {
  id: string;
  difficulty: SudokuGuruDifficulty;
  level: number;
  lang: Lang;
  inlineMessageId: string;
  createdAt: number;
  entries: MatchEntry[];
  leader?: MatchLeader;
}

export interface MatchView {
  difficulty: SudokuGuruDifficulty;
  level: number;
  leader: { name: string; seconds: number; total: number; samples: PaceSample[] } | null;
}

interface MatchFile {
  matches: Record<string, StoredMatch>;
}

export interface MatchResult {
  match: StoredMatch;
  improved: boolean;
}

let chain: Promise<unknown> = Promise.resolve();

export function toMatchView(match: StoredMatch, userId: number): MatchView {
  const leader = match.leader && match.leader.userId !== userId ? match.leader : undefined;
  return {
    difficulty: match.difficulty,
    level: match.level,
    leader: leader
      ? { name: leader.name, seconds: leader.seconds, total: leader.total, samples: leader.samples }
      : null,
  };
}

export async function createInlineMatch(difficulty: SudokuGuruDifficulty, lang: Lang): Promise<StoredMatch> {
  const created = newMatch('', difficulty, lang);
  if (process.env.RECORDS_BACKEND === 'firestore') {
    const { Firestore } = await import('@google-cloud/firestore');
    await new Firestore().doc(`matches/${created.id}`).set(created);
    return created;
  }
  return withFile(file => {
    file.matches[created.id] = created;
    return created;
  });
}

export async function attachInlineMessage(id: string, inlineMessageId: string): Promise<void> {
  if (!/^[a-f0-9]{16}$/.test(id) || !inlineMessageId) return;
  if (process.env.RECORDS_BACKEND === 'firestore') {
    const { Firestore } = await import('@google-cloud/firestore');
    await new Firestore().doc(`matches/${id}`).set({ inlineMessageId }, { merge: true });
    return;
  }
  await withFile(file => {
    const match = file.matches[id];
    if (match) match.inlineMessageId = inlineMessageId;
  });
}

export async function openInlineMatch(inlineMessageId: string, difficulty: SudokuGuruDifficulty, lang: Lang): Promise<StoredMatch> {
  if (process.env.RECORDS_BACKEND === 'firestore') return openFirestore(inlineMessageId, difficulty, lang);
  return withFile(file => {
    const current = Object.values(file.matches).find(match => match.inlineMessageId === inlineMessageId && fresh(match));
    if (current) return current;
    const created = newMatch(inlineMessageId, difficulty, lang);
    file.matches[created.id] = created;
    return created;
  });
}

export async function readMatch(id: string): Promise<StoredMatch | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  const match = process.env.RECORDS_BACKEND === 'firestore' ? await readFirestore(id) : await readFileMatch(id);
  if (!match || !fresh(match)) return null;
  return match;
}

export async function recordMatchResult(
  id: string,
  userId: number,
  name: string,
  seconds: number,
  pace?: { total: number; samples: unknown },
): Promise<MatchResult | null> {
  if (process.env.RECORDS_BACKEND === 'firestore') return recordFirestore(id, userId, name, seconds, pace);
  return withFile(file => {
    const match = file.matches[id];
    if (!match || !fresh(match)) return null;
    const next = applyResult(match, userId, name, seconds, pace);
    if (!next) return null;
    file.matches[id] = next.match;
    return next;
  });
}

function newMatch(inlineMessageId: string, difficulty: SudokuGuruDifficulty, lang: Lang): StoredMatch {
  return {
    id: randomBytes(8).toString('hex'),
    difficulty,
    level: randomInt(SUDOKU_GURU_LEVEL_MIN, SUDOKU_GURU_LEVEL_MAX + 1),
    lang,
    inlineMessageId,
    createdAt: Date.now(),
    entries: [],
  };
}

function applyResult(
  match: StoredMatch,
  userId: number,
  name: string,
  seconds: number,
  pace?: { total: number; samples: unknown },
): MatchResult | null {
  if (!fresh(match) || !Number.isInteger(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) return null;
  const current = match.entries.find(entry => entry.userId === userId);
  const improved = !current || seconds < current.seconds;
  if (!current) match.entries.push({ userId, name, seconds });
  else if (improved) {
    current.seconds = seconds;
    current.name = name;
  }
  match.entries.sort((left, right) => left.seconds - right.seconds || left.userId - right.userId);
  if (match.entries[0]?.userId === userId && improved) {
    const samples = pace ? sanitizePace(pace.samples, pace.total, seconds) : null;
    if (samples && pace) match.leader = { userId, name, seconds, total: pace.total, samples };
    else delete match.leader;
  }
  return { match, improved };
}

function fresh(match: StoredMatch): boolean {
  return Date.now() - match.createdAt <= MAX_AGE_MS;
}

function withFile<T>(update: (file: MatchFile) => T): Promise<T> {
  const run = chain.then(async () => {
    const file = await readFileStore();
    const result = update(file);
    prune(file);
    await writeFileStore(file);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

async function readFileStore(): Promise<MatchFile> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<MatchFile>;
    return { matches: parsed.matches ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { matches: {} };
    throw error;
  }
}

async function readFileMatch(id: string): Promise<StoredMatch | null> {
  const file = await readFileStore();
  return file.matches[id] ?? null;
}

async function writeFileStore(file: MatchFile): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(file));
  await rename(temporary, filePath);
}

function prune(file: MatchFile): void {
  for (const [id, match] of Object.entries(file.matches)) {
    if (!fresh(match)) delete file.matches[id];
  }
}

function messageKey(inlineMessageId: string): string {
  return createHash('sha256').update(inlineMessageId).digest('hex');
}

async function openFirestore(inlineMessageId: string, difficulty: SudokuGuruDifficulty, lang: Lang): Promise<StoredMatch> {
  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore();
  const lock = db.doc(`matchMessages/${messageKey(inlineMessageId)}`);
  return db.runTransaction(async transaction => {
    const existing = await transaction.get(lock);
    const matchId = existing.exists ? existing.data()?.matchId : undefined;
    if (typeof matchId === 'string') {
      const snapshot = await transaction.get(db.doc(`matches/${matchId}`));
      if (snapshot.exists) {
        const match = snapshot.data() as StoredMatch;
        if (fresh(match)) return match;
      }
    }
    const created = newMatch(inlineMessageId, difficulty, lang);
    transaction.set(lock, { matchId: created.id });
    transaction.set(db.doc(`matches/${created.id}`), created);
    return created;
  });
}

async function readFirestore(id: string): Promise<StoredMatch | null> {
  const { Firestore } = await import('@google-cloud/firestore');
  const snapshot = await new Firestore().doc(`matches/${id}`).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as StoredMatch;
}

async function recordFirestore(
  id: string,
  userId: number,
  name: string,
  seconds: number,
  pace?: { total: number; samples: unknown },
): Promise<MatchResult | null> {
  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore();
  const ref = db.doc(`matches/${id}`);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const next = applyResult(snapshot.data() as StoredMatch, userId, name, seconds, pace);
    if (!next) return null;
    transaction.set(ref, next.match);
    return next;
  });
}
