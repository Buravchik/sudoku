import { PaceSample, paceAt } from '@/sudoku/pace';
import { ScoreMark } from '@/sudoku/score';
import styles from './ResultChart.module.css';

interface PaceLine {
  name: string;
  samples: readonly PaceSample[];
  total: number;
  seconds: number;
}

interface ResultChartProps {
  you: PaceLine;
  rival: PaceLine | null;
  marks: readonly ScoreMark[];
  digitsLabel: string;
  pointsLabel: string;
  summary: string;
}

const WIDTH = 320;
const HEIGHT = 88;

export default function ResultChart({ you, rival, marks, digitsLabel, pointsLabel, summary }: ResultChartProps) {
  const end = Math.max(you.seconds, rival?.seconds ?? 0, 1);
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.caption}>{digitsLabel}</figcaption>
      <svg className={styles.plot} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={digitsLabel}>
        <polyline className={styles.you} points={pacePoints(you, end)} />
        {rival && <polyline className={styles.rival} points={pacePoints(rival, end)} />}
      </svg>
      <p className={styles.legend}>
        <span className={styles.youKey}>{you.name}</span>
        {rival && <span className={styles.rivalKey}>{rival.name}</span>}
      </p>
      <figcaption className={styles.caption}>{pointsLabel}</figcaption>
      <svg className={styles.plot} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={pointsLabel}>
        <polyline className={styles.you} points={pointMarks(marks, end)} />
      </svg>
      <p className={styles.summary}>{summary}</p>
    </figure>
  );
}

function pacePoints(line: PaceLine, end: number): string {
  const samples = line.samples.length > 0 ? line.samples : [{ t: 0, left: line.total }];
  const spots = [spot(0, line.total, line.total, end)];
  for (const sample of samples) spots.push(spot(sample.t, sample.left, line.total, end));
  const finish = paceAt(samples, line.seconds, line.total);
  spots.push(spot(line.seconds, finish.left, line.total, end));
  return spots.join(' ');
}

function pointMarks(marks: readonly ScoreMark[], end: number): string {
  const peak = Math.max(1, marks.reduce((sum, mark) => sum + mark.stake, 0));
  let sum = 0;
  const spots = [valueSpot(0, 0, peak, end)];
  for (const mark of marks) {
    sum += mark.stake;
    spots.push(valueSpot(mark.t, sum, peak, end));
  }
  return spots.join(' ');
}

function spot(t: number, left: number, total: number, end: number): string {
  const filled = total <= 0 ? 1 : Math.min(1, Math.max(0, (total - left) / total));
  return valueSpot(t, filled, 1, end);
}

function valueSpot(t: number, value: number, peak: number, end: number): string {
  const x = (Math.max(0, Math.min(end, t)) / end) * (WIDTH - 8) + 4;
  const y = HEIGHT - 6 - (Math.max(0, value) / peak) * (HEIGHT - 16);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}
