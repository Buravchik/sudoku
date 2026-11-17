"use client";

import { clearCell, resetProgress, setUserValue, toggleHint } from '@/sudoku/cells';
import { DailyChallenge, parseStartParam } from '@/sudoku/daily';
import { GhostRace, parseDuelId } from '@/sudoku/duel';
import { loadDailyPuzzle, loadLevelPuzzle, loadPuzzle } from '@/sudoku/loadPuzzle';
import { Copy } from '@/i18n';
import { parseMatchId } from '@/sudoku/match';
import { appendPace, cellsLeft, cellsToFill, paceAt, pacePercent, PaceSample } from '@/sudoku/pace';
import { isSolved } from '@/sudoku/rules';
import {
  clearStoredSession,
  loadDeviceSnapshot,
  loadSettings,
  loadStoredSession,
  saveSettings,
  saveStoredSession,
} from '@/sudoku/storage';
import { Digit, LoadedPuzzle, SudokuGuruDifficulty } from '@/sudoku/types';
import { createDuel, fetchDuel, reportDuelResult } from '@/telegram/duelClient';
import { fetchMatchState, reportMatchResult } from '@/telegram/matchClient';
import {
  hapticImpact,
  hapticSelection,
  hapticSuccess,
  hasDeviceStorage,
  publicShareUrl,
  readStartParam,
  setClosingConfirmation,
  shareInTelegram,
  sharePreparedMessage,
  telegramWebApp,
} from '@/telegram/webApp';
import { GroupLeader, GroupPlayer, LiveRival, submitGroupScore, syncGroupRace } from '@/telegram/submitScore';
import { GameSettingsType } from '@/types';
import SettingsIcon from '@mui/icons-material/Settings';
import { Dialog } from '@mui/material';
import Button from '@mui/material/Button';
import { Stack } from '@mui/system';
import { useEffect, useRef, useState } from 'react';
import GameBoard from '../GameBoard';
import GameSettings from '../GameSettings';
import { useMessages } from '../Locale';
import styles from './GameWrapper.module.css';

