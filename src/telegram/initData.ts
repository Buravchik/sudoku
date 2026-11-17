import { createHmac, timingSafeEqual } from 'crypto';
import { Lang, langFrom } from '@/i18n';

const MAX_AGE_SECONDS = 60 * 60 * 48;

export interface SignedInitData {
  startParam: string;
  chatType: string;
  userId: number;
  name: string;
  lang: Lang;
}

export function readSignedInitData(initData: string, botToken: string): SignedInitData | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!hash || !/^[0-9a-f]+$/i.test(hash)) return null;
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') pairs.push(`${key}=${value}`);
  });
  pairs.sort();

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const check = createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  const actual = Buffer.from(check, 'hex');
  const expected = Buffer.from(hash, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  const startParam = params.get('start_param') ?? '';
  const chatType = params.get('chat_type') ?? '';
  const user = parseUser(params.get('user'));
  if (!user) return null;
  return { startParam, chatType, userId: user.id, name: user.name, lang: user.lang };
}

function parseUser(raw: string | null): { id: number; name: string; lang: Lang } | null {
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as { id?: unknown; first_name?: unknown; last_name?: unknown; language_code?: unknown };
    if (typeof user.id !== 'number' || !Number.isFinite(user.id)) return null;
    const lang = langFrom(typeof user.language_code === 'string' ? user.language_code : '');
    const parts = [user.first_name, user.last_name].filter((part): part is string => typeof part === 'string');
    const name = parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 32);
    return { id: user.id, name: name || (lang === 'ru' ? 'Игрок' : 'Player'), lang };
  } catch {
    return null;
  }
}
