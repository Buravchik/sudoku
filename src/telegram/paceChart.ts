import { deflateSync } from 'zlib';
import { PaceSample, paceAt } from '@/sudoku/pace';

export interface ChartPerson {
  name: string;
  seconds: number;
  total: number;
  samples: readonly PaceSample[];
  score?: number;
  done: boolean;
}

const LINE_COLORS: Array<[number, number, number]> = [
  [103, 80, 164],
  [140, 80, 0],
  [0, 106, 106],
  [179, 38, 30],
  [63, 81, 181],
  [56, 106, 32],
  [125, 82, 96],
  [0, 92, 187],
];

const GLYPHS = [
  ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
  ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  ['01110', '10001', '10001', '01111', '00001', '00010', '11100'],
];

const WIDTH = 800;
const HEIGHT = 420;
const PLOT = { left: 52, top: 24, right: 776, bottom: 328 };

export function chartKey(people: readonly ChartPerson[]): string {
  return people.map(person => (
    `${person.name}:${person.seconds}:${person.samples.at(-1)?.left ?? ''}:${person.score ?? ''}:${person.done ? 1 : 0}`
  )).join('|');
}

export function chartState(people: readonly ChartPerson[]): string {
  const pool = people.slice(0, 8);
  const end = Math.max(1, ...pool.map(person => person.seconds));
  for (let count = pool.length; count >= 0; count -= 1) {
    for (const nameLength of [18, 10, 6]) {
      for (const steps of [12, 8, 4]) {
        const text = JSON.stringify({
          e: end,
          p: pool.slice(0, count).map(person => ({
            n: person.name.slice(0, nameLength),
            m: clock(person.seconds),
            ...(person.score === undefined ? {} : { s: person.score }),
            g: series(person, end, steps),
          })),
        });
        if (Buffer.byteLength(text) <= 1024) return text;
      }
    }
  }
  return JSON.stringify({ e: 1, p: [] });
}

export function chartPng(people: readonly ChartPerson[]): Buffer {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  fill(rgba, 246, 243, 238);
  const shown = people.slice(0, 8);
  const end = Math.max(1, ...shown.map(person => person.seconds));
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const y = PLOT.bottom - fraction * (PLOT.bottom - PLOT.top);
    hline(rgba, PLOT.left, PLOT.right, y, [226, 220, 210]);
  }
  drawLabel(rgba, '100', 8, PLOT.top - 6, [120, 112, 102]);
  drawLabel(rgba, '50', 16, (PLOT.top + PLOT.bottom) / 2 - 6, [120, 112, 102]);
  drawLabel(rgba, '0', 24, PLOT.bottom - 6, [120, 112, 102]);
  shown.forEach((person, index) => {
    const color = LINE_COLORS[index % LINE_COLORS.length];
    let previous: [number, number] | null = null;
    for (let step = 0; step <= 48; step += 1) {
      const t = (end * step) / 48;
      const at = Math.min(t, person.seconds);
      const left = person.total < 1 ? 0 : paceAt(person.samples, at, person.total).left;
      const filled = person.total < 1 ? 1 : Math.min(1, Math.max(0, (person.total - left) / person.total));
      const point: [number, number] = [
        PLOT.left + (t / end) * (PLOT.right - PLOT.left),
        PLOT.bottom - filled * (PLOT.bottom - PLOT.top),
      ];
      if (previous) stroke(rgba, previous[0], previous[1], point[0], point[1], color);
      previous = point;
    }
    const legendX = 52 + (index % 4) * 180;
    const legendY = 356 + Math.floor(index / 4) * 28;
    hline(rgba, legendX, legendX + 22, legendY + 8, color);
    drawLabel(rgba, String(index + 1), legendX + 28, legendY, color);
  });
  return encodePng(WIDTH, HEIGHT, rgba);
}

function series(person: ChartPerson, end: number, steps: number): number[] {
  const values: number[] = [];
  for (let index = 0; index < steps; index += 1) {
    const t = steps === 1 ? end : (end * index) / (steps - 1);
    const at = Math.min(t, person.seconds);
    const left = person.total < 1 ? 0 : paceAt(person.samples, at, person.total).left;
    const filled = person.total < 1 ? 100 : Math.round(((person.total - left) / person.total) * 100);
    values.push(Math.max(0, Math.min(100, filled)));
  }
  return values;
}

function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function fill(rgba: Uint8Array, red: number, green: number, blue: number): void {
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = red;
    rgba[index + 1] = green;
    rgba[index + 2] = blue;
    rgba[index + 3] = 255;
  }
}

function hline(rgba: Uint8Array, x0: number, x1: number, y: number, color: [number, number, number]): void {
  const row = Math.round(y);
  for (let x = Math.round(x0); x <= Math.round(x1); x += 1) set(rgba, x, row, color);
}

function stroke(
  rgba: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number],
): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const targetX = Math.round(x1);
  const targetY = Math.round(y1);
  const dx = Math.abs(targetX - x);
  const dy = Math.abs(targetY - y);
  const sx = x < targetX ? 1 : -1;
  const sy = y < targetY ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    dot(rgba, x, y, color);
    if (x === targetX && y === targetY) break;
    const doubled = err * 2;
    if (doubled > -dy) {
      err -= dy;
      x += sx;
    }
    if (doubled < dx) {
      err += dx;
      y += sy;
    }
  }
}

function dot(rgba: Uint8Array, x: number, y: number, color: [number, number, number]): void {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) set(rgba, x + dx, y + dy, color);
  }
}

function set(rgba: Uint8Array, x: number, y: number, color: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const index = (y * WIDTH + x) * 4;
  rgba[index] = color[0];
  rgba[index + 1] = color[1];
  rgba[index + 2] = color[2];
  rgba[index + 3] = 255;
}

function drawLabel(rgba: Uint8Array, text: string, x: number, y: number, color: [number, number, number]): void {
  let cursor = x;
  for (const char of text) {
    const glyph = GLYPHS[Number(char)];
    if (!glyph) continue;
    glyph.forEach((row, rowIndex) => {
      for (let column = 0; column < row.length; column += 1) {
        if (row[column] !== '1') continue;
        set(rgba, cursor + column * 2, Math.round(y) + rowIndex * 2, color);
        set(rgba, cursor + column * 2 + 1, Math.round(y) + rowIndex * 2, color);
        set(rgba, cursor + column * 2, Math.round(y) + rowIndex * 2 + 1, color);
        set(rgba, cursor + column * 2 + 1, Math.round(y) + rowIndex * 2 + 1, color);
      }
    });
    cursor += 12;
  }
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (width * 4 + 1);
    raw[offset] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, offset + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[index] = value >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function crc32(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
