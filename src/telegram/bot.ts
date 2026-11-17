import http from 'http';
import { Telegraf } from 'telegraf';
import { version } from '../../package.json';
import { parseDifficultyArg, parseStartParam } from '@/sudoku/daily';
import { SudokuGuruDifficulty } from '@/sudoku/types';
import { playLink, renderCard, formatSeconds } from './cardText';
import { welcomeWidgetHtml } from './welcomeWidget';
import { readSignedInitData } from './initData';
import { ChallengeCard, findTodayCard, recordScore, touchProgress, withRecords } from './records';
import { acceptDuel, readDuel, recordDuelResult, saveDuel, toGhost } from './duels';

const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

const bot = new Telegraf(token);
const webAppUrl = process.env.TELEGRAM_WEBAPP_URL || `https://buravchik.github.io/sudoku/?v=${version}`;
const webhookMode = process.env.RECORDS_BACKEND === 'firestore';
const miniAppShortName = process.env.TELEGRAM_MINI_APP_SHORT_NAME?.trim() || undefined;
const scorePort = Number(process.env.PORT || 8080);

let username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '').trim() || '';

bot.start(async (ctx) => {
  if (!ctx.chat) return;
  if (isGroup(ctx.chat.type)) {
    await publishCard(ctx.chat.id, SudokuGuruDifficulty.easy);
    return;
  }

  const replyMarkup = {
    inline_keyboard: [[
      { text: 'Play Sudoku', web_app: { url: webAppUrl } },
    ]],
  };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendWidget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ctx.chat.id,
        html: welcomeWidgetHtml(),
        caption: 'Welcome to Sudoku',
        reply_markup: replyMarkup,
      }),
    });
    const payload = await response.json() as { ok: boolean; description?: string };
    if (!payload.ok) {
      throw new Error(payload.description ?? 'sendWidget failed');
    }
  } catch (error) {
    console.error('Widget was not sent, falling back to a text message.', error);
    await ctx.reply('Welcome to Sudoku!', { reply_markup: replyMarkup });
  }
});

bot.command('sudoku', async (ctx) => {
  if (!ctx.chat || !isGroup(ctx.chat.type)) {
    await ctx.reply('В группе эта команда открывает сегодняшнюю сетку и рекорды чата.');
    return;
  }
  const difficulty = parseDifficultyArg(commandArgument(ctx.message.text));
  if (!difficulty) {
    await ctx.reply('Сложность: easy, medium, hard, expert или guru.');
    return;
  }
  await publishCard(ctx.chat.id, difficulty);
});

bot.command('top', async (ctx) => {
  if (!ctx.chat || !isGroup(ctx.chat.type)) return;
  const difficulty = parseDifficultyArg(commandArgument(ctx.message.text));
  if (!difficulty) {
    await ctx.reply('Сложность: easy, medium, hard, expert или guru.');
    return;
  }
  await publishCard(ctx.chat.id, difficulty);
});

async function publishCommands(): Promise<void> {
  if (!username) username = (await bot.telegram.getMe()).username;
  await bot.telegram.setMyCommands(
    [{ command: 'start', description: 'Play Sudoku' }],
    { scope: { type: 'all_private_chats' } },
  );
  await bot.telegram.setMyCommands(
    [
      { command: 'sudoku', description: 'Сегодняшняя сетка и рекорды чата' },
      { command: 'top', description: 'Рекорды чата за сегодня' },
    ],
    { scope: { type: 'all_group_chats' } },
  );
}

if (webhookMode) {
  publishCommands().catch(error => console.error('Failed to publish bot commands.', error));
} else {
  bot.launch().then(() => {
    console.log('Bot is running');
    return publishCommands();
  }).catch(error => console.error('Failed to publish bot commands.', error));
}

const scoreServer = startScoreServer();

function stopProcess(signal: 'SIGINT' | 'SIGTERM'): void {
  scoreServer.close(() => process.exit(0));
  if (!webhookMode) bot.stop(signal);
}

process.once('SIGINT', () => stopProcess('SIGINT'));
process.once('SIGTERM', () => stopProcess('SIGTERM'));

function commandArgument(text: string | undefined): string | undefined {
  return text?.trim().split(/\s+/)[1];
}

function isGroup(type: string): boolean {
  return type === 'group' || type === 'supergroup';
}

