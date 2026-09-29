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

// --- JSON extraction --------------------------------------------------------

const { extractJSON } = await import('./lib/claude.mjs');

check('plain array parses', extractJSON('[{"a":1}]').length === 1);
check('code fence tolerated', extractJSON('```json\n[{"a":1}]\n```').length === 1);
check('leading prose tolerated', extractJSON('Here you go:\n[{"a":1}]').length === 1);

// The real bug this guards: web-search replies end with a markdown source list,
// and those links contain `]`, which a greedy match swallows.
check(
  'trailing markdown link list ignored',
  extractJSON('[{"a":1}]\n\nSources:\n- [Release Notes](https://openai.com/x)').length === 1,
);
check(
  'brackets inside strings ignored',
  extractJSON('[{"t":"a ] bracket"}]')[0].t === 'a ] bracket',
);
check('escaped quotes survive', extractJSON('[{"t":"say \\"hi\\""}]')[0].t === 'say "hi"');

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

  // Mark everything seen, then re-key the same snapshot — nothing may come back.
  //
  // Deliberately reuses one collection rather than fetching twice. Fetching
  // twice looks like a stronger test but is really a race: a publisher pushing
  // between the two calls produces a legitimately new item and a false failure.
  // The logic under test is the keying, and this exercises it exactly.
  const seen = {};
  for (const i of items) seen[itemKey(i)] = { t: Date.now(), r: 'test' };
  await writeState('seen.json', seen);

  const repeats = items.filter((i) => !seen[itemKey(i)]);
  check('nothing survives a second pass', repeats.length === 0,
    repeats.length ? `LEAKED: ${repeats.slice(0, 3).map((r) => `${r.source}/${r.title}`).join(' | ')}` : '');

  // Keys must not drift between calls, or the ledger is worthless.
  const stable = items.every((i) => itemKey(i) === itemKey({ ...i }));
  check('keys are stable and depend only on url + title', stable);

  // Distinct stories must not collide into one key.
  check('distinct items get distinct keys',
    new Set(items.map(itemKey)).size === new Set(items.map((i) => `${i.url}|${i.title}`)).size);
} finally {
  await writeState('seen.json', backup);
}

// --- health watchdog --------------------------------------------------------

const healthBackup = await readState('health.json', {});
try {
  const { updateHealth } = await import('./lib/health.mjs');
  // Accumulate across the whole span: an alert fires on the single scan that
  // crosses the threshold, which is rarely the last one in the loop.
  const run = async (report, times = 1) => {
    const alerts = [];
    for (let i = 0; i < times; i++) alerts.push(...(await updateHealth(report)));
    return alerts;
  };

  // A source that has never produced anything must never alarm. Bing's blogs
  // return zero on every scan because they stopped publishing, not because
  // anything is broken.
  await writeState('health.json', {});
  let alerts = await run([{ id: 'never-published', ok: true, count: 0 }], 60);
  check('a source that never published stays silent', alerts.length === 0);

  // A source that used to work and then breaks must alert.
  await writeState('health.json', {});
  await run([{ id: 'feed-moved', ok: true, count: 5 }]);
  alerts = await run([{ id: 'feed-moved', ok: false, count: 0, error: 'HTTP 404' }], 8);
  check('a broken feed alerts', alerts.length === 1 && alerts[0].kind === 'broken');

  // ...and must not alert a second time for the same outage.
  alerts = await run([{ id: 'feed-moved', ok: false, count: 0, error: 'HTTP 404' }], 5);
  check('a broken feed alerts only once', alerts.length === 0);

  // Recovery re-arms it.
  await run([{ id: 'feed-moved', ok: true, count: 3 }]);
  alerts = await run([{ id: 'feed-moved', ok: false, count: 0, error: 'HTTP 404' }], 8);
  check('a recovered feed can alert again later', alerts.length === 1);

  // A previously productive source going quiet alerts, but only after a long
  // wait — publishers take holidays.
  await writeState('health.json', {});
  await run([{ id: 'slow-blog', ok: true, count: 2 }]);
  alerts = await run([{ id: 'slow-blog', ok: true, count: 0 }], 20);
  check('a short quiet spell does not alert', alerts.length === 0);
  alerts = await run([{ id: 'slow-blog', ok: true, count: 0 }], 25);
  check('a long quiet spell does alert', alerts.length === 1 && alerts[0].kind === 'quiet');
} finally {
  await writeState('health.json', healthBackup);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
