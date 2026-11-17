export interface PaceSample {
  t: number;
  left: number;
}

const MAX_SAMPLES = 300;

export function cellsLeft(cells: readonly { initialValue: number; userValue: number }[]): number {
  return cells.reduce((count, cell) => count + (cell.initialValue === 0 && cell.userValue === 0 ? 1 : 0), 0);
}

export function cellsToFill(cells: readonly { initialValue: number }[]): number {
  return cells.reduce((count, cell) => count + (cell.initialValue === 0 ? 1 : 0), 0);
}

export function appendPace(samples: readonly PaceSample[], t: number, left: number): PaceSample[] {
  const time = Math.max(0, Math.floor(t));
  const remaining = Math.max(0, Math.floor(left));
  const last = samples[samples.length - 1];
  if (!last) return [{ t: time, left: remaining }];
  if (time < last.t) return samples.slice();
  if (time === last.t) {
    if (last.left === remaining) return samples.slice();
    return [...samples.slice(0, -1), { t: time, left: remaining }];
  }
  if (last.left === remaining) return samples.slice();
  return compactPace([...samples, { t: time, left: remaining }]);
}

export function compactPaceForSend(samples: readonly PaceSample[]): PaceSample[] {
  return compactPace(samples.map(sample => ({ t: sample.t, left: sample.left })));
}

export function paceAt(samples: readonly PaceSample[], t: number, total: number): PaceSample {
  const time = Math.max(0, Math.floor(t));
  if (samples.length === 0 || time < samples[0].t) return { t: time, left: total };
  let current = samples[0];
  for (const sample of samples) {
    if (sample.t > time) break;
    current = sample;
  }
  return current;
}

export function pacePercent(total: number, left: number): number {
  if (total <= 0) return 100;
  const done = Math.min(total, Math.max(0, total - left));
  return Math.round((done / total) * 100);
}

export function sanitizePace(value: unknown, total: number, seconds: number): PaceSample[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SAMPLES) return null;
  const samples: PaceSample[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const record = item as { t?: unknown; left?: unknown };
    if (typeof record.t !== 'number' || typeof record.left !== 'number') return null;
    if (!Number.isInteger(record.t) || !Number.isInteger(record.left)) return null;
    if (record.t < 0 || record.t > seconds || record.left < 0 || record.left > total) return null;
    const last = samples[samples.length - 1];
    if (last && record.t < last.t) return null;
    if (last && last.t === record.t && last.left === record.left) continue;
    samples.push({ t: record.t, left: record.left });
  }
  return samples.length > 0 ? samples : null;
}

export function restorePace(value: unknown): PaceSample[] {
  const samples = sanitizePace(value, 81, 24 * 60 * 60);
  return samples ?? [];
}

function compactPace(samples: PaceSample[]): PaceSample[] {
  if (samples.length <= MAX_SAMPLES) return samples;
  const next = [samples[0]];
  const last = samples[samples.length - 1];
  const room = MAX_SAMPLES - 2;
  const span = samples.length - 2;
  for (let index = 1; index <= room; index++) {
    next.push(samples[Math.round((index * span) / (room + 1))]);
  }
  next.push(last);
  return next;
}
