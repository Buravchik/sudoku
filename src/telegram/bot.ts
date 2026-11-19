import http from 'http';
import { Telegraf } from 'telegraf';
import { version } from '../../package.json';
import { cardLang, Lang, langFrom, messages } from '@/i18n';
import { difficultyCode, difficultyFromCode, parseDifficultyArg, parseStartParam, todayKey } from '@/sudoku/daily';
import { parseDuelId } from '@/sudoku/duel';
import { parseMatchId } from '@/sudoku/match';
import { settingsNickname } from '@/sudoku/nicknames';
import { SudokuGuruDifficulty } from '@/sudoku/types';
import { GameSettingsType } from '@/types';
import { playLink, renderCard, renderMatch, formatJoined, formatSeconds } from './cardText';
import { welcomeWidgetHtml } from './welcomeWidget';
import { readSignedInitData } from './initData';
import { ChallengeCard, findTodayCard, recordScore, touchProgress, withRecords } from './records';
import { acceptDuel, bindDuelMessage, DuelGuest, forfeitDuelGuest, noteDuelGuest, readDuel, recordDuelResult, saveDuel, StoredDuel, toGhost } from './duels';
import { noteMatchPlayer, openInlineMatch, readMatch, recordMatchResult, rememberMatchNotice, StoredMatch, toMatchView } from './matches';
import { prefixesFor, readPublic, recordStart, recordWin, toggleListedPin, winFactsFromBody } from './players';
import { bareSettings } from '@/sudoku/achievements';

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
  const text = messages(langFrom(ctx.from?.language_code));
  const openedMatch = parseMatchId(ctx.startPayload ?? '');
  const openedDuel = parseDuelId(ctx.startPayload ?? '');
  if ((openedMatch || openedDuel) && !isGroup(ctx.chat.type)) {
    const match = openedMatch ? await readMatch(openedMatch) : null;
    const duel = openedDuel ? await readDuel(openedDuel) : null;
    const url = new URL(webAppUrl);
    url.searchParams.set('match', openedMatch ? `i${openedMatch}` : `d${openedDuel}`);
    const difficulty = match?.difficulty ?? duel?.difficulty;
    const title = duel
      ? await renderDuelMessage(duel)
      : match
        ? await matchText(match)
        : difficulty
          ? text.challengeTitle(text.difficulties[difficulty])
          : text.welcome;
    const sent = await ctx.reply(title, {
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [{ text: duel ? text.beatRecord : text.play, web_app: { url: url.toString() } }],
          [{ text: text.dropInChat, switch_inline_query: difficulty ?? '' }],
        ],
      },
    });
    if (openedMatch && sent && 'message_id' in sent) {
      const saved = await rememberMatchNotice(openedMatch, ctx.chat.id, sent.message_id);
      if (saved?.settings) await editInlineMatch(saved);
    }
    return;
  }
  if (isGroup(ctx.chat.type)) {
    await publishCard(ctx.chat.id, SudokuGuruDifficulty.easy, langFrom(ctx.from?.language_code));
    return;
  }

  const replyMarkup = {
    inline_keyboard: [
      [{ text: text.play, web_app: { url: webAppUrl } }],
      [{ text: text.dropInChat, switch_inline_query: '' }],
    ],
  };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendWidget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ctx.chat.id,
        html: welcomeWidgetHtml(),
        caption: text.welcome,
        reply_markup: replyMarkup,
      }),
    });
    const payload = await response.json() as { ok: boolean; description?: string };
    if (!payload.ok) {
      throw new Error(payload.description ?? 'sendWidget failed');
    }
  } catch (error) {
    console.error('Widget was not sent, falling back to a text message.', error);
    await ctx.reply(text.welcome, { reply_markup: replyMarkup });
  }
});

bot.command('sudoku', async (ctx) => {
  const text = messages(langFrom(ctx.from?.language_code));
  if (!ctx.chat || !isGroup(ctx.chat.type)) {
    await ctx.reply(text.groupOnly);
    return;
  }
  const difficulty = parseDifficultyArg(commandArgument(ctx.message.text));
  if (!difficulty) {
    await ctx.reply(text.difficultyHint);
    return;
  }
  await publishCard(ctx.chat.id, difficulty, langFrom(ctx.from?.language_code));
});

