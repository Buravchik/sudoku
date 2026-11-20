import { createHash, randomBytes, randomInt } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { Lang } from '@/i18n';
import { readSettingsSnapshot } from '@/sudoku/duel';
import { PaceSample, paceAt, pacePercent, sanitizePace } from '@/sudoku/pace';
import { SUDOKU_GURU_LEVEL_MAX, SUDOKU_GURU_LEVEL_MIN, SudokuGuruDifficulty } from '@/sudoku/types';
import { GameSettingsType } from '@/types';

const MIN_SECONDS = 15;
const MAX_SECONDS = 24 * 60 * 60;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const filePath = path.join(process.cwd(), 'data', 'inline-matches.json');

export interface MatchEntry {
  userId: number;
  name: string;
  seconds: number;
  startedAt?: number;
  settings?: GameSettingsType;
  total?: number;
  samples?: PaceSample[];
}

export interface MatchLeader {
  userId: number;
  name: string;
  seconds: number;
  total: number;
  samples: PaceSample[];
}

export interface MatchPresence {
  userId: number;
  name: string;
  startedAt: number;
  settings?: GameSettingsType;
  forfeited?: boolean;
  left?: number;
  total?: number;
  elapsed?: number;
  samples?: PaceSample[];
}

export interface StoredMatch {
  id: string;
  difficulty: SudokuGuruDifficulty;
  level: number;
  lang: Lang;
  inlineMessageId: string;
  createdAt: number;
  entries: MatchEntry[];
  present?: MatchPresence[];
  leader?: MatchLeader;
  settings?: GameSettingsType;
  notices?: MatchNotice[];
  hostId?: number;
}

export interface MatchNotice {
  chatId: number;
  messageId: number;
}

export interface MatchPlayerView {
  name: string;
  left: number;
  total: number;
  finished: boolean;
}

export interface MatchView {
  difficulty: SudokuGuruDifficulty;
  level: number;
  leader: { name: string; seconds: number; total: number; samples: PaceSample[] } | null;
  settings: GameSettingsType | null;
  players: MatchPlayerView[];
  rival: { name: string; seconds: number; total: number; samples: PaceSample[] } | null;
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
  const you = match.present?.find(player => player.userId === userId);
  return {
    difficulty: match.difficulty,
    level: match.level,
    leader: leader
      ? { name: leader.name, seconds: leader.seconds, total: leader.total, samples: leader.samples }
      : null,
    settings: match.settings ?? null,
    players: matchPlayers(match, userId),
    rival: matchRival(match, userId, you?.elapsed ?? 0) ?? finishedRival(match, userId),
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
    present: [],
  };
}

export async function rememberMatchNotice(id: string, chatId: number, messageId: number): Promise<StoredMatch | null> {
  if (!/^[a-f0-9]{16}$/.test(id) || !Number.isInteger(chatId) || !Number.isInteger(messageId)) return null;
  if (process.env.RECORDS_BACKEND === 'firestore') return noticeFirestore(id, chatId, messageId);
  return withFile(file => {
    const match = file.matches[id];
    if (!match || !fresh(match)) return null;
    appendNotice(match, chatId, messageId);
    return match;
  });
}

function appendNotice(match: StoredMatch, chatId: number, messageId: number): void {
  const notices = match.notices ?? [];
  if (notices.some(item => item.chatId === chatId && item.messageId === messageId)) return;
  match.notices = [...notices, { chatId, messageId }].slice(-20);
}

async function noticeFirestore(id: string, chatId: number, messageId: number): Promise<StoredMatch | null> {
  const { Firestore } = await import('@google-cloud/firestore');
  const ref = new Firestore().doc(`matches/${id}`);
  return ref.firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const match = snapshot.data() as StoredMatch;
    if (!fresh(match)) return null;
    appendNotice(match, chatId, messageId);
    transaction.set(ref, match);
    return match;
  });
}

export async function noteMatchPlayer(
  id: string,
  userId: number,
  name: string,
  extras?: { settings?: unknown; forfeit?: boolean; left?: unknown; total?: unknown; seconds?: unknown; samples?: unknown },
): Promise<{ match: StoredMatch; changed: boolean; refreshCard: boolean; freshStart?: boolean } | null> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 32);
  if (!/^[a-f0-9]{16}$/.test(id) || !clean) return null;
  if (process.env.RECORDS_BACKEND === 'firestore') return noteFirestore(id, userId, clean, extras);
  return withFile(file => addPlayer(file.matches[id], userId, clean, extras));
}