async function publishCard(chatId: number, difficulty: SudokuGuruDifficulty): Promise<void> {
  const botUsername = await ensureUsername();
  await withRecords(async (file) => {
    const card = findTodayCard(file, chatId, difficulty);
    const record = file.chats[String(chatId)]?.records?.[difficulty] ?? null;
    const extra = {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Играть', url: playLink(botUsername, miniAppShortName, card) },
        ]],
      },
      link_preview_options: { is_disabled: true },
    };
    const text = renderCard(card, record);
    if (card.messageId) {
      try {
        await bot.telegram.editMessageText(chatId, card.messageId, undefined, text, extra);
        return;
      } catch (error) {
        if (isNotModified(error)) return;
        console.error('Card edit failed, sending a new one.', error);
      }
    }
    const message = await bot.telegram.sendMessage(chatId, text, extra);
    card.messageId = message.message_id;
  });
}

async function ensureUsername(): Promise<string> {
  if (!username) username = (await bot.telegram.getMe()).username;
  return username;
}

function startScoreServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const path = req.url?.split('?')[0];
    if (req.method === 'GET' && (path === '/' || path === '/health')) {
      res.writeHead(200);
      res.end('ok');
      return;
    }
    if (req.method === 'POST' && path === '/telegram') {
      await handleTelegram(req, res);
      return;
    }
    if (req.method === 'POST' && path === '/duel') {
      await handleDuelCreate(req, res);
      return;
    }
    if (req.method === 'POST' && path === '/duel/result') {
      await handleDuelResult(req, res);
      return;
    }
    if (req.method === 'GET' && path?.startsWith('/duel/')) {
      await handleDuelRead(path.slice('/duel/'.length), res);
      return;
    }
    if (req.method === 'POST' && path === '/progress') {
      await handleProgress(req, res);
      return;
    }
    if (req.method !== 'POST' || path !== '/score') {
      res.writeHead(404);
      res.end();
      return;
    }

    try {
      const body = await readJson(req) as { initData?: unknown; seconds?: unknown; total?: unknown; samples?: unknown };
      const initData = typeof body.initData === 'string' ? body.initData : '';
      const seconds = body.seconds;
      const signed = readSignedInitData(initData, token);
      const challenge = signed ? parseStartParam(signed.startParam) : null;
      if (!signed || !challenge || (signed.chatType !== 'group' && signed.chatType !== 'supergroup')) {
        sendJson(res, 401, { ok: false });
        return;
      }
      if (typeof seconds !== 'number') {
        sendJson(res, 400, { ok: false });
        return;
      }

      const update = await withRecords(file => recordScore(
        file,
        challenge,
        signed.userId,
        signed.name,
        Math.floor(seconds),
        { total: typeof body.total === 'number' ? body.total : -1, samples: body.samples },
      ));
      if (!update.ok) {
        sendJson(res, 400, { ok: false });
        return;
      }
      await editCard(update.chatId, update.card, update.record);
      sendJson(res, 200, { ok: true, place: update.place, improved: update.improved });
    } catch (error) {
      console.error('Failed to record a score.', error);
      sendJson(res, 500, { ok: false });
    }
  });

  server.listen(scorePort, () => {
    console.log(`Score endpoint listening on :${scorePort}/score`);
  });
  return server;
}

async function handleProgress(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await readJson(req) as { initData?: unknown; left?: unknown; total?: unknown };
    const initData = typeof body.initData === 'string' ? body.initData : '';
    const signed = readSignedInitData(initData, token);
    const challenge = signed ? parseStartParam(signed.startParam) : null;
    if (!signed || !challenge || (signed.chatType !== 'group' && signed.chatType !== 'supergroup')) {
      sendJson(res, 401, { ok: false });
      return;
    }
    const left = typeof body.left === 'number' ? body.left : -1;
    const total = typeof body.total === 'number' ? body.total : -1;
    const view = await withRecords(file => touchProgress(file, challenge, signed.userId, signed.name, left, total));
    if (!view) {
      sendJson(res, 400, { ok: false });
      return;
    }
    sendJson(res, 200, { ok: true, leader: view.leader, players: view.players });
  } catch (error) {
    console.error('Failed to update the live race.', error);
    sendJson(res, 500, { ok: false });
  }
}

async function editCard(chatId: number, card: ChallengeCard, record: { name: string; seconds: number; day: string } | null): Promise<void> {
  if (!card.messageId) return;
  const botUsername = await ensureUsername();
  try {
    await bot.telegram.editMessageText(chatId, card.messageId, undefined, renderCard(card, record), {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Играть', url: playLink(botUsername, miniAppShortName, card) },
        ]],
      },
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    if (!isNotModified(error)) console.error('Failed to refresh the chat card.', error);
  }
}

function isNotModified(error: unknown): boolean {
  return error instanceof Error && error.message.includes('message is not modified');
}

