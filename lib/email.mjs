// Email adapter — same `send(text)` contract as telegram.mjs and whatsapp.mjs.
//
// Email has no length limit and no approval process, so this is the simplest
// channel of the three: one message, whole digest, no chunking.
//
// Required env:
//   SMTP_USER   full email address to send from
//   SMTP_PASS   app password (NOT your normal password — see setup-email.mjs)
//   EMAIL_TO    where the digest goes
// Optional:
//   SMTP_HOST   defaults to smtp.gmail.com
//   SMTP_PORT   defaults to 465 (implicit TLS)
//   EMAIL_FROM  defaults to SMTP_USER

import nodemailer from 'nodemailer';
import { log } from './util.mjs';

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The write-up prompt emits phone-friendly `*bold*` and `_italic_` for chat
 * apps. Email renders HTML, so translate rather than asking the model for a
 * second format — one prompt, many channels.
 */
function toHtml(text) {
  const blocks = text.split(/\n———\n/);

  const body = blocks
    .map((block) => {
      const lines = escapeHtml(block.trim())
        .split('\n')
        .map((line) => {
          const styled = line
            .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
            .replace(/_([^_\n]+)_/g, '<em>$1</em>')
            .replace(
              /(https?:\/\/[^\s<]+)/g,
              '<a href="$1" style="color:#2563eb;word-break:break-all">$1</a>',
            );
          return styled.trim() ? `<p style="margin:0 0 10px">${styled}</p>` : '';
        })
        .join('\n');
      return `<div style="margin:0 0 28px">${lines}</div>`;
    })
    .join('<hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0">');

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;line-height:1.55;color:#111827;max-width:680px;margin:0 auto;padding:24px">
${body}
<p style="margin-top:36px;font-size:13px;color:#6b7280">Sent by your AEO radar. Only arrives when something actually happened.</p>
</div>`;
}

/** First line doubles as the subject; it is already a dated, readable header. */
function subjectFrom(text) {
  const first = text.split('\n').find((l) => l.trim());
  const clean = (first || 'AEO radar update').replace(/[*_]/g, '').trim();
  return clean.length > 120 ? clean.slice(0, 117) + '…' : clean;
}

export async function send(text) {
  for (const key of ['SMTP_USER', 'SMTP_PASS', 'EMAIL_TO']) {
    if (!process.env[key]) throw new Error(`${key} must be set in .env`);
  }

  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: process.env.EMAIL_TO,
    subject: subjectFrom(text),
    text, // plain-text fallback keeps the message readable anywhere
    html: toHtml(text),
  });

  log(`email: sent "${subjectFrom(text)}" (${info.messageId})`);
}

export { toHtml, subjectFrom };