function applyResult(
  match: StoredMatch,
  userId: number,
  name: string,
  seconds: number,
  pace?: { total: number; samples: unknown },
): MatchResult | null {
  if (!fresh(match) || !Number.isInteger(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) return null;
  if (match.present?.some(player => player.userId === userId && player.forfeited)) return null;
  const presence = match.present?.find(player => player.userId === userId);
  const current = match.entries.find(entry => entry.userId === userId);
  const improved = !current || seconds < current.seconds;
  const samples = pace ? sanitizePace(pace.samples, pace.total, seconds) : null;
  const paceFields = samples && pace ? { total: pace.total, samples } : {};
  if (!current) {
    match.entries.push({
      userId,
      name,
      seconds,
      ...(presence?.startedAt ? { startedAt: presence.startedAt } : {}),
      ...(presence?.settings ? { settings: presence.settings } : {}),
      ...paceFields,
    });
  } else if (improved) {
    current.seconds = seconds;
    current.name = name;
    current.startedAt ??= presence?.startedAt;
    if (!current.settings && presence?.settings) current.settings = presence.settings;
    if (paceFields.samples) {
      current.total = paceFields.total;
      current.samples = paceFields.samples;
    }
  }
  match.entries.sort((left, right) => left.seconds - right.seconds || left.userId - right.userId);
  match.present = (match.present ?? []).filter(player => player.userId !== userId);
  if (match.entries[0]?.userId === userId && improved) {
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

function addPlayer(
  match: StoredMatch | undefined,
  userId: number,
  name: string,
  extras?: { settings?: unknown; forfeit?: boolean; left?: unknown; total?: unknown; seconds?: unknown; samples?: unknown },
): { match: StoredMatch; changed: boolean; refreshCard: boolean; freshStart?: boolean } | null {
  if (!match || !fresh(match)) return null;
  const locked = lockChallengeSettings(match, extras?.settings);
  const present = match.present ? [...match.present] : [];
  const existing = present.find(player => player.userId === userId);
  if (existing) {
    existing.name = name;
    const progressChanged = writeProgress(existing, extras);
    let refreshCard = locked;
    if (extras?.forfeit && !existing.forfeited) {
      existing.forfeited = true;
      refreshCard = true;
    }
    match.present = present;
    return { match, changed: refreshCard || progressChanged, refreshCard };
  }
  const player: MatchPresence = {
    userId,
    name,
    startedAt: Date.now(),
    ...(extras?.forfeit ? { forfeited: true } : {}),
  };
  writeProgress(player, extras);
  if (!match.hostId) match.hostId = userId;
  match.present = [...present, player];
  return { match, changed: true, refreshCard: true, freshStart: match.hostId !== userId };
}

function writeProgress(
  player: MatchPresence,
  extras?: { left?: unknown; total?: unknown; seconds?: unknown; samples?: unknown },
): boolean {
  const left = extras?.left;
  const total = extras?.total;
  const seconds = extras?.seconds;
  if (typeof left !== 'number' || typeof total !== 'number' || typeof seconds !== 'number') return false;
  if (!Number.isInteger(left) || !Number.isInteger(total) || !Number.isInteger(seconds)) return false;
  if (total < 1 || total > 81 || left < 0 || left > total || seconds < 0 || seconds > MAX_SECONDS) return false;
  const samples = sanitizePace(extras?.samples, total, seconds);
  const same = player.left === left && player.total === total && player.elapsed === seconds && sameSamples(player.samples, samples);
  player.left = left;
  player.total = total;
  player.elapsed = seconds;
  if (samples) player.samples = samples;
  return !same;
}

function sameSamples(left: PaceSample[] | undefined, right: PaceSample[] | null): boolean {
  if (!left || !right || left.length !== right.length) return left === undefined && right === null;
  return left.every((sample, index) => sample.t === right[index].t && sample.left === right[index].left);
}

function matchPlayers(match: StoredMatch, userId: number): MatchPlayerView[] {
  return (match.present ?? [])
    .filter(player => player.userId !== userId && !player.forfeited && typeof player.left === 'number' && typeof player.total === 'number')
    .map(player => ({ name: player.name, left: player.left ?? 0, total: player.total ?? 0, finished: false }))
    .sort((left, right) => pacePercent(right.total, right.left) - pacePercent(left.total, left.left) || left.name.localeCompare(right.name));
}

function finishedRival(
  match: StoredMatch,
  userId: number,
): { name: string; seconds: number; total: number; samples: PaceSample[] } | null {
  const other = match.entries
    .filter(entry => entry.userId !== userId && entry.samples && entry.samples.length > 0 && typeof entry.total === 'number')
    .sort((left, right) => left.seconds - right.seconds)[0];
  if (!other?.samples || typeof other.total !== 'number') return null;
  return { name: other.name, seconds: other.seconds, total: other.total, samples: other.samples };
}

function matchRival(
  match: StoredMatch,
  userId: number,
  youSeconds: number,
): { name: string; seconds: number; total: number; samples: PaceSample[] } | null {
  let best: MatchPresence | null = null;
  let bestLeft = Number.POSITIVE_INFINITY;
  for (const player of match.present ?? []) {
    if (player.userId === userId || player.forfeited || !player.samples?.length || typeof player.total !== 'number') continue;
    const shared = Math.min(youSeconds, player.elapsed ?? 0);
    const left = paceAt(player.samples, shared, player.total).left;
    if (left < bestLeft || (left === bestLeft && best && player.name.localeCompare(best.name) < 0)) {
      best = player;
      bestLeft = left;
    }
  }
  if (!best?.samples || typeof best.total !== 'number') return null;
  return { name: best.name, seconds: best.elapsed ?? 0, total: best.total, samples: best.samples };
}

function lockChallengeSettings(match: StoredMatch, incoming: unknown): boolean {
  if (match.settings) return false;
  const earliest = [...(match.present ?? []), ...match.entries]
    .filter(player => player.settings)
    .sort((left, right) => (left.startedAt ?? Number.MAX_SAFE_INTEGER) - (right.startedAt ?? Number.MAX_SAFE_INTEGER))[0];
  const settings = earliest?.settings ?? readSettingsSnapshot(incoming) ?? undefined;
  if (!settings) return false;
  match.settings = settings;
  return true;
}

async function noteFirestore(
  id: string,
  userId: number,
  name: string,
  extras?: { settings?: unknown; forfeit?: boolean; left?: unknown; total?: unknown; seconds?: unknown; samples?: unknown },
): Promise<{ match: StoredMatch; changed: boolean; refreshCard: boolean; freshStart?: boolean } | null> {
  const { Firestore } = await import('@google-cloud/firestore');
  const ref = new Firestore().doc(`matches/${id}`);
  return ref.firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const next = addPlayer(snapshot.data() as StoredMatch, userId, name, extras);
    if (!next) return null;
    if (next.changed) transaction.set(ref, next.match);
    return next;
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