bot.command('top', async (ctx) => {
  const text = messages(langFrom(ctx.from?.language_code));
  if (!ctx.chat || !isGroup(ctx.chat.type)) return;
  const difficulty = parseDifficultyArg(commandArgument(ctx.message.text));
  if (!difficulty) {
    await ctx.reply(text.difficultyHint);
    return;
  }
  await publishCard(ctx.chat.id, difficulty, langFrom(ctx.from?.language_code));
});

bot.on('inline_query', async (ctx) => {
  const lang = langFrom(ctx.from.language_code);
  const text = messages(lang);
  const results = pickDifficulties(ctx.inlineQuery.query).map(difficulty => ({
    type: 'article' as const,
    id: difficulty,
    title: text.challengeTitle(text.difficulties[difficulty]),
    description: text.inlineDescription,
    input_message_content: { message_text: renderMatch(lang, difficulty, []) },
    reply_markup: {
      inline_keyboard: [[{
        text: text.play,
        callback_data: `n:${difficultyCode(difficulty)}:${lang}`,
      }]],
    },
  }));
  await ctx.answerInlineQuery(results, { cache_time: 0, is_personal: true });
});

bot.on('chosen_inline_result', async (ctx) => {
  const inlineMessageId = ctx.chosenInlineResult.inline_message_id ?? '';
  const resultId = ctx.chosenInlineResult.result_id;
  if (!inlineMessageId || !/^[a-f0-9]{16}$/.test(resultId)) return;
  const duel = await bindDuelMessage(resultId, inlineMessageId);
  if (duel) await editDuelMessage(duel);
});

bot.on('callback_query', async (ctx) => {
  const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
  const duelId = /^d:([a-f0-9]{16})$/.exec(data)?.[1];
  if (duelId) {
    await openDuelFromMessage(ctx, duelId);
    return;
  }
  const parsed = parseInlineButton(data);
  const inlineMessageId = ctx.callbackQuery.inline_message_id;
  if (!parsed || !inlineMessageId) {
    await ctx.answerCbQuery();
    return;
  }
  try {
    const match = await openInlineMatch(inlineMessageId, parsed.difficulty, parsed.lang);
    const noted = await noteMatchPlayer(match.id, ctx.from.id, displayName(ctx.from, parsed.lang));
    const current = noted?.match ?? match;
    await editInlineMatch(current);
    const botUsername = await ensureUsername();
    await ctx.answerCbQuery(undefined, { url: `https://t.me/${botUsername}?start=i${current.id}` });
  } catch (error) {
    console.error('Failed to open an inline match.', error);
    await ctx.answerCbQuery().catch(() => undefined);
  }
});

