import { log } from './util.mjs';

const LIMIT = 4096;

/**
 * Split on item boundaries so a message never tears mid-item. Falls back to
 * paragraph, then hard slice, for anything that is still too long.
 */
function chunk(text) {
  if (text.length <= LIMIT) return [text];
  const out = [];
  let buf = '';
  for (const part of text.split(/\n———\n/)) {
    const piece = buf ? `${buf}\n———\n${part}` : part;
    if (piece.length <= LIMIT) {
      buf = piece;
      continue;
    }
    if (buf) out.push(buf);
    if (part.length <= LIMIT) {
      buf = part;
    } else {
      for (let i = 0; i < part.length; i += LIMIT) out.push(part.slice(i, i + LIMIT));
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out;
}

async function post(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`telegram ${method}: ${json.description}`);
  return json.result;
}

export async function send(text) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in .env');
  }
  const parts = chunk(text);
  for (const [i, part] of parts.entries()) {
    // Legacy Markdown, not MarkdownV2: the write-up prompt emits *bold* and
    // _italic_ without escaping every punctuation mark, which V2 would reject.
    await post('sendMessage', {
      chat_id: chatId,
      text: part,
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    });
    log(`telegram: sent part ${i + 1}/${parts.length} (${part.length} chars)`);
  }
}

export async function getUpdates() {
  return post('getUpdates', {});
}
