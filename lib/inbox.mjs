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
//
// This module only finds requests. It never runs them: each one is written to
// `state/pending.json` *before* the inbox marker moves past it, and the
// pipeline removes it only once a reply has actually gone out. A run that
// crashes, times out or loses the network part-way leaves the request pending,
// and the next check tries again — the difference between a trigger that is
// merely late and one that silently vanishes.

import { ImapFlow } from 'imapflow';
import { log, readState, writeState } from './util.mjs';

const COMMANDS = [
  // "review" looks back over a fixed window regardless of what has been sent
  // before; everything else means "tell me what's new since last time".
  { re: /\b(review|recap|catch\s*up|last\s*\d+\s*days?)\b/i, cmd: 'review' },
  { re: /\b(scan|radar|update|check|digest|news)\b/i, cmd: 'scan' },
];

// How old a trigger may be and still run. Replays are already impossible — the
// UID marker never looks at the same message twice — so this only has to cover
// a laptop that was asleep or offline when you sent the mail. Such a request is
// answered late, with a note saying so, rather than dropped.
const MAX_AGE_HOURS = 12;

// A mail from you that looks like a request but lacks the code gets one reply
// saying so, at most this often, so a typo never looks like a dead radar.
const NOTICE_EVERY_MINUTES = 30;
const MAX_DAYS = 90;

function commandFor(text = '') {
  return COMMANDS.find((c) => c.re.test(text))?.cmd || null;
}

/** "review 30" or "last 30 days" — how far back to look. Defaults to a fortnight. */
function daysFor(text = '') {
  const n = Number(text.match(/\b(\d{1,3})\s*days?\b/i)?.[1] || text.match(/\breview\s+(\d{1,3})\b/i)?.[1]);
  if (!Number.isFinite(n) || n < 1) return 14;
  return Math.min(n, MAX_DAYS);
}

function hasSecret(haystack, secret) {
  if (!secret) return false;
  return haystack.toLowerCase().includes(secret.toLowerCase());
}

/**
 * The part of a reply you actually typed. Replying to a radar email quotes it,
 * and the quoted text is full of words like "review" and "update" that would
 * otherwise be read as the command.
 */
function typedText(body = '') {
  const cut = body.search(/^(>|On .{0,200}wrote:\s*$|-{2,} ?Original Message|From: )/im);
  return (cut === -1 ? body : body.slice(0, cut)).trim();
}

/** The radar's own mail. Replies to it ("Re: AEO radar …") are yours, not its. */
function isRadarMail(subject, headerBlock) {
  if (/^x-aeo-radar:/im.test(headerBlock || '')) return true;
  return /^\s*[⚡🔧]?\s*AEO radar/i.test(subject);
}

/**
 * Work out what a message asks for. The subject wins over the body; the body
 * is only the part typed above any quote; and a reply to a radar email ignores
 * the subject it inherited.
 */
function parseRequest(subject = '', body = '') {
  const ownSubject = /AEO radar/i.test(subject) ? '' : subject;
  const typed = typedText(body);
  const cmd = commandFor(ownSubject) || commandFor(typed);
  const days = daysFor(`${ownSubject}\n${typed}`);
  return { cmd, days };
}

async function readBody(client, uid, structure) {
  // Find the plain-text part and let the download undo any base64 or
  // quoted-printable encoding. Reading the raw TEXT section instead leaves a
  // base64 body — which some phone mail apps send — unreadable, and the code
  // inside it invisible.
  const find = (node) => {
    if (!node) return null;
    if (node.type === 'text/plain') return node.part || '1';
    for (const child of node.childNodes || []) {
      const hit = find(child);
      if (hit) return hit;
    }
    return null;
  };
  const part = find(structure);
  if (!part) return '';
  try {
    const { content } = await client.download(String(uid), part, { uid: true });
    const chunks = [];
    for await (const c of content) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
  } catch (e) {
    log(`inbox: could not read the body of message ${uid}: ${e.message}`);
    return '';
  }
}

/** Addresses a request may come from: you, plus anywhere the radar mails to. */
function senders() {
  return [...new Set(
    [process.env.SMTP_USER, process.env.EMAIL_TO, ...(process.env.TRIGGER_FROM || '').split(',')]
      .map((s) => (s || '').trim().toLowerCase())
      .filter(Boolean),
  )];
}

