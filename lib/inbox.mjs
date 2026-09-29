// Trigger-by-email: send yourself a message, the next check runs a scan.
//
// Chosen because it needs nothing new — the app password already set up for
// sending also reads. No token service, no Shortcut, no open port, and no macOS
// permission prompt (the iCloud-folder approach is blocked by TCC for
// background agents, which is what ruled it out).
//
// Three independent conditions must all hold before anything runs:
//
//   1. the secret in TRIGGER_SECRET appears in the subject or body
//   2. the mail came from your own address
//   3. it arrived recently
//
// The secret is what actually carries the security. A From address can be
// forged, so on its own condition 2 only stops accidents and randoms; without a
// secret, anyone who knew the address and the convention could fire the trigger.
// The recency window means a genuine trigger mail cannot be replayed later.

import { ImapFlow } from 'imapflow';
import { log, readState, writeState } from './util.mjs';

const COMMANDS = [
  // "review" looks back over a fixed window regardless of what has been sent
  // before; everything else means "tell me what's new since last time".
  { re: /\b(review|recap|catch\s*up|last\s*\d+\s*days?)\b/i, cmd: 'review' },
  { re: /\b(scan|radar|update|check|digest|news)\b/i, cmd: 'scan' },
];

const MAX_AGE_MINUTES = 30;

function commandFor(text = '') {
  return COMMANDS.find((c) => c.re.test(text))?.cmd || null;
}

/** "review 30" or "last 30 days" — how far back to look. Defaults to a fortnight. */
function daysFor(text = '') {
  const n = Number(text.match(/\b(\d{1,3})\s*days?\b/i)?.[1] || text.match(/\breview\s+(\d{1,3})\b/i)?.[1]);
  return Number.isFinite(n) && n >= 1 && n <= 90 ? n : 14;
}

/** Constant-time-ish compare, so the check does not leak the secret by timing. */
function hasSecret(haystack, secret) {
  if (!secret) return false;
  return haystack.toLowerCase().includes(secret.toLowerCase());
}

/**
 * Look for an unread trigger mail from yourself carrying the secret. Returns
 * 'scan', 'digest', or null. Anything acted on is marked read, so one email
 * means one run.
 */
export async function checkInbox() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secret = process.env.TRIGGER_SECRET;

  if (!user || !pass) throw new Error('SMTP_USER and SMTP_PASS must be set in .env');
  if (!secret) {
    // Refuse to run an unauthenticated trigger rather than quietly accepting
    // any mail that happens to say "scan".
    throw new Error('TRIGGER_SECRET must be set in .env — run `npm run trigger:code`');
  }

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
      // Track the highest message id already looked at, rather than relying on
      // the unread flag. Opening your own inbox to see whether a reply arrived
      // marks the trigger mail read, and a flag-based check then skips it — a
      // trigger that fails precisely because you went looking for its result.
      const state = await readState('trigger.json', {});
      const validity = String(client.mailbox?.uidValidity ?? '');

      // Message ids are only comparable within one UIDVALIDITY. Emptying the
      // mailbox restarts them from 1, and a marker left over from the previous
      // numbering then sits above every real message and blocks the lot —
      // silently, because the search simply returns nothing. Reset on change.
      let lastUid = Number(state.lastUid || 0);
      if (state.uidValidity && state.uidValidity !== validity) {
        log(`inbox: mailbox renumbered (${state.uidValidity} → ${validity}) — resetting marker`);
        lastUid = 0;
      }

      const since = new Date(Date.now() - MAX_AGE_MINUTES * 60000);
      const found = await client.search({ from: user, since });

      // Belt and braces: if the marker is somehow above everything present, it
      // can only be stale, and keeping it would block every future trigger.
      const present = (found || []).map(Number);
      if (present.length && lastUid > Math.max(...present)) {
        log(`inbox: marker ${lastUid} is above every message — resetting`);
        lastUid = 0;
      }

      const uids = present.filter((u) => u > lastUid);
      if (!uids.length) {
        await writeState('trigger.json', { ...state, uidValidity: validity });
        return null;
      }

      // Advance the marker over everything examined, so an ignored message is
      // never re-examined on the next check.
      const highest = Math.max(...uids.map(Number));

      // Newest first. Sending two triggers in quick succession should act on
      // the one asked for most recently, not the one that happens to be oldest.
      // Only one runs per check — the marker advances past all of them.
      for (const uid of uids.slice(-10).reverse()) {
        const msg = await client.fetchOne(String(uid), {
          envelope: true,
          bodyParts: ['TEXT'],
        });

        const subject = msg?.envelope?.subject || '';
        const body = msg?.bodyParts?.get('text')?.toString('utf8') || '';
        const haystack = `${subject}\n${body}`;

        // Never treat the radar's own digests as commands, or it would trigger
        // itself every time it sends something.
        if (/AEO radar/i.test(subject)) continue;

        if (!hasSecret(haystack, secret)) {
          log(`inbox: ignoring "${subject.slice(0, 40)}" — no valid code`);
          continue;
        }

        const cmd = commandFor(haystack);
        if (!cmd) continue;
        const days = daysFor(subject);

        await client.messageFlagsAdd(String(uid), ['\\Seen']).catch(() => {});
        log(`inbox: trigger "${subject.slice(0, 40)}" → ${cmd}${cmd === 'review' ? ` (${days} days)` : ''}`);
        command = { cmd, days };
        break;
      }

      await writeState('trigger.json', {
        uidValidity: validity,
        lastUid: highest,
        at: new Date().toISOString(),
      });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return command;
}

export { commandFor, daysFor, hasSecret };
