import { GameSettingsType } from '@/types';
import styles from './SettingDemo.module.css';

export default function SettingDemo({ setting }: { setting: keyof GameSettingsType }) {
  if (setting === 'hideImpossibleValuesInSelector') return <DigitPad pencil={false} />;
  if (setting === 'hideImpossibleValuesInHints') return <DigitPad pencil />;
  if (setting === 'undoMoves') return <UndoDemo />;
  if (setting === 'countMistakes') return <MistakeDemo />;
  return <MiniBoard {...scene(setting)} />;
}

function MiniBoard({
  selected,
  wash,
  tone,
  texts,
  hints,
}: {
  selected: number;
  wash: number[];
  tone: 'highlight' | 'obvious' | 'conflict';
  texts: Record<number, string>;
  hints?: Record<number, string>;
}) {
  const lit = new Set(wash);
  return (
    <span className={styles.board} aria-hidden="true">
      {Array.from({ length: 81 }, (_, index) => {
        const classes = [styles.cell];
        if (index === selected) classes.push(styles.selected);
        if (lit.has(index)) classes.push(tone === 'obvious' ? styles.obvious : tone === 'conflict' ? styles.conflict : styles.wash);
        const hint = hints?.[index];
        return (
          <span key={index} className={classes.join(' ')}>
            {hint ? <span className={styles.hint}>{hint}</span> : texts[index] ?? ''}
          </span>
        );
      })}
    </span>
  );
}

function DigitPad({ pencil }: { pencil: boolean }) {
  return (
    <span className={pencil ? `${styles.pad} ${styles.pencilPad}` : styles.pad} aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={index === 4 ? styles.keep : styles.fadeDigit}>{index + 1}</span>
      ))}
    </span>
  );
}

function UndoDemo() {
  return (
    <span className={styles.board} aria-hidden="true">
      {Array.from({ length: 81 }, (_, index) => (
        <span key={index} className={index === 40 ? `${styles.cell} ${styles.selected} ${styles.undoDigit}` : styles.cell}>
          {index === 40 ? '5' : ''}
        </span>
      ))}
    </span>
  );
}

function MistakeDemo() {
  return (
    <span className={styles.mistake} aria-hidden="true">
      <span className={styles.mistakeDigit}>5</span>
      <span className={styles.counter}>
        <span className={styles.countFrom}>0</span>
        <span className={styles.countTo}>1</span>
      </span>
    </span>
  );
}

function scene(setting: keyof GameSettingsType): {
  selected: number;
  wash: number[];
  tone: 'highlight' | 'obvious' | 'conflict';
  texts: Record<number, string>;
  hints?: Record<number, string>;
} {
  const fives = [10, 40, 70];
  if (setting === 'highlightRowAndColumn') {
    return { selected: 40, wash: line(40), tone: 'highlight', texts: {} };
  }
  if (setting === 'highlightSameNumbers') {
    return { selected: 40, wash: [10, 70], tone: 'highlight', texts: textAt(fives, '5') };
  }
  if (setting === 'highlightSameHints') {
    return { selected: 20, wash: [2, 60], tone: 'highlight', texts: {}, hints: textAt([2, 20, 60], '5') };
  }
  if (setting === 'highlightCrossForNumbers') {
    return { selected: 40, wash: unique(fives.flatMap(line)), tone: 'highlight', texts: textAt(fives, '5') };
  }
  if (setting === 'highlightCrossForHints') {
    const spots = [2, 20, 60];
    return { selected: 20, wash: unique(spots.flatMap(line)), tone: 'highlight', texts: {}, hints: textAt(spots, '5') };
  }
  if (setting === 'highlightCurrentQuadrant') {
    return { selected: 40, wash: block(40), tone: 'highlight', texts: {} };
  }
  if (setting === 'highlightQuadrantsWithSameNumber') {
    return { selected: 40, wash: unique([10, 70].flatMap(block)), tone: 'highlight', texts: textAt(fives, '5') };
  }
  if (setting === 'highlightAllObviousCells') {
    return { selected: 40, wash: [16, 64], tone: 'obvious', texts: textAt([10, 30, 50, 70], '4') };
  }
  if (setting === 'highlightObviousCellsForCurrentNumber') {
    return { selected: 40, wash: [16], tone: 'obvious', texts: textAt([10, 40, 70], '5') };
  }
  return { selected: 40, wash: [40], tone: 'conflict', texts: { 40: '5' } };
}

function line(index: number): number[] {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const cells: number[] = [];
  for (let offset = 0; offset < 9; offset++) cells.push(row * 9 + offset, offset * 9 + col);
  return cells;
}

function block(index: number): number[] {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const rowStart = row - (row % 3);
  const colStart = col - (col % 3);
  const cells: number[] = [];
  for (let rowOffset = 0; rowOffset < 3; rowOffset++) {
    for (let colOffset = 0; colOffset < 3; colOffset++) cells.push((rowStart + rowOffset) * 9 + colStart + colOffset);
  }
  return cells;
}

function textAt(indexes: number[], value: string): Record<number, string> {
  return Object.fromEntries(indexes.map(index => [index, value]));
}

function unique(indexes: number[]): number[] {
  return [...new Set(indexes)];
}
