import { SudokuGuruDifficulty } from '@/sudoku/types';
import { GameSettingsType } from '@/types';

export type Lang = 'en' | 'ru';

export function langFrom(code: string | null | undefined): Lang {
  return (code ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function cardLang(lang: string | undefined): Lang {
  return lang === 'en' ? 'en' : 'ru';
}

export interface Copy {
  gameTitle: (difficulty: string | null) => string;
  timeTitle: (time: string) => string;
  settings: string;
  close: string;
  newGame: string;
  reset: string;
  sending: string;
  challengeFriend: string;
  shareResult: string;
  shareFailed: string;
  addHome: string;
  loadFailed: string;
  tryAgain: string;
  loading: string;
  offline: string;
  chatPuzzle: (difficulty: string) => string;
  sharedPuzzle: (difficulty: string) => string;
  solved: (time: string) => string;
  place: (n: number) => string;
  ahead: string;
  behind: string;
  level: string;
  you: string;
  youAt: (time: string) => string;
  rivalAt: (name: string, time: string) => string;
  left: (n: number, percent: number) => string;
  aheadOf: (name: string, delta: string) => string;
  slower: (name: string, delta: string) => string;
  tied: (name: string) => string;
  pencil: string;
  clear: string;
  undo: string;
  mistakes: (n: number) => string;
  score: (n: number) => string;
  scoreResult: (shown: number, missed: number, multiplier: number, final: number) => string;
  digitsOverTime: string;
  pointsOverTime: string;
  shareSolved: (difficulty: string, time: string, score: number) => string;
  shareChallenge: (difficulty: string, time: string, settings: string, score: number) => string;
  difficulties: Record<SudokuGuruDifficulty, string>;
  settingLabels: Record<keyof GameSettingsType, string>;
  months: string[];
  play: string;
  beatRecord: string;
  dropInChat: string;
  nobody: string;
  playing: string;
  joined: string;
  more: (n: number) => string;
  chatRecord: (time: string, name: string, day: string) => string;
  welcome: string;
  groupOnly: string;
  difficultyHint: string;
  inlineDescription: string;
  challengeTitle: (difficulty: string) => string;
  challengeFrom: (name: string, difficulty: string) => string;
  preparedLine: string;
  preparedDescription: string;
  settingsNamed: (name: string) => string;
  adjective: string;
  noun: string;
  combinationName: string;
  beat: (name: string, difficulty: string, theirs: string, yours: string) => string;
  cmdStart: string;
  cmdSudoku: string;
  cmdTop: string;
}

const copy: Record<Lang, Copy> = {
  en: {
    gameTitle: difficulty => difficulty ? `Game - ${difficulty}` : 'Game',
    timeTitle: time => ` - Time: ${time}`,
    settings: 'Settings',
    close: 'Close',
    newGame: 'New Game',
    reset: 'Start from scratch',
    sending: 'Sending challenge...',
    challengeFriend: 'Challenge a friend',
    shareResult: 'Share result',
    shareFailed: 'Could not send the challenge.',
    addHome: 'Add to Home Screen',
    loadFailed: 'Could not load a puzzle.',
    tryAgain: 'Try again',
    loading: 'Loading...',
    offline: 'Online puzzles are unavailable. This round uses an offline puzzle.',
    chatPuzzle: difficulty => `Chat puzzle, ${difficulty}.`,
    sharedPuzzle: difficulty => `Shared puzzle, ${difficulty}.`,
    solved: time => `Solved in ${time}.`,
    place: n => `${ordinal(n)} in the chat today.`,
    ahead: 'Ahead',
    behind: 'Behind',
    level: 'Level',
    you: 'You',
    youAt: time => `You at ${time}`,
    rivalAt: (name, time) => `${name} at ${time}`,
    left: (n, percent) => `${n} left · ${percent}%`,
    aheadOf: (name, delta) => ` Ahead of ${name} by ${delta}.`,
    slower: (name, delta) => ` ${name} was faster by ${delta}.`,
    tied: name => ` Tied with ${name}.`,
    pencil: 'Pencil mode',
    clear: 'Clear',
    undo: 'Undo',
    mistakes: n => `Mistakes: ${n}`,
    score: n => `Score: ${n}`,
    scoreResult: (shown, missed, multiplier, final) => `Along the way ${shown}. Misses −${missed}. Difficulty ×${multiplier}. Final ${final}.`,
    digitsOverTime: 'Digits over time',
    pointsOverTime: 'Points over time',
    shareSolved: (difficulty, time, score) => difficulty
      ? `Sudoku · ${difficulty} · ${time}. Score ${score}.`
      : `Sudoku · ${time}. Score ${score}.`,
    shareChallenge: (difficulty, time, settings, score) => `Sudoku · ${difficulty} · ${time}. Score ${score}. ${settings}. At your second you see how many digits I had left.`,
    difficulties: {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      expert: 'Expert',
      guru: 'Guru',
    },
    settingLabels: {
      highlightRowAndColumn: 'Highlight row and column',
      highlightSameNumbers: 'Highlight the same numbers',
      highlightSameHints: 'Highlight the same pencil marks',
      highlightCrossForNumbers: 'Highlight crosses for the same numbers',
      highlightCrossForHints: 'Highlight crosses for the same pencil marks',
      hideImpossibleValuesInSelector: 'Hide impossible numbers in the selector',
      hideImpossibleValuesInHints: 'Hide impossible pencil marks',
      highlightCurrentQuadrant: 'Highlight the current block',
      highlightQuadrantsWithSameNumber: 'Highlight blocks that contain the same number',
      highlightAllObviousCells: 'Highlight every obvious cell',
      highlightObviousCellsForCurrentNumber: 'Highlight obvious cells for the selected number',
      undoMoves: 'Undo',
      highlightConflicts: 'Highlight conflicts with the solution',
      countMistakes: 'Count mistakes',
    },
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    play: 'Play',
    beatRecord: 'Beat the record',
    dropInChat: 'Drop in a chat',
    nobody: 'No one has finished yet.',
    playing: 'Playing',
    joined: 'Joined',
    more: n => `${n} more`,
    chatRecord: (time, name, day) => `Chat record: ${time} · ${name} · ${day}`,
    welcome: 'Welcome to Sudoku',
    groupOnly: 'In a group this command opens today’s puzzle and the chat records.',
    difficultyHint: 'Difficulty: easy, medium, hard, expert, or guru.',
    inlineDescription: 'One puzzle for everyone. This message keeps the ranking.',
    challengeTitle: difficulty => `Challenge · ${difficulty}`,
    challengeFrom: (name, difficulty) => `Challenge from ${name} · ${difficulty}`,
    preparedLine: 'At your second you see how many digits I had left.',
    preparedDescription: 'Same puzzle, settings, and pace',
    settingsNamed: name => `Settings: ${name}`,
    adjective: 'Adjective',
    noun: 'Noun',
    combinationName: 'Combination name',
    beat: (name, difficulty, theirs, yours) => `${name} solved your ${difficulty} puzzle in ${theirs}. Your time was ${yours}.`,
    cmdStart: 'Play Sudoku',
    cmdSudoku: 'Today’s puzzle and chat records',
    cmdTop: 'Today’s chat records',
  },
  ru: {
    gameTitle: difficulty => difficulty ? `Игра — ${difficulty}` : 'Игра',
    timeTitle: time => ` — время: ${time}`,
    settings: 'Настройки',
    close: 'Закрыть',
    newGame: 'Новая игра',
    reset: 'Сначала',
    sending: 'Отправка вызова...',
    challengeFriend: 'Вызвать друга',
    shareResult: 'Поделиться',
    shareFailed: 'Не удалось отправить вызов.',
    addHome: 'На экран «Домой»',
    loadFailed: 'Не удалось загрузить сетку.',
    tryAgain: 'Ещё раз',
    loading: 'Загрузка...',
    offline: 'Онлайн-сетки недоступны. Этот раунд из запасного набора.',
    chatPuzzle: difficulty => `Сетка чата, ${difficulty}.`,
    sharedPuzzle: difficulty => `Общая сетка, ${difficulty}.`,
    solved: time => `Решено за ${time}.`,
    place: n => `${n}-е место в чате сегодня.`,
    ahead: 'Впереди',
    behind: 'Позади',
    level: 'Наравне',
    you: 'Ты',
    youAt: time => `Ты на ${time}`,
    rivalAt: (name, time) => `${name} на ${time}`,
    left: (n, percent) => `осталось ${n} · ${percent}%`,
    aheadOf: (name, delta) => ` Впереди ${name} на ${delta}.`,
    slower: (name, delta) => ` ${name} быстрее на ${delta}.`,
    tied: name => ` Ничья с ${name}.`,
    pencil: 'Карандаш',
    clear: 'Стереть',
    undo: 'Отменить ход',
    mistakes: n => `Ошибки: ${n}`,
    score: n => `Очки: ${n}`,
    scoreResult: (shown, missed, multiplier, final) => `По ходу ${shown}. Промахи −${missed}. Сложность ×${multiplier}. Итог ${final}.`,
    digitsOverTime: 'Цифры по времени',
    pointsOverTime: 'Очки по времени',
    shareSolved: (difficulty, time, score) => difficulty
      ? `Судоку · ${difficulty} · ${time}. Очки ${score}.`
      : `Судоку · ${time}. Очки ${score}.`,
    shareChallenge: (difficulty, time, settings, score) => `Судоку · ${difficulty} · ${time}. Очки ${score}. ${settings}. На твоей секунде видно, сколько цифр оставалось у меня.`,
    difficulties: {
      easy: 'Лёгкая',
      medium: 'Средняя',
      hard: 'Сложная',
      expert: 'Эксперт',
      guru: 'Гуру',
    },
    settingLabels: {
      highlightRowAndColumn: 'Подсвечивать строку и столбец',
      highlightSameNumbers: 'Подсвечивать такие же цифры',
      highlightSameHints: 'Подсвечивать такие же карандашные пометки',
      highlightCrossForNumbers: 'Кресты для таких же цифр',
      highlightCrossForHints: 'Кресты для таких же пометок',
      hideImpossibleValuesInSelector: 'Скрывать невозможные цифры в выборе',
      hideImpossibleValuesInHints: 'Скрывать невозможные пометки',
      highlightCurrentQuadrant: 'Подсвечивать текущий блок',
      highlightQuadrantsWithSameNumber: 'Подсвечивать блоки с этой цифрой',
      highlightAllObviousCells: 'Подсвечивать все очевидные клетки',
      highlightObviousCellsForCurrentNumber: 'Подсвечивать очевидные клетки для выбранной цифры',
      undoMoves: 'Отмена хода',
      highlightConflicts: 'Подсвечивать конфликт с решением',
      countMistakes: 'Считать ошибки',
    },
    months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    play: 'Играть',
    beatRecord: 'Побить рекорд',
    dropInChat: 'В другой чат',
    nobody: 'Пока никто не решил.',
    playing: 'Играют',
    joined: 'Присоединились',
    more: n => `Ещё ${n}`,
    chatRecord: (time, name, day) => `Рекорд чата: ${time} · ${name} · ${day}`,
    welcome: 'Судоку',
    groupOnly: 'В группе эта команда открывает сегодняшнюю сетку и рекорды чата.',
    difficultyHint: 'Сложность: easy, medium, hard, expert или guru.',
    inlineDescription: 'Одна сетка на всех. Это сообщение само ведёт таблицу.',
    challengeTitle: difficulty => `Вызов · ${difficulty}`,
    challengeFrom: (name, difficulty) => `Вызов от ${name} · ${difficulty}`,
    preparedLine: 'На твоей секунде видно, сколько цифр оставалось у меня.',
    preparedDescription: 'Тот же уровень, настройки и темп',
    settingsNamed: name => `Настройки: ${name}`,
    adjective: 'Прилагательное',
    noun: 'Существительное',
    combinationName: 'Имя набора',
    beat: (name, difficulty, theirs, yours) => `${name} прошёл твой уровень ${difficulty} за ${theirs}. Твоё время — ${yours}.`,
    cmdStart: 'Играть в судоку',
    cmdSudoku: 'Сегодняшняя сетка и рекорды чата',
    cmdTop: 'Рекорды чата за сегодня',
  },
};

export function messages(lang: Lang): Copy {
  return copy[lang];
}

function ordinal(place: number): string {
  const mod100 = place % 100;
  const mod10 = place % 10;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? 'th'
    : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
  return `${place}${suffix}`;
}