async function publishCommands(): Promise<void> {
  if (!username) username = (await bot.telegram.getMe()).username;
  const english = messages('en');
  const russian = messages('ru');
  await bot.telegram.setMyCommands(
    [{ command: 'start', description: english.cmdStart }],
    { scope: { type: 'all_private_chats' } },
  );
  await bot.telegram.setMyCommands(
    [{ command: 'start', description: russian.cmdStart }],
    { scope: { type: 'all_private_chats' }, language_code: 'ru' },
  );
  await bot.telegram.setMyCommands(
    [
      { command: 'sudoku', description: english.cmdSudoku },
      { command: 'top', description: english.cmdTop },
    ],
    { scope: { type: 'all_group_chats' } },
  );
  await bot.telegram.setMyCommands(
    [
      { command: 'sudoku', description: russian.cmdSudoku },
      { command: 'top', description: russian.cmdTop },
    ],
    { scope: { type: 'all_group_chats' }, language_code: 'ru' },
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

async function publishCard(chatId: number, difficulty: SudokuGuruDifficulty, lang: Lang): Promise<void> {
  const botUsername = await ensureUsername();
  await withRecords(async (file) => {
    const card = findTodayCard(file, chatId, difficulty, lang);
    const record = file.chats[String(chatId)]?.records?.[difficulty] ?? null;
    const extra = cardKeyboard(botUsername, card);
    const text = await dailyText(card, record);
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
    if (req.method === 'GET' && path?.startsWith('/play/i')) {
      await handlePlayOpen(path.slice('/play/i'.length), res);
      return;
    }
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
    if (req.method === 'POST' && path === '/achievement') {
      await handleAchievement(req, res);
      return;
    }
    if (req.method === 'POST' && path === '/match/state') {
      await handleMatchState(req, res);
      return;
    }
    if (req.method === 'POST' && path === '/match/result') {
      await handleMatchResult(req, res);
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
      if (update.place === 1 && update.card.entries.length === 1) {
        await recordWin(signed.userId, { ...emptyWin(update.card.difficulty), firstInChat: true, seconds: Math.floor(seconds) });
      }
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
    const body = await readJson(req) as { initData?: unknown; left?: unknown; total?: unknown; seconds?: unknown; samples?: unknown; settings?: unknown; forfeit?: unknown };
    const initData = typeof body.initData === 'string' ? body.initData : '';
    const signed = readSignedInitData(initData, token);
    const challenge = signed ? parseStartParam(signed.startParam) : null;
    if (!signed || !challenge || (signed.chatType !== 'group' && signed.chatType !== 'supergroup')) {
      sendJson(res, 401, { ok: false });
      return;
    }
    const left = typeof body.left === 'number' ? body.left : -1;
    const total = typeof body.total === 'number' ? body.total : -1;
    const update = await withRecords(file => touchProgress(
      file,
      challenge,
      signed.userId,
      signed.name,
      left,
      total,
      { seconds: typeof body.seconds === 'number' ? Math.floor(body.seconds) : 0, samples: body.samples },
      { settings: body.settings, forfeit: body.forfeit === true },
    ));
    if (!update) {
      sendJson(res, 400, { ok: false });
      return;
    }
    if (update.joined) await editCard(update.chatId, update.card, update.record);
    sendJson(res, 200, { ok: true, leader: update.view.leader, players: update.view.players, rival: update.view.rival });
  } catch (error) {
    console.error('Failed to update the live race.', error);
    sendJson(res, 500, { ok: false });
  }
}

async function dailyText(card: ChallengeCard, record: { name: string; seconds: number; day: string } | null): Promise<string> {
  const ids = [...card.entries.map(entry => entry.userId), ...(card.joined ?? []).map(player => player.userId)];
  return renderCard(card, record, await prefixesFor(ids, cardLang(card.lang)));
}

async function matchText(match: StoredMatch): Promise<string> {
  const ids = [...match.entries.map(entry => entry.userId), ...(match.present ?? []).map(player => player.userId)];
  return renderMatch(match.lang, match.difficulty, match.entries, match.present ?? [], match.settings, await prefixesFor(ids, cardLang(match.lang)));
}

async function taggedName(userId: number, name: string, lang: Lang): Promise<string> {
  const marks = await prefixesFor([userId], lang);
  return `${marks.get(userId) ?? ''}${name}`;
}

function emptyWin(difficulty: SudokuGuruDifficulty) {
  return { day: todayKey(), difficulty, bare: false, pencilUsed: null as boolean | null, seconds: 15 };
}

async function handleAchievement(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await readJson(req) as { initData?: unknown; pin?: unknown; win?: { difficulty?: unknown; settings?: unknown; pencilUsed?: unknown; seconds?: unknown } };
    const signed = readSignedInitData(typeof body.initData === 'string' ? body.initData : '', token);
    if (!signed) {
      sendJson(res, 401, { ok: false });
      return;
    }
    if (body.pin !== undefined) {
      const achievements = await toggleListedPin(signed.userId, body.pin);
      sendJson(res, achievements ? 200 : 400, { ok: Boolean(achievements), achievements: achievements ?? await readPublic(signed.userId) });
      return;
    }
    if (body.win && typeof body.win === 'object') {
      const facts = winFactsFromBody(body.win);
      const seconds = typeof body.win.seconds === 'number' ? Math.floor(body.win.seconds) : -1;
      if (!facts) {
        sendJson(res, 400, { ok: false });
        return;
      }
      const achievements = await recordWin(signed.userId, { ...facts, seconds });
      sendJson(res, achievements ? 200 : 400, { ok: Boolean(achievements), achievements: achievements ?? await readPublic(signed.userId) });
      return;
    }
    sendJson(res, 200, { ok: true, achievements: await readPublic(signed.userId) });
  } catch (error) {
    console.error('Failed to update achievements.', error);
    sendJson(res, 500, { ok: false });
  }
}

async function editCard(chatId: number, card: ChallengeCard, record: { name: string; seconds: number; day: string } | null): Promise<void> {
  if (!card.messageId) return;
  const botUsername = await ensureUsername();
  try {
    await bot.telegram.editMessageText(chatId, card.messageId, undefined, await dailyText(card, record), cardKeyboard(botUsername, card));
  } catch (error) {
    if (!isNotModified(error)) console.error('Failed to refresh the chat card.', error);
  }
}

function isNotModified(error: unknown): boolean {
  return error instanceof Error && error.message.includes('message is not modified');
}

function cardKeyboard(username: string, card: ChallengeCard) {
  const text = messages(cardLang(card.lang));
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: text.play, url: playLink(username, miniAppShortName, card) }],
        [{ text: text.dropInChat, switch_inline_query: card.difficulty }],
      ],
    },
    link_preview_options: { is_disabled: true as const },
  };
}