/**
 * Look for new trigger mail and add each request to `state/pending.json`.
 * Returns the number of requests added. Mail that looks like a request but
 * cannot run adds a notice instead, so it still gets an answer.
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
    // The defaults let one dead connection hang a check for a quarter of an
    // hour, during which no other check can start.
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 90000,
  });

  // A dropped connection is emitted as an 'error' event. Unhandled, it killed
  // the process with a stack trace instead of failing this one check cleanly.
  client.on('error', (err) => log(`inbox: connection error: ${err.message}`));

  await client.connect();
  let added = 0;

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Track the highest message UID already looked at, rather than relying on
      // the unread flag. Opening your own inbox to see whether a reply arrived
      // marks the trigger mail read, and a flag-based check then skips it — a
      // trigger that fails precisely because you went looking for its result.
      const state = await readState('trigger.json', {});
      const validity = String(client.mailbox?.uidValidity ?? '');

      // UIDs are only comparable within one UIDVALIDITY, and an earlier version
      // stored sequence numbers (which shift whenever mail is archived). Either
      // way the old marker means nothing; start from the newest message.
      let lastUid = Number(state.lastUid || 0);
      if (state.ids !== 'uid' || (state.uidValidity && state.uidValidity !== validity)) {
        lastUid = Math.max(0, Number(client.mailbox?.uidNext || 1) - 1);
        log(`inbox: starting a UID marker at ${lastUid}`);
      }

      // IMAP's SINCE compares dates only, not times, so the age limit is
      // enforced below against each message's arrival time.
      const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600e3);
      const found = new Set();
      for (const from of senders()) {
        for (const uid of (await client.search({ from, since: cutoff }, { uid: true })) || []) {
          found.add(Number(uid));
        }
      }
      const uids = [...found].filter((u) => u > lastUid).sort((a, b) => a - b);

      const pending = await readState('pending.json', []);
      let noticeAt = Number(state.noticeAt || 0);

      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), {
          envelope: true,
          internalDate: true,
          bodyStructure: true,
          headers: ['x-aeo-radar'],
        }, { uid: true });
        if (!msg) continue;

        // `state/` is committed and pushed, and the repository is public: the
        // code must never be stored, only a masked copy of the subject.
        const rawSubject = msg.envelope?.subject || '';
        const subject = rawSubject.replace(new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<code>');
        const arrived = new Date(msg.internalDate || 0);
        const label = `"${subject.slice(0, 40)}"`;

        // Never treat the radar's own mail as a command, or it would trigger
        // itself every time it sends something.
        if (isRadarMail(rawSubject, msg.headers?.toString('utf8'))) continue;
        if (arrived < cutoff) {
          log(`inbox: ignoring ${label} — older than ${MAX_AGE_HOURS} hours`);
          continue;
        }
        if (pending.some((p) => p.uid === uid)) continue;

        const body = await readBody(client, uid, msg.bodyStructure);
        const { cmd, days } = parseRequest(rawSubject, body);
        const authorised = hasSecret(`${rawSubject}\n${body}`, secret);

        if (!authorised) {
          // Only mail that clearly meant to be a request gets a reply; the rest
          // of your mail to yourself is none of the radar's business.
          if (!commandFor(rawSubject)) continue;
          log(`inbox: ${label} looks like a request but has no valid code`);
          if (Date.now() - noticeAt > NOTICE_EVERY_MINUTES * 60000) {
            pending.push({ uid, kind: 'notice', reason: 'no-code', subject, arrived: arrived.toISOString(), attempts: 0 });
            noticeAt = Date.now();
            added++;
          }
          continue;
        }

        if (!cmd) {
          log(`inbox: ${label} has the code but no command I recognise`);
          pending.push({ uid, kind: 'notice', reason: 'no-command', subject, arrived: arrived.toISOString(), attempts: 0 });
          added++;
          continue;
        }

        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
        log(`inbox: trigger ${label} → ${cmd}${cmd === 'review' ? ` (${days} days)` : ''}`);
        pending.push({ uid, kind: cmd, days, subject, arrived: arrived.toISOString(), attempts: 0 });
        added++;
      }

      // Pending first, marker second. Crashing between the two re-reads a
      // message next time (and the uid check above stops it being queued
      // twice); the other order could lose it.
      if (added) await writeState('pending.json', pending);
      // Only touch the file when something moved: `state/` is committed after
      // every run, and a timestamp rewritten every two minutes is a commit
      // every two minutes.
      const next = {
        ids: 'uid',
        uidValidity: validity,
        lastUid: Math.max(lastUid, ...uids),
        noticeAt,
      };
      const moved = ['ids', 'uidValidity', 'lastUid', 'noticeAt'].some((k) => state[k] !== next[k]);
      if (moved) await writeState('trigger.json', { ...next, at: new Date().toISOString() });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return added;
}

export { commandFor, daysFor, hasSecret, parseRequest, typedText, isRadarMail };
