"use client";

import { clearCell, resetProgress, setUserValue, toggleHint } from '@/sudoku/cells';
import { buildStartParam, DailyChallenge, parseStartParam } from '@/sudoku/daily';
import { GhostRace, parseDuelId } from '@/sudoku/duel';
import { loadDailyPuzzle, loadLevelPuzzle, loadPuzzle } from '@/sudoku/loadPuzzle';
import { Copy } from '@/i18n';
import { parseMatchId } from '@/sudoku/match';
import { appendPace, cellsLeft, cellsToFill, paceAt, pacePercent, PaceSample } from '@/sudoku/pace';
import { settingsNickname } from '@/sudoku/nicknames';
import { isSolved } from '@/sudoku/rules';
import { ScoreMark, difficultyMultiplier, finalScore, missedStake, shownTotal, stakeAt } from '@/sudoku/score';
import {
  clearStoredSession,
  isDroppedChallenge,
  loadDeviceSnapshot,
  loadSettings,
  loadStoredSession,
  rememberDroppedChallenge,
  saveSettings,
  saveStoredSession,
} from '@/sudoku/storage';
import { Digit, LoadedPuzzle, SudokuCell, SudokuGuruDifficulty } from '@/sudoku/types';
import { createDuel, fetchDuel, forfeitDuel, reportDuelResult } from '@/telegram/duelClient';
import { fetchMatchState, reportMatchResult } from '@/telegram/matchClient';
import {
  canDropInChat,
  hapticImpact,
  hapticSelection,
  hapticSuccess,
  hasDeviceStorage,
  offerDropInChat,
  publicShareUrl,
  readStartParam,
  setClosingConfirmation,
  shareInTelegram,
  sharePreparedMessage,
  telegramWebApp,
} from '@/telegram/webApp';
import { GroupLeader, GroupPlayer, LiveRival, submitGroupScore, syncGroupRace } from '@/telegram/submitScore';
import { GameSettingsType } from '@/types';
import { ButtonHTMLAttributes, useEffect, useRef, useState } from 'react';
import GameBoard from '../GameBoard';
import GameSettings from '../GameSettings';
import ResultChart from '../ResultChart';
import { useLang, useMessages } from '../Locale';
import styles from './GameWrapper.module.css';

