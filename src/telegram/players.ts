import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { Lang, messages } from '@/i18n';
import {
  AchievementId,
  AchievementState,
  WinFacts,
  applyPin,
  applyStart,
  applyWin,
  bareSettings,
  cardPrefix,
  emptyAchievements,
  isAchievementId,
} from '@/sudoku/achievements';
import { readSettingsSnapshot } from '@/sudoku/duel';
import { todayKey } from '@/sudoku/daily';
import { SudokuGuruDifficulty } from '@/sudoku/types';

const MIN_SECONDS = 15;
const filePath = path.join(process.cwd(), 'data', 'players.json');

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

interface PlayerFile {
  players: Record<string, AchievementState>;
}

let chain: Promise<unknown> = Promise.resolve();

export async function prefixesFor(ids: number[], lang: Lang): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter(id => Number.isInteger(id) && id > 0))];
  const marks = new Map<number, string>();
  if (unique.length === 0) return marks;
  const difficultyName = (difficulty: SudokuGuruDifficulty) => messages(lang).difficulties[difficulty];
  const states = process.env.RECORDS_BACKEND === 'firestore'
    ? await readFirestoreStates(unique)
    : await readFileStates(unique);
  for (const id of unique) {
    const state = states.get(id);
    if (!state) continue;
    const prefix = cardPrefix(state, difficultyName);
    if (prefix) marks.set(id, prefix);
  }
  return marks;
}

export async function readPublic(userId: number): Promise<PublicAchievements> {
  const states = process.env.RECORDS_BACKEND === 'firestore'
    ? await readFirestoreStates([userId])
    : await readFileStates([userId]);
  return publish(states.get(userId) ?? emptyAchievements());
}

export async function recordWin(userId: number, facts: WinFacts & { seconds: number }): Promise<PublicAchievements | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isInteger(facts.seconds) || facts.seconds < 1 || facts.seconds > 24 * 60 * 60) return null;
  const trusted = facts.beatBareAuthor === true || facts.firstInChat === true;
  if (!trusted && facts.seconds < MIN_SECONDS) return null;
  if (!Object.values(SudokuGuruDifficulty).includes(facts.difficulty)) return null;
  return updatePlayer(userId, state => applyWin(state, facts));
}

export async function recordStart(hostId: number, starterId: number): Promise<void> {
  if (!Number.isInteger(hostId) || hostId <= 0 || hostId === starterId) return;
  await updatePlayer(hostId, state => applyStart(state, starterId));
}

export async function toggleListedPin(userId: number, pin: unknown): Promise<PublicAchievements | null> {
  if (!isAchievementId(pin)) return null;
  return updatePlayer(userId, state => applyPin(state, pin) ?? state);
}

export function winFactsFromBody(body: { difficulty?: unknown; settings?: unknown; pencilUsed?: unknown }, day = todayKey()): WinFacts | null {
  if (!Object.values(SudokuGuruDifficulty).includes(body.difficulty as SudokuGuruDifficulty)) return null;
  const settings = readSettingsSnapshot(body.settings);
  return {
    day,
    difficulty: body.difficulty as SudokuGuruDifficulty,
    bare: settings !== null && bareSettings(settings),
    pencilUsed: body.pencilUsed === true ? true : body.pencilUsed === false ? false : null,
  };
}

async function updatePlayer(userId: number, change: (state: AchievementState) => AchievementState): Promise<PublicAchievements> {
  const run = chain.then(() => process.env.RECORDS_BACKEND === 'firestore'
    ? updateFirestore(userId, change)
    : updateFile(userId, change));
  chain = run.then(() => undefined, () => undefined);
  return run;
}

async function updateFile(userId: number, change: (state: AchievementState) => AchievementState): Promise<PublicAchievements> {
  const file = await readPlayers();
  const next = change(normalize(file.players[String(userId)] ?? emptyAchievements()));
  file.players[String(userId)] = next;
  await writePlayers(file);
  return publish(next);
}

async function updateFirestore(userId: number, change: (state: AchievementState) => AchievementState): Promise<PublicAchievements> {
  const { Firestore } = await import('@google-cloud/firestore');
  const ref = new Firestore().doc(`players/${userId}`);
  return ref.firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const stored = snapshot.exists ? snapshot.data() as AchievementState : emptyAchievements();
    const next = change(normalize(stored));
    transaction.set(ref, next);
    return publish(next);
  });
}

function publish(state: AchievementState): PublicAchievements {
  return {
    tomorrow: state.tomorrow,
    table: state.table,
    first: state.first,
    streak: state.streak,
    reply: state.reply,
    blind: state.blind,
    pencil: state.pencil,
    pins: state.pins,
  };
}

function normalize(state: AchievementState): AchievementState {
  const empty = emptyAchievements();
  return {
    ...empty,
    ...state,
    winDays: Array.isArray(state.winDays) ? state.winDays.filter(day => typeof day === 'string') : [],
    bareDays: Array.isArray(state.bareDays) ? state.bareDays.filter(day => typeof day === 'string') : [],
    starters: Array.isArray(state.starters) ? state.starters.filter(id => Number.isInteger(id)) : [],
    pins: Array.isArray(state.pins) ? state.pins.filter(isAchievementId).slice(0, 2) : [],
    blind: state.blind && Object.values(SudokuGuruDifficulty).includes(state.blind) ? state.blind : null,
    pencil: state.pencil && Object.values(SudokuGuruDifficulty).includes(state.pencil) ? state.pencil : null,
  };
}

async function readFileStates(ids: number[]): Promise<Map<number, AchievementState>> {
  const file = await readPlayers();
  const states = new Map<number, AchievementState>();
  for (const id of ids) {
    const stored = file.players[String(id)];
    if (stored) states.set(id, normalize(stored));
  }
  return states;
}

async function readFirestoreStates(ids: number[]): Promise<Map<number, AchievementState>> {
  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore();
  const snapshots = await db.getAll(...ids.map(id => db.doc(`players/${id}`)));
  const states = new Map<number, AchievementState>();
  snapshots.forEach((snapshot, index) => {
    if (snapshot.exists) states.set(ids[index], normalize(snapshot.data() as AchievementState));
  });
  return states;
}

async function readPlayers(): Promise<PlayerFile> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<PlayerFile>;
    return { players: parsed.players ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { players: {} };
    throw error;
  }
}

async function writePlayers(file: PlayerFile): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(file));
  await rename(temporary, filePath);
}
