export function parseMatchId(value: string | null | undefined): string | null {
  const match = /^i([a-f0-9]{16})$/.exec(value ?? '');
  return match ? match[1] : null;
}
