// Deterministic checks. No model calls, no network writes, nothing sent.
//   node test.mjs
import { collect } from './collect.mjs';
import { passesPrefilter } from './lib/filter.mjs';
import { TIER1, TIER2 } from './sources.mjs';
import { itemKey, canonical, readState, writeState } from './lib/util.mjs';

const SOURCE_BY_ID = Object.fromEntries([...TIER1, ...TIER2].map((s) => [s.id, s]));
let failures = 0;

function check(name, pass, detail = '') {
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
  if (!pass) failures++;
}

// --- canonicalisation -------------------------------------------------------

check(
  'tracking params ignored',
  canonical('https://example.com/a?utm_source=x') === canonical('https://example.com/a'),
);
check(
  'www, trailing slash and fragment ignored',
  canonical('https://www.example.com/a/#top') === canonical('https://example.com/a'),
);
check(
  'genuinely different paths stay different',
  canonical('https://example.com/a') !== canonical('https://example.com/b'),
);

// --- dedupe keys ------------------------------------------------------------

const a = { url: 'https://example.com/post?utm_medium=rss', title: 'Hello  World!' };
const b = { url: 'https://www.example.com/post/', title: 'hello world' };
check('same story from two feeds collapses to one key', itemKey(a) === itemKey(b));

// --- the real thing: a second pass must find nothing ------------------------

const backup = await readState('seen.json', {});
try {
  const { items, report } = await collect({ dryRun: true });
  check('collector returned items', items.length > 0, `${items.length} items`);

  const ok = report.filter((r) => r.ok && r.count > 0).length;
  check('most sources are live', ok >= report.length - 4, `${ok}/${report.length} returning items`);

  const relevant = items.filter((i) => passesPrefilter(i, SOURCE_BY_ID[i.source]));
  check('prefilter removes noise but keeps signal', relevant.length > 0 && relevant.length < items.length,
    `${relevant.length}/${items.length} kept`);

  // Mark everything seen, then collect again — nothing may come back.
  const seen = {};
  for (const i of items) seen[itemKey(i)] = { t: Date.now(), r: 'test' };
  await writeState('seen.json', seen);

  const { items: second } = await collect({ dryRun: true });
  const repeats = second.filter((i) => !seen[itemKey(i)]);
  check('second pass yields no repeats', repeats.length === 0,
    repeats.length ? `LEAKED: ${repeats.slice(0, 3).map((r) => r.title).join(' | ')}` : '');

  // Keys must be stable across runs, or the ledger is worthless.
  const keysA = items.map(itemKey).sort();
  const keysB = second.map(itemKey).sort();
  check('keys are stable across collections',
    JSON.stringify(keysA) === JSON.stringify(keysB));
} finally {
  await writeState('seen.json', backup);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
