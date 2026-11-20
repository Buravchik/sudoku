import { randomBytes } from 'crypto';
import { challengeWidgetHtml } from './challengeWidget';

const widgetHtml = challengeWidgetHtml();

interface TelegramResult {
  ok: boolean;
  description?: string;
  result?: { message_id?: number };
}

export function captionOf(text: string): string {
  const value = text.trim();
  if (Buffer.byteLength(value) <= 1024) return value;
  let end = value.length;
  while (end > 0 && Buffer.byteLength(value.slice(0, end)) > 1020) end -= 16;
  return `${value.slice(0, end).trimEnd()}…`;
}

export async function sendChallengeWidget(
  token: string,
  chatId: number,
  caption: string,
  replyMarkup: object,
  state: string,
): Promise<number | null> {
  const payload = await callJson(token, 'sendWidget', {
    chat_id: chatId,
    html: widgetHtml,
    caption,
    chat_data: state,
    width: 0,
    height: 0,
    reply_markup: replyMarkup,
  });
  if (!payload.ok || typeof payload.result?.message_id !== 'number') {
    console.error('Widget was not sent.', payload.description);
    return null;
  }
  return payload.result.message_id;
}

export async function editChallengeWidget(
  token: string,
  chatId: number,
  messageId: number,
  caption: string,
  replyMarkup: object,
  state: string,
): Promise<void> {
  const data = await callJson(token, 'editMessageWidgetData', {
    chat_id: chatId,
    message_id: messageId,
    chat_data: state,
  });
  if (!data.ok && !notModified(data.description)) console.error('Failed to refresh the widget chart.', data.description);
  const text = await callJson(token, 'editMessageCaption', {
    chat_id: chatId,
    message_id: messageId,
    caption,
    reply_markup: replyMarkup,
  });
  if (!text.ok && !notModified(text.description)) console.error('Failed to refresh the widget caption.', text.description);
}

export async function sendChartPhoto(
  token: string,
  chatId: number,
  caption: string,
  png: Buffer,
  replyMarkup: object,
): Promise<number | null> {
  const payload = await callForm(token, 'sendPhoto', {
    chat_id: String(chatId),
    caption,
    reply_markup: JSON.stringify(replyMarkup),
  }, 'photo', png);
  if (!payload.ok || typeof payload.result?.message_id !== 'number') {
    console.error('Chart photo was not sent.', payload.description);
    return null;
  }
  return payload.result.message_id;
}

export async function editChartPhoto(
  token: string,
  target: { chatId?: number; messageId?: number; inlineMessageId?: string },
  caption: string,
  png: Buffer,
  replyMarkup: object,
): Promise<'ok' | 'same' | 'fail'> {
  const fields: Record<string, string> = {
    media: JSON.stringify({ type: 'photo', media: 'attach://chart', caption }),
    reply_markup: JSON.stringify(replyMarkup),
  };
  if (target.inlineMessageId) fields.inline_message_id = target.inlineMessageId;
  else {
    fields.chat_id = String(target.chatId);
    fields.message_id = String(target.messageId);
  }
  const payload = await callForm(token, 'editMessageMedia', fields, 'chart', png);
  if (payload.ok) return 'ok';
  if (notModified(payload.description)) return 'same';
  console.error('Failed to refresh the chart photo.', payload.description);
  return 'fail';
}

export async function deleteChatMessage(token: string, chatId: number, messageId: number): Promise<void> {
  const payload = await callJson(token, 'deleteMessage', { chat_id: chatId, message_id: messageId });
  if (!payload.ok) console.error('Failed to remove the old challenge card.', payload.description);
}

function notModified(description: string | undefined): boolean {
  return Boolean(description?.includes('message is not modified'));
}

async function callJson(token: string, method: string, body: object): Promise<TelegramResult> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<TelegramResult>;
}

async function callForm(
  token: string,
  method: string,
  fields: Record<string, string>,
  fileName: string,
  png: Buffer,
): Promise<TelegramResult> {
  const boundary = `----sudoku${randomBytes(8).toString('hex')}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileName}"; filename="chart.png"\r\nContent-Type: image/png\r\n\r\n`,
  ));
  parts.push(png);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(parts),
  });
  return response.json() as Promise<TelegramResult>;
}