function parseInlineButton(data: string): { difficulty: SudokuGuruDifficulty; lang: Lang } | null {
  const match = /^n:([emhxg]):(en|ru)$/.exec(data);
  if (!match) return null;
  const difficulty = difficultyFromCode(match[1]);
  if (!difficulty || (match[2] !== 'en' && match[2] !== 'ru')) return null;
  return { difficulty, lang: match[2] };
}

function pickDifficulties(query: string): SudokuGuruDifficulty[] {
  const folded = query.trim().toLowerCase().replace(/ё/g, 'е');
  const all = Object.values(SudokuGuruDifficulty);
  if (!folded) return all;
  const picked = all.filter(difficulty => {
    if (difficulty.startsWith(folded)) return true;
    return (['en', 'ru'] as const).some(lang => (
      messages(lang).difficulties[difficulty].toLowerCase().replace(/ё/g, 'е').startsWith(folded)
    ));
  });
  return picked.length > 0 ? picked : all;
}

function matchIdFrom(startParam: string | undefined, bodyId: unknown): string | null {
  const fromStart = startParam ? parseMatchId(startParam) : null;
  if (fromStart) return fromStart;
  return typeof bodyId === 'string' ? parseMatchId(bodyId) : null;
}

function displayName(from: { first_name?: string; last_name?: string } | undefined, lang: Lang): string {
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 32);
  return name || (lang === 'ru' ? 'Игрок' : 'Player');
}

