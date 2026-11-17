export async function submitGroupScore(seconds: number): Promise<{ place: number; improved: boolean } | null> {
  const url = process.env.NEXT_PUBLIC_SCORE_URL;
  const initData = window.Telegram?.WebApp?.initData;
  if (!url || !initData) return null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, seconds }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; place?: number; improved?: boolean };
    if (!payload.ok || typeof payload.place !== 'number' || typeof payload.improved !== 'boolean') return null;
    return { place: payload.place, improved: payload.improved };
  } catch (error) {
    console.error('Failed to submit the chat score.', error);
    return null;
  }
}
