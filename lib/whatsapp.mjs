// WhatsApp adapter — same `send(text)` contract as telegram.mjs.
//
// Not wired up until a WhatsApp Business number and an approved template exist.
// To switch over, set the env vars below and change the import in pipeline.mjs.
//
// Why this is shaped so awkwardly: a business cannot push a free-form message to
// WhatsApp. Business-initiated messages must use a pre-approved template — max
// 1024 characters, no newlines, no variable at the start or end. Free-form
// messages of any length are legal only inside the 24-hour customer service
// window, which opens when the *user* messages the business.
//
// So the flow is: send a short template carrying a quick-reply button, the user
// taps it, that tap opens the window, and the real digest follows as ordinary
// free-form messages. One tap per digest.
//
// Required env:
//   WHATSAPP_TOKEN          permanent access token for the WhatsApp Business app
//   WHATSAPP_PHONE_ID       phone number id from the Meta app dashboard
//   WHATSAPP_TO            recipient in international format, digits only
//   WHATSAPP_TEMPLATE       approved template name (e.g. aeo_radar_ready)

import { readState, writeState, log } from './util.mjs';

const API = 'https://graph.facebook.com/v21.0';
const LIMIT = 4000; // WhatsApp caps body text at 4096; leave headroom
const WINDOW_MS = 24 * 60 * 60 * 1000;

async function post(body) {
  const res = await fetch(`${API}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: process.env.WHATSAPP_TO, ...body }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`whatsapp: ${json.error.message}`);
  return json;
}

function chunk(text) {
  if (text.length <= LIMIT) return [text];
  const out = [];
  let buf = '';
  for (const part of text.split(/\n———\n/)) {
    const piece = buf ? `${buf}\n———\n${part}` : part;
    if (piece.length <= LIMIT) buf = piece;
    else {
      if (buf) out.push(buf);
      buf = part.slice(0, LIMIT);
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * The window only opens on an inbound message from the user. We record when one
 * was last seen; `npm run wa:inbound` (or a webhook) should refresh it.
 */
async function windowOpen() {
  const { lastInbound } = await readState('whatsapp.json', {});
  return lastInbound && Date.now() - new Date(lastInbound).getTime() < WINDOW_MS;
}

export async function noteInbound() {
  await writeState('whatsapp.json', { lastInbound: new Date().toISOString() });
}

export async function send(text) {
  for (const key of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_TO', 'WHATSAPP_TEMPLATE']) {
    if (!process.env[key]) throw new Error(`${key} must be set in .env`);
  }

  const parts = chunk(text);

  if (!(await windowOpen())) {
    // Closed window: all we are allowed to send is the template. The digest
    // waits until the tap arrives and the next run finds the window open.
    await post({
      type: 'template',
      template: {
        name: process.env.WHATSAPP_TEMPLATE,
        language: { code: 'en' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: `${parts.length}` }] },
        ],
      },
    });
    log('whatsapp: window closed — sent template teaser, digest held until you reply');
    await writeState('whatsapp.json', {
      ...(await readState('whatsapp.json', {})),
      pending: text,
    });
    return;
  }

  for (const [i, part] of parts.entries()) {
    await post({ type: 'text', text: { body: part, preview_url: false } });
    log(`whatsapp: sent part ${i + 1}/${parts.length}`);
  }
}
