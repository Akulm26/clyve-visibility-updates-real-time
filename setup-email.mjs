import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { ROOT } from './lib/util.mjs';

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log(`
Email setup
───────────
This needs an app password, not your normal Gmail password. Google blocks
ordinary passwords for this, so a normal one will simply fail to log in.

To create one:
  1. Go to  https://myaccount.google.com/apppasswords
  2. If it says app passwords are unavailable, turn on 2-Step Verification
     first at  https://myaccount.google.com/signinoptions/two-step-verification
     then come back
  3. Name it anything ("AEO radar") and create it
  4. Google shows a 16-character password like  abcd efgh ijkl mnop
     Spaces don't matter — paste it however it appears

Using another provider? Enter its SMTP host when asked.
`);

const ask = async (q, fallback = '') => {
  const a = (await rl.question(fallback ? `${q} [${fallback}]: ` : `${q}: `)).trim();
  return a || fallback;
};

const user = await ask('Your email address');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user)) {
  console.error('That does not look like an email address. Aborting.');
  process.exit(1);
}

const pass = (await ask('App password')).replace(/\s+/g, '');
if (pass.length < 8) {
  console.error('That password looks too short to be an app password. Aborting.');
  process.exit(1);
}

const to = await ask('Send digests to', user);
const isGmail = /@(gmail|googlemail)\.com$/i.test(user);
const host = await ask('SMTP host', isGmail ? 'smtp.gmail.com' : '');
const port = await ask('SMTP port', '465');

if (!host) {
  console.error('An SMTP host is required. Aborting.');
  process.exit(1);
}

// Preserve any settings already in .env (a Telegram token, for instance) so
// switching channels later does not mean setting everything up again.
let existing = '';
try {
  existing = await readFile(join(ROOT, '.env'), 'utf8');
} catch {
  /* first run */
}
const keep = existing
  .split('\n')
  .filter((l) => l.trim() && !/^(CHANNEL|SMTP_|EMAIL_|TRIGGER_SECRET)/.test(l.trim()))
  .join('\n');

const triggerSecret =
  existing.match(/^TRIGGER_SECRET=(.+)$/m)?.[1]?.trim() || randomBytes(4).toString('hex');

await writeFile(
  join(ROOT, '.env'),
  `${keep ? keep + '\n' : ''}CHANNEL=email
SMTP_HOST=${host}
SMTP_PORT=${port}
SMTP_USER=${user}
SMTP_PASS=${pass}
EMAIL_TO=${to}
TRIGGER_SECRET=${triggerSecret}
`,
);

console.log('\nSaved to .env. Sending a test email...');

process.env.CHANNEL = 'email';
process.env.SMTP_HOST = host;
process.env.SMTP_PORT = port;
process.env.SMTP_USER = user;
process.env.SMTP_PASS = pass;
process.env.EMAIL_TO = to;

try {
  const { send } = await import('./lib/email.mjs');
  await send(
    `*AEO radar connected*\n\n` +
      `This channel is live. You will only hear from it when something actually happens — ` +
      `no "quiet week" messages.\n\n` +
      `Updates arrive as a Monday digest, with anything urgent sent the moment it lands.`,
  );
  console.log(`
Sent — check ${to} (look in spam the first time).

Next:
  Trigger a scan from your phone by emailing yourself:
    Subject:  scan ${triggerSecret}

  npm run init            seed the ledger so you get one catch-up, not a year
  npm run scan            first real run
  ./install-schedule.sh   install the timers
`);
} catch (e) {
  console.error(`
Could not send: ${e.message}

Most likely causes:
  · Used a normal password instead of an app password
  · 2-Step Verification is not enabled on the account
  · A typo in the app password (spaces are fine, other characters are not)

Fix and run  npm run setup:email  again.`);
  process.exitCode = 1;
}

rl.close();