async function handlePlayOpen(id: string, res: http.ServerResponse): Promise<void> {
  if (!/^[a-f0-9]{16}$/.test(id)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const botUsername = await ensureUsername();
  const target = `https://t.me/${botUsername}?start=i${id}`;
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Sudoku</title><script>location.replace(${JSON.stringify(target)})</script><p><a href="${target}">Play</a></p>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

const sentMatchCards = new Map<string, string>();

async function editInlineMatch(match: StoredMatch): Promise<void> {
  const text = messages(match.lang);
  const body = await matchText(match);
  await editMatchNotices(match, body);
  if (!match.inlineMessageId || sentMatchCards.get(match.inlineMessageId) === body) return;
  await bot.telegram.editMessageText(
    undefined,
    undefined,
    match.inlineMessageId,
    body,
    {
      reply_markup: {
        inline_keyboard: [[{
          text: text.play,
          callback_data: `n:${difficultyCode(match.difficulty)}:${match.lang}`,
        }]],
      },
      link_preview_options: { is_disabled: true },
    },
  ).then(() => {
    sentMatchCards.set(match.inlineMessageId, body);
  }, error => {
    if (isNotModified(error)) sentMatchCards.set(match.inlineMessageId, body);
    else console.error('Failed to refresh the inline match.', error);
  });
}

const sentPrivateCards = new Map<string, string>();

async function editMatchNotices(match: StoredMatch, body: string): Promise<void> {
  const text = messages(match.lang);
  const url = new URL(webAppUrl);
  url.searchParams.set('match', `i${match.id}`);
  for (const notice of match.notices ?? []) {
    const key = `${notice.chatId}:${notice.messageId}`;
    if (sentPrivateCards.get(key) === body) continue;
    await bot.telegram.editMessageText(notice.chatId, notice.messageId, undefined, body, {
      reply_markup: {
        inline_keyboard: [
          [{ text: text.play, web_app: { url: url.toString() } }],
          [{ text: text.dropInChat, switch_inline_query: match.difficulty }],
        ],
      },
      link_preview_options: { is_disabled: true },
    }).then(() => {
      sentPrivateCards.set(key, body);
    }, error => {
      if (isNotModified(error)) sentPrivateCards.set(key, body);
      else console.error('Failed to refresh the private challenge card.', error);
    });
  }
}

async function handleMatchState(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await readJson(req) as {
      initData?: unknown;
      matchId?: unknown;
      settings?: unknown;
      forfeit?: unknown;
      left?: unknown;
      total?: unknown;
      seconds?: unknown;
      samples?: unknown;
    };
    const signed = readSignedInitData(typeof body.initData === 'string' ? body.initData : '', token);
    const id = matchIdFrom(signed?.startParam, body.matchId);
    if (!signed || !id) {
      sendJson(res, 401, { ok: false });
      return;
    }
    const noted = await noteMatchPlayer(id, signed.userId, signed.name, {
      settings: body.settings,
      forfeit: body.forfeit === true,
      left: body.left,
      total: body.total,
      seconds: body.seconds,
      samples: body.samples,
    });
    if (noted?.freshStart && noted.match.hostId) await recordStart(noted.match.hostId, signed.userId);
    if (noted && (noted.refreshCard || noted.match.entries.length > 0)) await editInlineMatch(noted.match);
    const match = noted?.match ?? await readMatch(id);
    if (!match) {
      sendJson(res, 404, { ok: false });
      return;
    }
    const view = toMatchView(match, signed.userId);
    sendJson(res, 200, {
      ok: true,
      difficulty: view.difficulty,
      level: view.level,
      leader: view.leader,
      settings: view.settings,
      players: view.players,
      rival: view.rival,
    });
  } catch (error) {
    console.error('Failed to read an inline match.', error);
    sendJson(res, 500, { ok: false });
  }
}

async function handleMatchResult(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await readJson(req) as { initData?: unknown; matchId?: unknown; seconds?: unknown; total?: unknown; samples?: unknown };
    const signed = readSignedInitData(typeof body.initData === 'string' ? body.initData : '', token);
    const id = matchIdFrom(signed?.startParam, body.matchId);
    if (!signed || !id) {
      sendJson(res, 401, { ok: false });
      return;
    }
    const seconds = typeof body.seconds === 'number' ? Math.floor(body.seconds) : -1;
    const update = await recordMatchResult(id, signed.userId, signed.name, seconds, {
      total: typeof body.total === 'number' ? body.total : -1,
      samples: body.samples,
    });
    if (!update) {
      sendJson(res, 400, { ok: false });
      return;
    }
    if (update) await editInlineMatch(update.match);
    sendJson(res, 200, { ok: true, improved: update.improved });
  } catch (error) {
    console.error('Failed to record an inline result.', error);
    sendJson(res, 500, { ok: false });
  }
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
      score?: unknown;
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
      score: body.score,
    });
    if (!accepted) {
      sendJson(res, 400, { ok: false });
      return;
    }
    const duel = await saveDuel({ ...accepted, lang: signed.lang });
    const botUsername = await ensureUsername();
    const link = `https://t.me/${botUsername}?start=d${duel.id}`;
    const messageId = await prepareChallengeMessage(signed.userId, signed.lang, duel);
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
    const body = await readJson(req) as { initData?: unknown; id?: unknown; seconds?: unknown; forfeit?: unknown };
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
    if (body.forfeit === true) {
      const forfeited = await forfeitDuelGuest(id, signed.userId, signed.name);
      if (forfeited) await editDuelMessage(forfeited);
      sendJson(res, 200, { ok: true, beat: false });
      return;
    }
    if (existing.guests?.some(guest => guest.userId === signed.userId && guest.forfeited)) {
      sendJson(res, 200, { ok: false, beat: false });
      return;
    }
    const previousBest = existing.bestSeconds;
    const updated = await recordDuelResult(id, signed.userId, signed.name, seconds);
    if (!updated) {
      sendJson(res, 200, { ok: false, beat: false });
      return;
    }
    await editDuelMessage(updated);
    if (updated.guests?.some(guest => guest.userId === signed.userId && guest.forfeited)) {
      sendJson(res, 200, { ok: false, beat: false });
      return;
    }
    const beat = seconds < existing.seconds && (previousBest === null || seconds < previousBest);
    if (signed.userId !== existing.userId) await recordStart(existing.userId, signed.userId);
    if (beat && bareSettings(existing.settings) && signed.userId !== existing.userId) {
      await recordWin(signed.userId, {
        ...emptyWin(existing.difficulty),
        bare: true,
        beatBareAuthor: true,
        seconds,
      });
    }
    if (beat && signed.userId !== existing.userId) {
      const copy = messages(cardLang(existing.lang));
      const text = copy.beat(
        signed.name,
        copy.difficulties[existing.difficulty],
        formatSeconds(seconds),
        formatSeconds(existing.seconds),
      );
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

async function openDuelFromMessage(ctx: {
  from: { id: number; first_name?: string; last_name?: string; language_code?: string };
  callbackQuery: { inline_message_id?: string };
  answerCbQuery: (text?: string, extra?: { url?: string }) => Promise<unknown>;
}, id: string): Promise<void> {
  const inlineMessageId = ctx.callbackQuery.inline_message_id ?? '';
  try {
    if (inlineMessageId) await bindDuelMessage(id, inlineMessageId);
    const lang = langFrom(ctx.from.language_code);
    const noted = await noteDuelGuest(id, ctx.from.id, displayName(ctx.from, lang));
    if (noted && noted.userId !== ctx.from.id) await recordStart(noted.userId, ctx.from.id);
    const duel = noted ?? await readDuel(id);
    if (duel) await editDuelMessage(duel);
    const botUsername = await ensureUsername();
    await ctx.answerCbQuery(undefined, { url: `https://t.me/${botUsername}?start=d${id}` });
  } catch (error) {
    console.error('Failed to open a challenge from its message.', error);
    await ctx.answerCbQuery().catch(() => undefined);
  }
}

function guestLine(guest: DuelGuest, bullet: boolean, marks: ReadonlyMap<number, string>): string {
  const when = typeof guest.joinedAt === 'number' ? formatJoined(guest.joinedAt) : '';
  const result = guest.seconds === null ? '' : formatSeconds(guest.seconds);
  const time = [when, result].filter(Boolean).join(' · ');
  const name = `${marks.get(guest.userId) ?? ''}${guest.name}`;
  const text = time ? `${name} — ${time}` : name;
  return bullet ? `• ${text}` : text;
}

async function renderDuelMessage(duel: StoredDuel): Promise<string> {
  const lang = cardLang(duel.lang);
  const marks = await prefixesFor([duel.userId, ...(duel.guests ?? []).map(guest => guest.userId)], lang);
  const copy = messages(lang);
  const lines = [
    `Sudoku · ${copy.difficulties[duel.difficulty]}`,
    `${marks.get(duel.userId) ?? ''}${duel.name} — ${formatSeconds(duel.seconds)}`,
  ];
  if (typeof duel.score === 'number') lines.push(copy.score(duel.score));
  lines.push(
    copy.settingsNamed(settingsNickname(duel.settings, cardLang(duel.lang))),
    copy.preparedLine,
  );
  const playing = (duel.guests ?? []).filter(guest => guest.seconds === null);
  const finished = (duel.guests ?? []).filter(guest => guest.seconds !== null);
  if (playing.length > 0) {
    lines.push('', copy.joined);
    playing.slice(0, 10).forEach(guest => lines.push(guestLine(guest, true, marks)));
  }
  if (finished.length > 0) lines.push('');
  finished
    .slice()
    .sort((left, right) => (left.seconds ?? 0) - (right.seconds ?? 0))
    .slice(0, 10)
    .forEach(guest => lines.push(guestLine(guest, false, marks)));
  return lines.join('\n');
}

async function editDuelMessage(duel: StoredDuel): Promise<void> {
  if (!duel.inlineMessageId) return;
  const copy = messages(cardLang(duel.lang));
  await bot.telegram.editMessageText(
    undefined,
    undefined,
    duel.inlineMessageId,
    await renderDuelMessage(duel),
    {
      reply_markup: { inline_keyboard: [[{ text: copy.beatRecord, callback_data: `d:${duel.id}` }]] },
      link_preview_options: { is_disabled: true },
    },
  ).catch(error => {
    if (!isNotModified(error)) console.error('Failed to refresh the challenge message.', error);
  });
}

async function prepareChallengeMessage(
  userId: number,
  lang: Lang,
  duel: { id: string; name: string; difficulty: SudokuGuruDifficulty; seconds: number; settings: GameSettingsType; score?: number },
): Promise<string | null> {
  const copy = messages(lang);
  const lines = [
    `Sudoku · ${copy.difficulties[duel.difficulty]}`,
    `${await taggedName(userId, duel.name, lang)} — ${formatSeconds(duel.seconds)}`,
  ];
  if (typeof duel.score === 'number') lines.push(copy.score(duel.score));
  lines.push(
    copy.settingsNamed(settingsNickname(duel.settings, lang)),
    copy.preparedLine,
  );
  const text = lines.join('\n');
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
          title: `${duel.name} · ${copy.difficulties[duel.difficulty]} · ${formatSeconds(duel.seconds)}${typeof duel.score === 'number' ? ` · ${duel.score}` : ''}`,
          description: copy.preparedDescription,
          input_message_content: { message_text: text },
          reply_markup: {
            inline_keyboard: [[{ text: copy.beatRecord, callback_data: `d:${duel.id}` }]],
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