export default function GameWrapper() {
  const text = useMessages();
  const lang = useLang();
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
  const [showDropInChat, setShowDropInChat] = useState(false);
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
  const [mistakes, setMistakes] = useState(session.mistakes);
  const [undoCount, setUndoCount] = useState(0);
  const [marks, setMarks] = useState<ScoreMark[]>(session.marks);
  const [award, setAward] = useState<{ stake: number; key: number } | null>(null);
  const [closedChallenge, setClosedChallenge] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<PendingLeave>(null);

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
  const historyRef = useRef<PlayedMove[]>([]);
  const mistakesRef = useRef(mistakes);
  const marksRef = useRef(marks);
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
  mistakesRef.current = mistakes;
  marksRef.current = marks;

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
      mistakes: mistakesRef.current,
      marks: marksRef.current,
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
        historyRef.current = [];
        setUndoCount(0);
        setMistakes(restored.mistakes);
        setMarks(restored.marks);
        setAward(null);
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
    if (param && isDroppedChallenge(param)) {
      if (!boardRef.current) setClosedChallenge(true);
      return;
    }
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
    setShowDropInChat(canDropInChat());
  }, []);

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
        settingsRef.current,
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
      const race = await fetchMatchState(settingsRef.current);
      if (cancelled || !race) return;
      setMatchLeader(race.leader);
      if (race.settings && !sameSettings(settingsRef.current, race.settings)) setSettings(race.settings);
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
    if (!isSettingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSettingsOpen]);

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
    const next = { ...settingsRef.current, [setting]: !settingsRef.current[setting] };
    requestSettings(next);
  };

  const handleSettingsApply = (next: GameSettingsType) => {
    requestSettings(next);
  };

  const challengeOpen = () => Boolean(ghostRef.current || challengeRef.current || matchIdRef.current);

  const requestSettings = (next: GameSettingsType) => {
    if (sameSettings(settingsRef.current, next)) return;
    if (challengeOpen()) {
      setPendingLeave({ kind: 'settings', next });
      return;
    }
    setSettings(next);
    saveSettings(next);
  };

  const dropActiveChallenge = () => {
    const param = readStartParam();
    if (param) rememberDroppedChallenge(param);
    const race = ghostRef.current;
    if (race) {
      rememberDroppedChallenge(`d${race.id}`);
      void forfeitDuel(race.id);
    }
    if (matchIdRef.current) {
      rememberDroppedChallenge(`i${matchIdRef.current}`);
      void fetchMatchState(settingsRef.current, true);
    }
    const daily = challengeRef.current;
    const current = boardRef.current;
    if (daily) {
      rememberDroppedChallenge(buildStartParam(daily));
      if (current) {
        void syncGroupRace(
          cellsLeft(current.cells),
          cellsToFill(current.cells),
          timeRef.current,
          paceRef.current,
          settingsRef.current,
          true,
        );
      }
    }
    setGhost(null);
    setChallenge(null);
    setMatchId(null);
    setGroupLeader(null);
    setGroupPlayers([]);
    setLiveRival(null);
    setMatchLeader(null);
  };

  const confirmPending = () => {
    const pending = pendingLeave;
    if (!pending) return;
    dropActiveChallenge();
    if (pending.kind === 'settings') {
      setSettings(pending.next);
      saveSettings(pending.next);
    } else {
      beginNewGame();
    }
    setPendingLeave(null);
    setIsSettingsOpen(false);
  };

  const forgetMoves = () => {
    historyRef.current = [];
    setUndoCount(0);
    setMistakes(0);
    marksRef.current = [];
    setMarks([]);
    setAward(null);
  };

  const applyCell = (index: number, update: (cell: SudokuCell) => SudokuCell, countsAsMistake: boolean, score: boolean) => {
    const before = boardRef.current?.cells[index];
    if (!before) return;
    const after = update(before);
    if (after === before) return;
    const mistake = countsAsMistake && settingsRef.current.countMistakes;
    const difficulty = difficultyRef.current || boardRef.current?.difficulty;
    const mark = score && difficulty
      ? { t: Math.max(0, Math.floor(timeRef.current)), stake: stakeAt(difficulty, timeRef.current), hit: !countsAsMistake }
      : null;
    historyRef.current.push({ index, cell: before, mistake, scored: mark !== null });
    setUndoCount(historyRef.current.length);
    if (mistake) setMistakes(count => count + 1);
    if (mark) {
      const next = [...marksRef.current, mark];
      marksRef.current = next;
      setMarks(next);
      setAward({ stake: mark.stake, key: Date.now() });
    }
    setBoard(current => replaceCell(current, index, () => after));
  };

  const handleUndo = () => {
    const move = historyRef.current.pop();
    setUndoCount(historyRef.current.length);
    if (!move) return;
    if (move.mistake) setMistakes(count => Math.max(0, count - 1));
    if (move.scored) {
      const next = marksRef.current.slice(0, -1);
      marksRef.current = next;
      setMarks(next);
      setAward(null);
    }
    hapticImpact();
    setBoard(current => replaceCell(current, move.index, () => move.cell));
  };

  const handleNewGame = () => {
    if (challengeOpen()) {
      setPendingLeave({ kind: 'newGame' });
      return;
    }
    beginNewGame();
  };

  const beginNewGame = () => {
    clearStoredSession();
    paceRef.current = [];
    forgetMoves();
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
    const cell = boardRef.current?.cells[index];
    const wrong = Boolean(cell && value !== 0 && cell.solutionValue !== 0 && value !== cell.solutionValue);
    applyCell(index, current => setUserValue(current, value), wrong, value !== 0);
  };

  const handleCellHintToggle = (index: number, hint: number) => {
    hapticSelection();
    applyCell(index, cell => toggleHint(cell, hint), false, false);
  };

  const handleCellClear = (index: number) => {
    hapticImpact();
    applyCell(index, clearCell, false, false);
  };

  const handleShare = async () => {
    const boardNow = boardRef.current;
    const inTelegram = Boolean(telegramWebApp());
    if (inTelegram && boardNow?.level != null && difficultyState) {
      setSharing(true);
      setShareError(null);
      const samples = appendPace(paceRef.current, timeRef.current, cellsLeft(boardNow.cells));
      paceRef.current = samples;
      const score = settledScore(difficultyState, marksRef.current);
      const created = await createDuel({
        difficulty: difficultyState,
        level: boardNow.level,
        seconds: timeRef.current,
        total: cellsToFill(boardNow.cells),
        samples,
        settings: settingsRef.current,
        score,
      });
      setSharing(false);
      if (!created) {
        setShareError(text.shareFailed);
        return;
      }
      const settingsLine = text.settingsNamed(settingsNickname(settingsRef.current, lang));
      const challengeText = text.shareChallenge(
        text.difficulties[difficultyState],
        formatTime(timeRef.current),
        settingsLine,
        score,
      );
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

    const solvedDifficulty = difficultyState || boardNow?.difficulty;
    const solvedText = text.shareSolved(
      solvedDifficulty ? text.difficulties[solvedDifficulty] : '',
      formatTime(time),
      settledScore(solvedDifficulty, marksRef.current),
    );
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

  const handleDropInChat = () => {
    offerDropInChat(difficultyState ?? '');
  };

  const handleReset = () => {
    paceRef.current = [];
    forgetMoves();
    setBoard(current => current ? { ...current, cells: current.cells.map(resetProgress) } : current);
    setGameState('playing');
  };

  const startChallenge = async (launch: DailyChallenge) => {
    setIsLoading(true);
    paceRef.current = [];
    forgetMoves();
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
    forgetMoves();
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
    forgetMoves();
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
      const race = await fetchMatchState(settingsRef.current);
      if (!race) throw new Error('The shared puzzle is unavailable');
      const puzzle = await loadLevelPuzzle(race.difficulty, race.level);
      if (race.settings) setSettings(race.settings);
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
    forgetMoves();
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
  const chartRival = ghost ?? groupLeader ?? matchLeader;
  const difficultyName = difficultyState ? text.difficulties[difficultyState] : null;

  return (
    <div className={`${styles.gameWrapper} game-shell`}>
      <div className={`${styles.gameHeader} game-header`}>
        <div className={styles.title}>
          <span className={styles.difficulty}>
            {text.gameTitle(difficultyName)}
          </span>
          <span className={styles.timer} aria-label={text.timeTitle(formatTime(time))}>
            <ClockIcon />
            <span aria-hidden="true">{formatTime(time)}</span>
          </span>
          {settings.countMistakes && activeBoard && (
            <span className={styles.mistakes} aria-label={text.mistakes(mistakes)}>
              <AlertIcon />
              <span aria-hidden="true">{mistakes}</span>
            </span>
          )}
          {activeBoard && (
            <span className={styles.score} aria-label={text.score(shownTotal(marks))}>
              <StarIcon />
              <span aria-hidden="true">{shownTotal(marks)}</span>
              {award && (
                <span key={award.key} className={styles.scorePop} aria-hidden="true">+{award.stake}</span>
              )}
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setIsSettingsOpen(true)}
          aria-label={text.settings}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" fillRule="evenodd" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z" />
          </svg>
        </button>
      </div>

      {closedChallenge && (
        <p className={styles.notice}>{text.challengeClosed}</p>
      )}
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
          <div className={styles.actions}>
            {(gameState !== 'selectDifficulty' || activeBoard) && (
              <div className={styles.playRow}>
                {gameState !== 'selectDifficulty' && (
                  <Pill primary onClick={handleNewGame}>
                    {text.newGame}
                  </Pill>
                )}
                {activeBoard && settings.undoMoves && (
                  <Pill className={styles.iconPill} aria-label={text.undo} onClick={handleUndo} disabled={undoCount === 0}>
                    <UndoIcon />
                  </Pill>
                )}
                {activeBoard && (
                  <Pill className={styles.iconPill} aria-label={text.reset} onClick={handleReset}>
                    <ResetIcon />
                  </Pill>
                )}
                {showDropInChat && activeBoard && (
                  <Pill className={styles.iconPill} aria-label={text.dropInChat} onClick={handleDropInChat}>
                    <SendIcon />
                  </Pill>
                )}
              </div>
            )}

            {showDropInChat && gameState === 'selectDifficulty' && !activeBoard && (
              <Pill onClick={handleDropInChat}>{text.dropInChat}</Pill>
            )}

            {gameState === 'won' && (
              <Pill onClick={() => void handleShare()} disabled={sharing}>
                {sharing ? text.sending : canChallenge(activeBoard) ? text.challengeFriend : text.shareResult}
              </Pill>
            )}
            {shareError && <p className={styles.errorText}>{shareError}</p>}

            {(homeScreen === 'missed' || homeScreen === 'unknown') && (
              <Pill onClick={() => telegramWebApp()?.addToHomeScreen?.()}>
                {text.addHome}
              </Pill>
            )}

            {gameState === 'selectDifficulty' && (
              Object.values(SudokuGuruDifficulty).map(difficulty => (
                <Pill key={difficulty} onClick={() => handleStartGame(difficulty)}>
                  {text.difficulties[difficulty]}
                </Pill>
              ))
            )}

            {gameState === 'error' && (
              <>
                <p className={styles.errorText}>{text.loadFailed}</p>
                <Pill
                  onClick={() => {
                    if (difficultyState) void handleStartGame(difficultyState);
                  }}
                  disabled={!difficultyState}
                >
                  {text.tryAgain}
                </Pill>
              </>
            )}
          </div>

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
          {gameState === 'won' && activeBoard && (
            <ResultChart
              you={{
                name: text.you,
                samples: appendPace(paceRef.current, time, cellsLeft(activeBoard.cells)),
                total: cellsToFill(activeBoard.cells),
                seconds: time,
              }}
              rival={chartRival && {
                name: chartRival.name,
                samples: chartRival.samples,
                total: chartRival.total,
                seconds: chartRival.seconds,
              }}
              marks={marks}
              digitsLabel={text.digitsOverTime}
              pointsLabel={text.pointsOverTime}
              summary={text.scoreResult(
                shownTotal(marks),
                missedStake(marks),
                difficultyMultiplier(activeBoard.difficulty),
                finalScore(marks, activeBoard.difficulty),
              )}
            />
          )}
        </>
      )}

      {pendingLeave && (
        <div className={`${styles.scrim} ${styles.confirmScrim}`} onMouseDown={() => setPendingLeave(null)}>
          <div
            className={styles.confirm}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="drop-challenge-title"
            onMouseDown={event => event.stopPropagation()}
          >
            <h2 id="drop-challenge-title" className={styles.confirmTitle}>{text.dropChallengeTitle}</h2>
            <p className={styles.notice}>{text.dropChallenge}</p>
            <div className={styles.actions}>
              <Pill primary onClick={confirmPending}>{text.failChallenge}</Pill>
              <Pill onClick={() => setPendingLeave(null)}>{text.keepChallenge}</Pill>
            </div>
          </div>
        </div>
      )}
      {isSettingsOpen && (
        <div className={styles.scrim} onMouseDown={() => setIsSettingsOpen(false)}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label={text.settings}
            onMouseDown={event => event.stopPropagation()}
          >
            <GameSettings
              settings={settings}
              onSettingChange={handleSettingChange}
              onApply={handleSettingsApply}
              onClose={() => setIsSettingsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function sameSettings(left: GameSettingsType, right: GameSettingsType): boolean {
  return (Object.keys(left) as (keyof GameSettingsType)[]).every(key => left[key] === right[key]);
}

type PendingLeave = { kind: 'settings'; next: GameSettingsType } | { kind: 'newGame' } | null;

function Pill({
  primary = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  const tone = primary ? styles.pillPrimary : styles.pillSecondary;
  return <button type="button" className={className ? `${styles.pill} ${tone} ${className}` : `${styles.pill} ${tone}`} {...props} />;
}

interface PlayedMove {
  index: number;
  cell: SudokuCell;
  mistake: boolean;
  scored: boolean;
}

function settledScore(difficulty: SudokuGuruDifficulty | '' | undefined, marks: readonly ScoreMark[]): number {
  if (!difficulty) return 0;
  return finalScore(marks, difficulty);
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

function UndoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.75-13h-1.5v6.1l4.7 2.8.75-1.25-3.95-2.35V7z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm-1 5h2v8h-2V7zm0 10h2v2h-2v-2z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2.6l2.47 5.9 6.43.55-4.9 4.2 1.5 6.25L12 16.4l-5.5 3.1 1.5-6.25-4.9-4.2 6.43-.55L12 2.6z" />
    </svg>
  );
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
