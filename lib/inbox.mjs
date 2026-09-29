// Trigger-by-email: send yourself a message, the next check runs a scan.
//
// Chosen because it needs nothing new — the app password already set up for
// sending also reads. No token, no Shortcut, no open port, and no macOS
// permission prompt (the iCloud-folder approach is blocked by TCC for
// background agents, which is what ruled it out).
//
// Safety: only mail *from your own address* counts. Anyone else emailing you the
// word "scan" is ignored, so the trigger cannot be fired by a stranger.

import { ImapFlow } from 'imapflow';
import { log } from './util.mjs';

const COMMANDS = [
  { re: /\bdigest\b/i, cmd: 'digest' },
  { re: /\bscan|radar|update|check\b/i, cmd: 'scan' },
];

function commandFor(subject = '') {
  return COMMANDS.find((c) => c.re.test(subject))?.cmd || null;
}

/**
 * Look for an unread trigger mail from yourself. Returns 'scan', 'digest', or
 * null. Anything it acts on is marked read, so one email means one run.
 */
export async function checkInbox() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('SMTP_USER and SMTP_PASS must be set in .env');

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  let command = null;

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Only unread mail this account sent to itself.
      const uids = await client.search({ seen: false, from: user });
      if (!uids || !uids.length) return null;

      for (const uid of uids.slice(-10)) {
        const msg = await client.fetchOne(String(uid), { envelope: true });
        const subject = msg?.envelope?.subject || '';

        // Never treat the radar's own digests as commands, or it would trigger
        // itself every time it sends something.
        if (/AEO radar/i.test(subject)) continue;

        const cmd = commandFor(subject);
        if (!cmd) continue;

        await client.messageFlagsAdd(String(uid), ['\\Seen']);
        log(`inbox: trigger "${subject}" → ${cmd}`);
        command = cmd;
        break;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return command;
}

export { commandFor };