async function handleTelegram(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const provided = req.headers['x-telegram-bot-api-secret-token'];
  const expected = (process.env.WEBHOOK_SECRET ?? '').trim();
  if (!expected || provided !== expected) {
    res.writeHead(401);
    res.end();
    return;
  }
  try {
    const update = await readJson(req);
    await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]);
    res.writeHead(200);
    res.end('ok');
  } catch (error) {
    console.error('Failed to handle a Telegram update.', error);
    res.writeHead(500);
    res.end();
  }
}

async function handleDuelCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await readJson(req) as {
      initData?: unknown;
      difficulty?: unknown;
      level?: unknown;
      seconds?: unknown;
      total?: unknown;
      samples?: unknown;
      settings?: unknown;
    };
    const initData = typeof body.initData === 'string' ? body.initData : '';
    const signed = readSignedInitData(initData, token);
    if (!signed) {
      sendJson(res, 401, { ok: false });
      return;
    }
    const accepted = acceptDuel({
      userId: signed.userId,
      name: signed.name,
      difficulty: body.difficulty,
      level: typeof body.level === 'number' ? body.level : -1,
      seconds: typeof body.seconds === 'number' ? Math.floor(body.seconds) : -1,
      total: typeof body.total === 'number' ? body.total : -1,
      samples: body.samples,
      settings: body.settings,
    });
    if (!accepted) {
      sendJson(res, 400, { ok: false });
      return;
    }
    const duel = await saveDuel(accepted);
    const botUsername = await ensureUsername();
    const link = `https://t.me/${botUsername}?startapp=d${duel.id}`;
    const messageId = await prepareChallengeMessage(signed.userId, duel, link);
    sendJson(res, 200, { ok: true, id: duel.id, link, messageId });
  } catch (error) {
    console.error('Failed to create a duel.', error);
    sendJson(res, 500, { ok: false });
  }
}

async function handleDuelRead(id: string, res: http.ServerResponse): Promise<void> {
  try {
    const duel = await readDuel(id);
    if (!duel) {
      sendJson(res, 404, { ok: false });
      return;
    }
    sendJson(res, 200, { ok: true, duel: toGhost(duel) });
  } catch (error) {
    console.error('Failed to read a duel.', error);
    sendJson(res, 500, { ok: false });
  }
}

async function handleDuelResult(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await readJson(req) as { initData?: unknown; id?: unknown; seconds?: unknown };
    const initData = typeof body.initData === 'string' ? body.initData : '';
    const signed = readSignedInitData(initData, token);
    const id = typeof body.id === 'string' ? body.id : '';
    const seconds = typeof body.seconds === 'number' ? Math.floor(body.seconds) : -1;
    if (!signed) {
      sendJson(res, 401, { ok: false });
      return;
    }
    const existing = await readDuel(id);
    if (!existing) {
      sendJson(res, 404, { ok: false });
      return;
    }
    const previousBest = existing.bestSeconds;
    await recordDuelResult(id, seconds);
    const beat = seconds < existing.seconds && (previousBest === null || seconds < previousBest);
    if (beat && signed.userId !== existing.userId) {
      const text = `${signed.name} прошёл твой уровень ${existing.difficulty} за ${formatSeconds(seconds)}. Твоё время — ${formatSeconds(existing.seconds)}.`;
      await bot.telegram.sendMessage(existing.userId, text).catch(error => {
        console.error('Failed to tell the challenger about the result.', error);
      });
    }
    sendJson(res, 200, { ok: true, beat });
  } catch (error) {
    console.error('Failed to record a duel result.', error);
    sendJson(res, 500, { ok: false });
  }
}

async function prepareChallengeMessage(userId: number, duel: { id: string; name: string; difficulty: string; seconds: number }, link: string): Promise<string | null> {
  const text = [
    `Судоку · ${duel.difficulty}`,
    `${duel.name} — ${formatSeconds(duel.seconds)}`,
    'Тот же уровень и те же настройки. На твоей секунде видно, сколько цифр оставалось у меня.',
  ].join('\n');
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/savePreparedInlineMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        allow_user_chats: true,
        allow_group_chats: true,
        result: {
          type: 'article',
          id: duel.id,
          title: `${duel.name} · ${duel.difficulty} · ${formatSeconds(duel.seconds)}`,
          description: 'Тот же уровень, настройки и темп',
          input_message_content: { message_text: text },
          reply_markup: {
            inline_keyboard: [[{ text: 'Играть', url: link }]],
          },
        },
      }),
    });
    const payload = await response.json() as { ok?: boolean; result?: { id?: string }; description?: string };
    if (!payload.ok || !payload.result?.id) {
      console.error('Failed to prepare the challenge message.', payload.description);
      return null;
    }
    return payload.result.id;
  } catch (error) {
    console.error('Failed to prepare the challenge message.', error);
    return null;
  }
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 262_144) {
        reject(new Error('Score request is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