export default function GameWrapper() {
  const text = useMessages();
  const [session] = useState(loadStoredSession);
  const [gameState, setGameState] = useState(session.gameState);
  const [difficultyState, setDifficultyState] = useState(session.difficultyState);
  const [board, setBoard] = useState<LoadedPuzzle | null>(session.board);
  const [isLoading, setIsLoading] = useState(false);
  const [time, setTime] = useState(session.elapsedSeconds);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettingsType>(() => session.ghost?.settings ?? loadSettings());
  const [storageReady, setStorageReady] = useState(() => !hasDeviceStorage());
  const [homeScreen, setHomeScreen] = useState<'unsupported' | 'unknown' | 'added' | 'missed' | null>(null);
  const [challenge, setChallenge] = useState<DailyChallenge | null>(session.challenge);
  const [ghost, setGhost] = useState<GhostRace | null>(session.ghost);
  const [groupPlace, setGroupPlace] = useState<number | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [groupLeader, setGroupLeader] = useState<GroupLeader | null>(null);
  const [groupPlayers, setGroupPlayers] = useState<GroupPlayer[]>([]);
  const [liveRival, setLiveRival] = useState<LiveRival | null>(null);
  const [matchId, setMatchId] = useState<string | null>(session.matchId);
  const [matchLeader, setMatchLeader] = useState<GroupLeader | null>(null);
  const [sharing, setSharing] = useState(false);

  const timeRef = useRef(time);
  const boardRef = useRef(board);
  const gameStateRef = useRef(gameState);
  const difficultyRef = useRef(difficultyState);
  const storageReadyRef = useRef(storageReady);
  const settingsRef = useRef(settings);
  const previousStateRef = useRef(gameState);
  const challengeRef = useRef(challenge);
  const ghostRef = useRef(ghost);
  const matchIdRef = useRef(matchId);
  const paceRef = useRef<PaceSample[]>(session.pace);
  const challengeLaunchStarted = useRef(false);
  timeRef.current = time;
  boardRef.current = board;
  gameStateRef.current = gameState;
  difficultyRef.current = difficultyState;
  storageReadyRef.current = storageReady;
  settingsRef.current = settings;
  challengeRef.current = challenge;
  ghostRef.current = ghost;
  matchIdRef.current = matchId;

  const persist = useRef(() => {
    if (!storageReadyRef.current) return;
    saveStoredSession({
      gameState: gameStateRef.current,
      difficultyState: difficultyRef.current,
      board: boardRef.current,
      elapsedSeconds: timeRef.current,
      challenge: challengeRef.current,
      pace: paceRef.current,
      ghost: ghostRef.current,
      matchId: matchIdRef.current,
    });
  }).current;

  useEffect(() => {
    if (storageReady) return;
    let cancelled = false;
    loadDeviceSnapshot().then(snapshot => {
      if (cancelled) return;
      if (snapshot.settings) setSettings(snapshot.settings);
      else if (snapshot.settingsMissing) saveSettings(settingsRef.current);
      const restored = snapshot.session;
      if (restored && (restored.gameState === 'playing' || restored.gameState === 'won')) {
        setGameState(restored.gameState);
        setDifficultyState(restored.difficultyState);
        setBoard(restored.board);
        setTime(restored.elapsedSeconds);
        setChallenge(restored.challenge);
        setGhost(restored.ghost);
        setMatchId(restored.matchId);
        if (restored.ghost) setSettings(restored.ghost.settings);
        paceRef.current = restored.pace;
        previousStateRef.current = restored.gameState;
      }
      setStorageReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storageReady]);

  useEffect(() => {
    if ((gameState !== 'playing' && gameState !== 'won') || !board) return;
    paceRef.current = appendPace(paceRef.current, timeRef.current, cellsLeft(board.cells));
  }, [board, gameState]);

  useEffect(() => {
    if (!storageReady) return;
    persist();
  }, [gameState, difficultyState, board, challenge, ghost, matchId, persist, storageReady]);

  useEffect(() => {
    setClosingConfirmation(storageReady && gameState === 'playing');
  }, [gameState, storageReady]);

  useEffect(() => {
    if (!storageReady || challengeLaunchStarted.current) return;
    challengeLaunchStarted.current = true;
    const param = readStartParam();
    const duelId = parseDuelId(param);
    if (duelId) {
      if (ghostRef.current?.id === duelId && boardRef.current) return;
      void startDuel(duelId);
      return;
    }
    const openedMatch = parseMatchId(param);
    if (openedMatch) {
      if (matchIdRef.current === openedMatch && boardRef.current) return;
      void startMatch(openedMatch);
      return;
    }
    const launch = parseStartParam(param);
    if (!launch) return;
    const current = challengeRef.current;
    const sameCard = current?.cardId === launch.cardId && current.day === launch.day;
    if (sameCard && boardRef.current) return;
    void startChallenge(launch);
  }, [storageReady]);

  useEffect(() => {
    if (previousStateRef.current === 'playing' && gameState === 'won') {
      hapticSuccess();
      const finishedBoard = boardRef.current;
      if (challengeRef.current && finishedBoard?.source === 'online') {
        const samples = appendPace(paceRef.current, timeRef.current, cellsLeft(finishedBoard.cells));
        paceRef.current = samples;
        void submitGroupScore(timeRef.current, samples, cellsToFill(finishedBoard.cells)).then(result => {
          if (result?.improved) setGroupPlace(result.place);
        });
      }
      if (matchIdRef.current && finishedBoard?.source === 'online') {
        const samples = appendPace(paceRef.current, timeRef.current, cellsLeft(finishedBoard.cells));
        paceRef.current = samples;
        void reportMatchResult(timeRef.current, samples, cellsToFill(finishedBoard.cells));
      }
      if (ghostRef.current) void reportDuelResult(ghostRef.current.id, timeRef.current);
    }
    previousStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    const webApp = telegramWebApp();
    if (!webApp?.checkHomeScreenStatus) return;
    let cancelled = false;
    webApp.checkHomeScreenStatus(status => {
      if (!cancelled) setHomeScreen(status);
    });
    const onAdded = () => setHomeScreen('added');
    webApp.onEvent('homeScreenAdded', onAdded);
    return () => {
      cancelled = true;
      webApp.offEvent('homeScreenAdded', onAdded);
    };
  }, []);

  useEffect(() => {
    if (!storageReady || gameState !== 'playing') return;
    const id = window.setInterval(() => {
      setTime(previous => previous + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [gameState, storageReady]);

  useEffect(() => {
    if (!storageReady || gameState !== 'playing' || !challenge) return;
    let cancelled = false;
    const send = async () => {
      const current = boardRef.current;
      if (!current) return;
      const race = await syncGroupRace(
        cellsLeft(current.cells),
        cellsToFill(current.cells),
        timeRef.current,
        paceRef.current,
      );
      if (cancelled || !race) return;
      setGroupLeader(race.leader);
      setGroupPlayers(race.players);
      setLiveRival(race.rival);
    };
    void send();
    const id = window.setInterval(() => void send(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [gameState, storageReady, challenge]);

  useEffect(() => {
    if (!storageReady || gameState !== 'playing' || !matchId) return;
    let cancelled = false;
    const send = async () => {
      const race = await fetchMatchState();
      if (cancelled || !race) return;
      setMatchLeader(race.leader);
    };
    void send();
    const id = window.setInterval(() => void send(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [gameState, storageReady, matchId]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const id = window.setInterval(() => persist(), 5000);
    return () => window.clearInterval(id);
  }, [gameState, persist]);

  useEffect(() => {
    const saveIfHidden = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', saveIfHidden);
    return () => {
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', saveIfHidden);
      persist();
    };
  }, [persist]);

  const handleSettingChange = (setting: keyof GameSettingsType) => {
    setSettings(current => {
      const next = { ...current, [setting]: !current[setting] };
      if (!ghostRef.current) saveSettings(next);
      return next;
    });
  };

  const handleNewGame = () => {
    clearStoredSession();
    paceRef.current = [];
    setChallenge(null);
    setGhost(null);
    setGroupPlace(null);
    setGroupLeader(null);
    setGroupPlayers([]);
    setLiveRival(null);
    setMatchId(null);
    setMatchLeader(null);
    setShareError(null);
    setSettings(loadSettings());
    setGameState('selectDifficulty');
    setBoard(null);
    setTime(0);
  };

  if (board && (gameState === 'playing' || gameState === 'won')) {
    const solved = isSolved(board.cells);
    if (solved && gameState !== 'won') setGameState('won');
    if (!solved && gameState === 'won') setGameState('playing');
  }

  const handleCellValueChange = (index: number, value: Digit) => {
    hapticImpact();
    setBoard(current => replaceCell(current, index, cell => setUserValue(cell, value)));
  };

  const handleCellHintToggle = (index: number, hint: number) => {
    hapticSelection();
    setBoard(current => replaceCell(current, index, cell => toggleHint(cell, hint)));
  };

  const handleCellClear = (index: number) => {
    hapticImpact();
    setBoard(current => replaceCell(current, index, clearCell));
  };

  const handleShare = async () => {
    const boardNow = boardRef.current;
    const inTelegram = Boolean(telegramWebApp());
    if (inTelegram && boardNow?.level != null && difficultyState) {
      setSharing(true);
      setShareError(null);
      const samples = appendPace(paceRef.current, timeRef.current, cellsLeft(boardNow.cells));
      paceRef.current = samples;
      const created = await createDuel({
        difficulty: difficultyState,
        level: boardNow.level,
        seconds: timeRef.current,
        total: cellsToFill(boardNow.cells),
        samples,
        settings: settingsRef.current,
      });
      setSharing(false);
      if (!created) {
        setShareError(text.shareFailed);
        return;
      }
      const challengeText = text.shareChallenge(difficultyState, formatTime(timeRef.current));
      if (created.messageId && telegramWebApp()?.shareMessage) {
        await sharePreparedMessage(created.messageId);
        return;
      }
      if (shareInTelegram(challengeText, created.link)) return;
      try {
        await navigator.clipboard.writeText(`${challengeText} ${created.link}`);
      } catch (error) {
        console.error('Could not copy the challenge:', error);
        setShareError(text.shareFailed);
      }
      return;
    }

    const solvedText = text.shareSolved(difficultyState || 'a', formatTime(time));
    const url = publicShareUrl(inTelegram, readStartParam(), window.location.href);
    if (shareInTelegram(solvedText, url)) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: solvedText, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${solvedText} ${url}`);
    } catch (error) {
      console.error('Could not share the result:', error);
    }
  };

  const handleReset = () => {
    paceRef.current = [];
    setBoard(current => current ? { ...current, cells: current.cells.map(resetProgress) } : current);
    setTime(0);
    setGameState('playing');
  };

  const startChallenge = async (launch: DailyChallenge) => {
    setIsLoading(true);
    paceRef.current = [];
    setChallenge(launch);
    setGhost(null);
    setGroupLeader(null);
    setGroupPlayers([]);
    setLiveRival(null);
    setMatchId(null);
    setMatchLeader(null);
    setSettings(loadSettings());
    setDifficultyState(launch.difficulty);
    setGroupPlace(null);
    setBoard(null);
    setGameState('notStarted');
    setTime(0);
    clearStoredSession();
    try {
      const puzzle = await loadDailyPuzzle(launch.difficulty, launch.day);
      setBoard(puzzle);
      setGameState('playing');
    } catch (error) {
      console.error('Failed to open the chat puzzle:', error);
      setBoard(null);
      setGameState('error');
    } finally {
      setIsLoading(false);
    }
  };

  const startDuel = async (id: string) => {
    setIsLoading(true);
    paceRef.current = [];
    setChallenge(null);
    setGhost(null);
    setGroupLeader(null);
    setGroupPlayers([]);
    setLiveRival(null);
    setMatchId(null);
    setMatchLeader(null);
    setGroupPlace(null);
    setBoard(null);
    setGameState('notStarted');
    setTime(0);
    clearStoredSession();
    try {
      const race = await fetchDuel(id);
      if (!race) throw new Error('The challenge is unavailable');
      const puzzle = await loadLevelPuzzle(race.difficulty, race.level);
      setGhost(race);
      setSettings(race.settings);
      setDifficultyState(race.difficulty);
      setBoard(puzzle);
      setGameState('playing');
    } catch (error) {
      console.error('Failed to open the challenge:', error);
      setBoard(null);
      setGameState('error');
    } finally {
      setIsLoading(false);
    }
  };

  const startMatch = async (id: string) => {
    setIsLoading(true);
    paceRef.current = [];
    setChallenge(null);
    setGhost(null);
    setGroupLeader(null);
    setGroupPlayers([]);
    setLiveRival(null);
    setMatchId(id);
    setMatchLeader(null);
    setGroupPlace(null);
    setSettings(loadSettings());
    setBoard(null);
    setGameState('notStarted');
    setTime(0);
    clearStoredSession();
    try {
      const race = await fetchMatchState();
      if (!race) throw new Error('The shared puzzle is unavailable');
      const puzzle = await loadLevelPuzzle(race.difficulty, race.level);
      setMatchLeader(race.leader);
      setDifficultyState(race.difficulty);
      setBoard(puzzle);
      setGameState('playing');
    } catch (error) {
      console.error('Failed to open the shared puzzle:', error);
      setMatchId(null);
      setBoard(null);
      setGameState('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartGame = async (difficulty: SudokuGuruDifficulty) => {
    setIsLoading(true);
    paceRef.current = [];
    setChallenge(null);
    setGhost(null);
    setGroupLeader(null);
    setGroupPlayers([]);
    setLiveRival(null);
    setMatchId(null);
    setMatchLeader(null);
    setSettings(loadSettings());
    setGroupPlace(null);
    setDifficultyState(difficulty);
    setBoard(null);
    setGameState('notStarted');
    setTime(0);
    clearStoredSession();

    try {
      const puzzle = await loadPuzzle(difficulty);
      setBoard(puzzle);
      setGameState('playing');
    } catch (error) {
      console.error('Failed to create new game:', error);
      setBoard(null);
      setGameState('error');
    } finally {
      setIsLoading(false);
    }
  };

  const activeBoard = gameState === 'playing' || gameState === 'won' ? board : null;
  const paceOpponent = ghost ?? (gameState === 'playing' ? (groupLeader ?? matchLeader) : null);
  const difficultyName = difficultyState ? text.difficulties[difficultyState] : null;

  return (
    <div className={`${styles.gameWrapper} game-shell`}>
      <div className={`${styles.gameHeader} game-header`}>
        <div className={styles.title}>
          <span className={styles.difficulty}>
            {text.gameTitle(difficultyName)}
          </span>
          <span className={styles.timer}>
            {text.timeTitle(formatTime(time))}
          </span>
        </div>
        <Button
          className={styles.settingsButton}
          onClick={() => setIsSettingsOpen(true)}
          aria-label={text.settings}
        >
          <SettingsIcon />
        </Button>
      </div>

      {challenge && activeBoard && (
        <p className={styles.notice}>{text.chatPuzzle(text.difficulties[challenge.difficulty])}</p>
      )}
      {paceOpponent && activeBoard && (
        <GhostRaceStrip
          name={paceOpponent.name}
          samples={paceOpponent.samples}
          total={paceOpponent.total}
          time={time}
          youLeft={cellsLeft(activeBoard.cells)}
        />
      )}
      {liveRival && activeBoard && gameState === 'playing' && (
        <LiveSpeedStrip
          rival={liveRival}
          youTime={time}
          youLeft={cellsLeft(activeBoard.cells)}
          youTotal={cellsToFill(activeBoard.cells)}
          youSamples={appendPace(paceRef.current, time, cellsLeft(activeBoard.cells))}
        />
      )}
      {matchId && activeBoard && (
        <p className={styles.notice}>{text.sharedPuzzle(text.difficulties[activeBoard.difficulty])}</p>
      )}
      {challenge && groupPlayers.length > 0 && activeBoard && (
        <GroupField players={groupPlayers} />
      )}
      {activeBoard?.source === 'offline' && (
        <p className={styles.notice}>{text.offline}</p>
      )}
      {gameState === 'won' && (
        <p className={styles.winBanner}>
          {text.solved(formatTime(time))}
          {groupPlace ? ` ${text.place(groupPlace)}` : ''}
          {ghost ? raceResult(text, ghost, time) : ''}
          {!ghost && groupLeader ? raceResult(text, groupLeader, time) : ''}
          {!ghost && !groupLeader && matchLeader ? raceResult(text, matchLeader, time) : ''}
        </p>
      )}

      {isLoading || !storageReady ? (
        <div className={styles.loadingContainer}>{text.loading}</div>
      ) : (
        <>
          <Stack spacing={2} sx={{
            width: '100%',
            '& .MuiButton-root': {
              height: '36px',
              borderRadius: '4px',
              textTransform: 'uppercase',
            },
          }}>
            {gameState !== 'selectDifficulty' && (
              <Button variant="outlined" onClick={handleNewGame} fullWidth>
                {text.newGame}
              </Button>
            )}

            {activeBoard && (
              <Button variant="outlined" onClick={handleReset} fullWidth>
                {text.reset}
              </Button>
            )}

            {gameState === 'won' && (
              <Button variant="outlined" onClick={() => void handleShare()} disabled={sharing} fullWidth>
                {sharing ? text.sending : canChallenge(activeBoard) ? text.challengeFriend : text.shareResult}
              </Button>
            )}
            {shareError && <p className={styles.errorText}>{shareError}</p>}

            {(homeScreen === 'missed' || homeScreen === 'unknown') && (
              <Button
                variant="outlined"
                onClick={() => telegramWebApp()?.addToHomeScreen?.()}
                fullWidth
              >
                {text.addHome}
              </Button>
            )}

            {gameState === 'selectDifficulty' && (
              Object.values(SudokuGuruDifficulty).map(difficulty => (
                <Button
                  key={difficulty}
                  variant="outlined"
                  onClick={() => handleStartGame(difficulty)}
                  fullWidth
                >
                  {text.difficulties[difficulty]}
                </Button>
              ))
            )}

            {gameState === 'error' && (
              <>
                <p className={styles.errorText}>{text.loadFailed}</p>
                <Button
                  variant="outlined"
                  onClick={() => {
                    if (difficultyState) void handleStartGame(difficultyState);
                  }}
                  fullWidth
                  disabled={!difficultyState}
                >
                  {text.tryAgain}
                </Button>
              </>
            )}
          </Stack>

          {activeBoard && (
            <div className={styles.gameBoard}>
              <GameBoard
                cells={activeBoard.cells}
                onCellValueChange={handleCellValueChange}
                onCellHintToggle={handleCellHintToggle}
                onCellClear={handleCellClear}
                settings={settings}
              />
            </div>
          )}
        </>
      )}

      <Dialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <GameSettings
          settings={settings}
          onSettingChange={handleSettingChange}
          onClose={() => setIsSettingsOpen(false)}
        />
      </Dialog>
    </div>
  );
}

function replaceCell(
  board: LoadedPuzzle | null,
  index: number,
  update: (cell: LoadedPuzzle['cells'][number]) => LoadedPuzzle['cells'][number],
): LoadedPuzzle | null {
  if (!board) return board;
  const nextCell = update(board.cells[index]);
  if (nextCell === board.cells[index]) return board;
  return {
    ...board,
    cells: board.cells.map((cell, cellIndex) => cellIndex === index ? nextCell : cell),
  };
}

function canChallenge(board: LoadedPuzzle | null): boolean {
  return Boolean(telegramWebApp() && board?.level != null);
}

function GhostRaceStrip({
  name,
  samples,
  total,
  time,
  youLeft,
}: {
  name: string;
  samples: PaceSample[];
  total: number;
  time: number;
  youLeft: number;
}) {
  const text = useMessages();
  const theirs = paceAt(samples, time, total);
  const youPercent = pacePercent(total, youLeft);
  const theirPercent = pacePercent(total, theirs.left);
  const status = youPercent > theirPercent ? text.ahead : youPercent < theirPercent ? text.behind : text.level;
  return (
    <div className={styles.race} aria-live="polite">
      <RaceMeter label={text.you} left={youLeft} percent={youPercent} />
      <RaceMeter label={name} left={theirs.left} percent={theirPercent} />
      <p className={styles.notice}>{status}</p>
    </div>
  );
}

function GroupField({ players }: { players: GroupPlayer[] }) {
  const text = useMessages();
  return (
    <div className={styles.field}>
      {players.map(player => (
        <div className={styles.raceLabel} key={`${player.name}-${player.finished}-${player.left}`}>
          <span>{player.name}</span>
          <span>{text.left(player.left, pacePercent(player.total, player.left))}</span>
        </div>
      ))}
    </div>
  );
}

function LiveSpeedStrip({
  rival,
  youTime,
  youLeft,
  youTotal,
  youSamples,
}: {
  rival: LiveRival;
  youTime: number;
  youLeft: number;
  youTotal: number;
  youSamples: PaceSample[];
}) {
  const text = useMessages();
  const shared = Math.min(youTime, rival.seconds);
  const youThen = paceAt(youSamples, shared, youTotal);
  const them = paceAt(rival.samples, shared, rival.total);
  const youNowPercent = pacePercent(youTotal, youLeft);
  const youThenPercent = pacePercent(youTotal, youThen.left);
  const themPercent = pacePercent(rival.total, them.left);
  const status = youThenPercent > themPercent ? text.ahead : youThenPercent < themPercent ? text.behind : text.level;
  const earlier = shared < youTime;
  const stamp = formatTime(shared);
  return (
    <div className={styles.race} aria-live="polite">
      <RaceMeter label={text.you} left={youLeft} percent={youNowPercent} />
      {earlier && <RaceMeter label={text.youAt(stamp)} left={youThen.left} percent={youThenPercent} ghost />}
      <RaceMeter
        label={earlier ? text.rivalAt(rival.name, stamp) : rival.name}
        left={them.left}
        percent={themPercent}
        ghost={earlier}
      />
      <p className={styles.notice}>{status}</p>
    </div>
  );
}

function RaceMeter({ label, left, percent, ghost = false }: { label: string; left: number; percent: number; ghost?: boolean }) {
  const text = useMessages();
  return (
    <div className={styles.raceMeter}>
      <div className={styles.raceLabel}>
        <span>{label}</span>
        <span>{text.left(left, percent)}</span>
      </div>
      <div className={styles.raceTrack}>
        <div className={ghost ? styles.raceFillGhost : styles.raceFill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function raceResult(text: Copy, opponent: { name: string; seconds: number }, time: number): string {
  const delta = formatTime(Math.abs(time - opponent.seconds));
  if (time < opponent.seconds) return text.aheadOf(opponent.name, delta);
  if (time > opponent.seconds) return text.slower(opponent.name, delta);
  return text.tied(opponent.name);
}

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
