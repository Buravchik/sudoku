"use client";

import { clearCell, resetProgress, setUserValue, toggleHint } from '@/sudoku/cells';
import { DailyChallenge, parseStartParam } from '@/sudoku/daily';
import { GhostRace, parseDuelId } from '@/sudoku/duel';
import { loadDailyPuzzle, loadLevelPuzzle, loadPuzzle } from '@/sudoku/loadPuzzle';
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
import { submitGroupScore } from '@/telegram/submitScore';
import { GameSettingsType } from '@/types';
import SettingsIcon from '@mui/icons-material/Settings';
import { Dialog } from '@mui/material';
import Button from '@mui/material/Button';
import { Stack } from '@mui/system';
import { useEffect, useRef, useState } from 'react';
import GameBoard from '../GameBoard';
import GameSettings from '../GameSettings';
import styles from './GameWrapper.module.css';

export default function GameWrapper() {
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
  }, [gameState, difficultyState, board, challenge, ghost, persist, storageReady]);

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
      if (challengeRef.current && boardRef.current?.source === 'online') {
        void submitGroupScore(timeRef.current).then(result => {
          if (result?.improved) setGroupPlace(result.place);
        });
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
    setShareError(null);
    setSettings(loadSettings());
    setGameState('selectDifficulty');
    setBoard(null);
    setTime(0);
  };

  useEffect(() => {
    if (!board || (gameState !== 'playing' && gameState !== 'won')) return;
    const solved = isSolved(board.cells);
    if (solved && gameState !== 'won') setGameState('won');
    if (!solved && gameState === 'won') setGameState('playing');
  }, [board, gameState]);

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
        setShareError('Could not send the challenge.');
        return;
      }
      const text = `Судоку · ${difficultyState} · ${formatTime(timeRef.current)}. Тот же уровень и те же настройки: на твоей секунде видно, сколько цифр оставалось у меня.`;
      if (created.messageId && telegramWebApp()?.shareMessage) {
        await sharePreparedMessage(created.messageId);
        return;
      }
      if (shareInTelegram(text, created.link)) return;
      try {
        await navigator.clipboard.writeText(`${text} ${created.link}`);
      } catch (error) {
        console.error('Could not copy the challenge:', error);
        setShareError('Could not send the challenge.');
      }
      return;
    }

    const text = `Solved ${difficultyState || 'a'} sudoku in ${formatTime(time)}.`;
    const url = publicShareUrl(inTelegram, readStartParam(), window.location.href);
    if (shareInTelegram(text, url)) return;
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
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

  const handleStartGame = async (difficulty: SudokuGuruDifficulty) => {
    setIsLoading(true);
    paceRef.current = [];
    setChallenge(null);
    setGhost(null);
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

  return (
    <div className={`${styles.gameWrapper} game-shell`}>
      <div className={`${styles.gameHeader} game-header`}>
        <div className={styles.title}>
          <span className={styles.difficulty}>
            {difficultyState ? `Game - ${difficultyState}` : 'Game'}
          </span>
          <span className={styles.timer}>
            {" - Time: "}{formatTime(time)}
          </span>
        </div>
        <Button
          className={styles.settingsButton}
          onClick={() => setIsSettingsOpen(true)}
          aria-label="Settings"
        >
          <SettingsIcon />
        </Button>
      </div>

      {challenge && activeBoard && (
        <p className={styles.notice}>Chat puzzle, {challenge.difficulty}.</p>
      )}
      {ghost && activeBoard && (
        <p className={styles.notice}>{ghostLine(ghost, time, cellsLeft(activeBoard.cells))}</p>
      )}
      {activeBoard?.source === 'offline' && (
        <p className={styles.notice}>Online puzzles are unavailable. This round uses an offline puzzle.</p>
      )}
      {gameState === 'won' && (
        <p className={styles.winBanner}>
          Solved in {formatTime(time)}.
          {groupPlace ? ` ${placeLabel(groupPlace)} in the chat today.` : ''}
          {ghost ? raceResult(ghost, time) : ''}
        </p>
      )}

      {isLoading || !storageReady ? (
        <div className={styles.loadingContainer}>Loading...</div>
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
                New Game
              </Button>
            )}

            {activeBoard && (
              <Button variant="outlined" onClick={handleReset} fullWidth>
                Start from scratch
              </Button>
            )}

            {gameState === 'won' && (
              <Button variant="outlined" onClick={() => void handleShare()} disabled={sharing} fullWidth>
                {sharing ? 'Sending challenge...' : canChallenge(activeBoard) ? 'Challenge a friend' : 'Share result'}
              </Button>
            )}
            {shareError && <p className={styles.errorText}>{shareError}</p>}

            {(homeScreen === 'missed' || homeScreen === 'unknown') && (
              <Button
                variant="outlined"
                onClick={() => telegramWebApp()?.addToHomeScreen?.()}
                fullWidth
              >
                Add to Home Screen
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
                  {difficulty}
                </Button>
              ))
            )}

            {gameState === 'error' && (
              <>
                <p className={styles.errorText}>Could not load a puzzle.</p>
                <Button
                  variant="outlined"
                  onClick={() => {
                    if (difficultyState) void handleStartGame(difficultyState);
                  }}
                  fullWidth
                  disabled={!difficultyState}
                >
                  Try again
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

function placeLabel(place: number): string {
  const mod100 = place % 100;
  const mod10 = place % 10;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? 'th'
    : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
  return `${place}${suffix}`;
}

function canChallenge(board: LoadedPuzzle | null): boolean {
  return Boolean(telegramWebApp() && board?.level != null);
}

function ghostLine(ghost: GhostRace, time: number, youLeft: number): string {
  const pace = paceAt(ghost.samples, time, ghost.total);
  const percent = pacePercent(ghost.total, pace.left);
  if (time >= ghost.seconds) {
    return `${ghost.name} finished in ${formatTime(ghost.seconds)}. You have ${youLeft} left.`;
  }
  return `You: ${youLeft} left. ${ghost.name} at ${formatTime(time)}: ${pace.left} left, ${percent}%.`;
}

function raceResult(ghost: GhostRace, time: number): string {
  const delta = Math.abs(time - ghost.seconds);
  if (time < ghost.seconds) return ` Ahead of ${ghost.name} by ${formatTime(delta)}.`;
  if (time > ghost.seconds) return ` ${ghost.name} was faster by ${formatTime(delta)}.`;
  return ` Tied with ${ghost.name}.`;
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
