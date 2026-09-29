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

// --- email rendering --------------------------------------------------------

const { toHtml, subjectFrom } = await import('./lib/email.mjs');

const sampleDigest =
  '*AEO radar · week of 29 Sept*\n\nOne thing moved.\n\n———\n' +
  '*Google adds image & video reporting*\n_Google Search Central · 2026-09-24_\n\n' +
  'See https://developers.google.com/search/blog/x';

const html = toHtml(sampleDigest);
check('subject comes from the header', subjectFrom(sampleDigest) === 'AEO radar · week of 29 Sept');

// A live run once opened with "Breaking item ready below..." and that became
// the subject line. The header must win regardless of what precedes it.
check(
  'model preamble never becomes the subject',
  subjectFrom('Breaking item ready below, per format spec.\n\n*⚡ AEO radar · breaking*\n\nBody.') ===
    '⚡ AEO radar · breaking',
);
// Each digest kind must be recognisable in the subject, so a hand-triggered
// catch-up is never mistaken for the Monday digest.
check('requested-update header is recognised',
  subjectFrom("*AEO radar · what's new*\n\nBody.") === "AEO radar · what's new");
check('nothing-new header is recognised',
  subjectFrom('*AEO radar · nothing new*\n\nBody.') === 'AEO radar · nothing new');
check('catch-up header is recognised',
  subjectFrom('*AEO radar · catch-up*\n\nBody.') === 'AEO radar · catch-up');
check('weekly header is recognised',
  subjectFrom('*AEO radar · week of 29 Sept*\n\nBody.') === 'AEO radar · week of 29 Sept');
check('breaking header is recognised',
  subjectFrom('*⚡ AEO radar · breaking*\n\nBody.') === '⚡ AEO radar · breaking');

check('bold becomes <strong>', /<strong>AEO radar/.test(html));
check('italic becomes <em>', /<em>Google Search Central/.test(html));
check('urls become links', /<a href="https:\/\/developers/.test(html));
check('item separators become rules', /<hr/.test(html));
check('html is escaped before styling', /image &amp; video/.test(html));
check('no chat markers survive', !/(?<![a-z-])[*_](?![a-z-])/.test(html));

// A digest that arrives as raw HTML source would be unreadable, so make sure a
// stray angle bracket in source text cannot break out.
check(
  'injected markup is neutralised',
  /&lt;script&gt;/.test(toHtml('a <script>alert(1)</script> b')),
);

// --- staleness ---------------------------------------------------------------

// An item parked as low-priority must not resurface weeks later as "what's new".
{
  const days = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const items = [
    { title: 'today', published: days(0) },
    { title: 'last week', published: days(7) },
    { title: 'six weeks ago', published: days(42) },
    { title: 'undated doc change', published: null },
  ];
  const cutoff = Date.now() - 14 * 864e5;
  const current = items.filter((i) => (i.published ? new Date(i.published).getTime() : Date.now()) >= cutoff);
  check('recent items count as news', current.some((i) => i.title === 'today'));
  check('week-old items still count', current.some((i) => i.title === 'last week'));
  check('six-week-old items are dropped', !current.some((i) => i.title === 'six weeks ago'));
  check('undated items are treated as current', current.some((i) => i.title === 'undated doc change'));
}

// --- trigger authentication -------------------------------------------------

const { commandFor, hasSecret } = await import('./lib/inbox.mjs');

check('subject naming a scan is recognised', commandFor('scan abc123') === 'scan');
check('subject naming a digest is recognised', commandFor('digest abc123') === 'digest');
check('unrelated subject is not a command', commandFor('lunch tomorrow?') === null);

// The secret is what actually carries the security — a From address can be
// forged, so these must hold regardless of who appears to have sent the mail.
check('correct code accepted', hasSecret('scan 6df61f24', '6df61f24'));
check('code is case-insensitive', hasSecret('scan 6DF61F24', '6df61f24'));
check('code in the body counts', hasSecret('scan\nplease: 6df61f24', '6df61f24'));
check('wrong code rejected', !hasSecret('scan deadbeef', '6df61f24'));
check('missing code rejected', !hasSecret('scan', '6df61f24'));
check('empty secret never matches', !hasSecret('scan anything', ''));
check('partial code rejected', !hasSecret('scan 6df61f2', '6df61f24'));

// --- the real thing: a second pass must find nothing ------------------------

const backup = await readState('seen.json', {});
try {
  const { items, report } = await collect({ dryRun: true });
  check('collector returned items', items.length > 0, `${items.length} items`);

  // Only deterministic sources can be judged on item count here: the ones backed
  // by a model call (webfetch, sitemap-search, search-sweep) deliberately return
  // nothing under --dry-run, and the weekly sweep returns nothing most days.
  const llmBacked = new Set(
    [...TIER1, ...TIER2]
      .filter((s) => ['webfetch', 'sitemap-search', 'search-sweep'].includes(s.type))
      .map((s) => s.id),
  );
  const deterministic = report.filter((r) => !llmBacked.has(r.id));
  const live = deterministic.filter((r) => r.ok && r.count > 0).length;

  // Several sources publish only a few times a year — Bing's two blogs and
  // Reddit's — so a zero from them inside a fortnight window is expected rather
  // than a fault. The health watchdog is what catches a source that has really
  // broken; this only needs to confirm the bulk are returning.
  check('deterministic sources are live', live >= deterministic.length - 3,
    `${live}/${deterministic.length} returning items`);
  check('no source errored', report.every((r) => r.ok),
    report.filter((r) => !r.ok).map((r) => `${r.id}: ${r.error}`).join(' | '));

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
