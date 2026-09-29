// Show the trigger code, creating one if .env does not have it yet.
//   npm run trigger:code
//   npm run trigger:code -- --new     rotate it
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './lib/util.mjs';

const ENV = join(ROOT, '.env');
const rotate = process.argv.includes('--new');

let env = '';
try {
  env = await readFile(ENV, 'utf8');
} catch {
  console.error('No .env found. Run `npm run setup` first.');
  process.exit(1);
}

const current = env.match(/^TRIGGER_SECRET=(.+)$/m)?.[1]?.trim();
let secret = current;

if (!secret || rotate) {
  // Short enough to type on a phone, long enough that guessing is hopeless:
  // 8 hex characters is over four billion combinations, against a trigger
  // that is only checked once every two minutes.
  secret = randomBytes(4).toString('hex');
  const next = current
    ? env.replace(/^TRIGGER_SECRET=.*$/m, `TRIGGER_SECRET=${secret}`)
    : `${env.trimEnd()}\nTRIGGER_SECRET=${secret}\n`;
  await writeFile(ENV, next);
  console.log(current ? '\nRotated. The old code no longer works.' : '\nCreated a trigger code.');
}

console.log(`
Your trigger code:  ${secret}

To run a scan from your phone, email yourself:

  Subject:  scan ${secret}

For the weekly digest early:

  Subject:  digest ${secret}

The code must appear in the subject or the body. Mail without it is ignored,
even if it comes from your own address. Rotate with:

  npm run trigger:code -- --new
`);
