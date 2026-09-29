import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collect } from './collect.mjs';
import { watch } from './watch.mjs';
import { passesPrefilter, prefilterWeight } from './lib/filter.mjs';
import { askClaude, askClaudeJSON } from './lib/claude.mjs';
import { send } from './lib/channel.mjs';
import { updateHealth, formatHealthAlert } from './lib/health.mjs';
import { TIER1, TIER2, TIER3 } from './sources.mjs';
import {
  ROOT, itemKey, readState, writeState, truncate, fetchText, htmlToText, log,
} from './lib/util.mjs';

// Caps. Their job is to bound the worst case, not the normal one — a typical
// scan sends nothing to the model at all.
const MAX_ITEMS_PER_GATE = 15;
const MAX_DIGEST_ITEMS = 8;
const BREAKING_SCORE = 4;
const MAX_BREAKING = 2;
const BACKFILL_DAYS = 14;
// How old an item may be and still count as news. Anything parked longer than
// this was never urgent and has stopped being current — it must not resurface
// under a "what's new" heading.
const MAX_NEWS_AGE_DAYS = 14;
const SEEN_RETENTION_DAYS = 400;

const SOURCE_BY_ID = Object.fromEntries([...TIER1, ...TIER2].map((s) => [s.id, s]));
const NAME_BY_ID = Object.fromEntries(
  [...TIER1, ...TIER2, ...TIER3].map((s) => [s.id, s.name]),
);
const MAX_REJECTION_LOG = 300;
const NAME_COUNT = new Set([...TIER1, ...TIER2, ...TIER3].map((s) => s.id)).size;

async function loadEnv() {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env — env vars may come from the environment instead */
  }
}

async function prompt(name, items) {
  const tpl = await readFile(join(ROOT, 'prompts', name), 'utf8');
  return tpl.replace('{{ITEMS}}', JSON.stringify(items, null, 2));
}

/** Everything free happens here: fetch, dedupe, keyword filter. */
async function gatherNew({ dryRun }) {
  const [{ items: feedItems, report: feedReport }, { items: docChanges, report: watchReport }] =
    await Promise.all([collect({ dryRun }), watch()]);

  const report = [...feedReport, ...watchReport];
  const seen = await readState('seen.json', {});
  const all = [...feedItems, ...docChanges];

  const fresh = [];
  for (const item of all) {
    const key = itemKey(item);
    if (seen[key]) continue; // seen once, never sent again
    // Documentation diffs always pass — the watcher only fires on real edits.
    if (!item.isDocChange && !passesPrefilter(item, SOURCE_BY_ID[item.source])) {
      seen[key] = { t: Date.now(), r: 'prefilter' };
      continue;
    }
    item._key = key;
    fresh.push(item);
  }

  fresh.sort(
    (a, b) =>
      prefilterWeight(b) - prefilterWeight(a) ||
      (b.authority || 0) - (a.authority || 0) ||
      new Date(b.published || 0) - new Date(a.published || 0),
  );

  const onTopic = all.filter(
    (i) => i.published && (i.isDocChange || passesPrefilter(i, SOURCE_BY_ID[i.source])),
  );
  const newest = onTopic.sort((a, b) => new Date(b.published) - new Date(a.published))[0] || null;

  return { fresh: diversify(fresh), seen, report, newest };
}

/**
 * arXiv can publish a dozen GEO papers in a week and every one of them scores
 * highly on keywords, which would push a Google ranking update out of the gate
 * batch entirely. Cap each source's share so the batch stays representative;
 * anything displaced simply waits for the next scan.
 */
function diversify(items, perSource = 4) {
  const counts = {};
  const primary = [];
  const overflow = [];
  for (const it of items) {
    counts[it.source] = (counts[it.source] || 0) + 1;
    (counts[it.source] <= perSource ? primary : overflow).push(it);
  }
  return [...primary, ...overflow];
}

/**
 * Some feeds ship a headline and nothing else. The gate then has to judge on a
 * title alone and reasonably refuses — which is how a real Google item about
 * publisher Search profiles got dropped as "too vague to assess".
 *
 * Fetching the page first is free (no model call), so do it for any thin item
 * from a source worth listening to, and let the gate judge on actual content.
 */
async function enrichThin(items, minLength = 200, minAuthority = 7) {
  await Promise.all(
    items.map(async (item) => {
      if (item.isDocChange || item.summary?.length >= minLength) return;
      if ((item.authority || 0) < minAuthority) return;
      try {
        const html = await fetchText(item.url, { timeout: 15000 });
        const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
        const body = htmlToText(main ? main[1] : html);
        if (body.length > (item.summary?.length || 0)) item.summary = truncate(body, 1500);
      } catch {
        /* leave the thin summary alone; the gate will judge what it has */
      }
    }),
  );
  return items;
}

/** The only expensive step, and it runs once per scan for all items together. */
async function gate(items) {
  const payload = items.map((it, i) => ({
    id: i,
    source: it.sourceName,
    title: it.title,
    published: it.published,
    summary: truncate(it.summary, 1500),
    url: it.url,
  }));

  const verdicts = await askClaudeJSON(await prompt('gate.md', payload), {
    model: 'haiku',
    timeout: 180000,
  });

  const dropped = new Set();
  for (const v of verdicts) for (const d of v.duplicates || []) dropped.add(d);

  const kept = verdicts
    .filter((v) => v.keep && !dropped.has(v.id) && items[v.id])
    .map((v) => ({
      ...items[v.id],
      score: Number(v.score) || 1,
      category: v.category || 'policy',
      why: v.why || '',
      alsoSeenIn: (v.duplicates || []).map((d) => items[d]?.sourceName).filter(Boolean),
    }));

  const rejected = verdicts
    .filter((v) => !v.keep && items[v.id])
    .map((v) => ({
      at: new Date().toISOString().slice(0, 10),
      source: items[v.id].sourceName,
      title: items[v.id].title,
      why: v.why || '',
      url: items[v.id].url,
    }));

  return { kept, rejected };
}

/**
 * The gate decides what you never see, so keep a skimmable record of what it
 * threw away. Not sent anywhere — it exists so a wrong call can be caught by
 * reading `state/rejected.json` occasionally.
 */
async function logRejections(rejected) {
  if (!rejected.length) return;
  const existing = await readState('rejected.json', []);
  const merged = [...rejected, ...existing].slice(0, MAX_REJECTION_LOG);
  await writeState('rejected.json', merged);
}

async function writeUp(items, kind) {
  const payload = items.map((it) => ({
    headline: it.title,
    source: it.sourceName,
    date: it.published?.slice(0, 10) || null,
    url: it.url,
    detail: truncate(it.summary, 1500),
    impact: it.score,
    category: it.category,
    alsoSeenIn: it.alsoSeenIn,
  }));
  const tpl = await prompt('writeup.md', payload);
  const raw = await askClaude(`${tpl}\n\nThis is a ${kind}.`, {
    model: 'sonnet',
    timeout: 300000,
  });
  return withSources(stripPreamble(raw), items);
}

/**
 * Guarantee every claim is traceable to its primary source.
 *
 * The write-up format asks for a link under each item, but one live digest came
 * back with four items and no links at all. Since the whole premise is that you
 * can check the original, the links cannot depend on the model remembering —
 * any URL missing from the body is appended as a numbered source list.
 */
function withSources(text, items) {
  const missing = items.filter((it) => it.url && !text.includes(it.url));
  if (!missing.length) return text;

  const list = missing
    .map((it, i) => `${i + 1}. ${it.title}\n${it.url}`)
    .join('\n');
  return `${text}\n\n———\n*Sources*\n${list}`;
}

/**
 * Models occasionally announce themselves before doing the work — one live run
 * opened with "Breaking item ready below, plain English per format spec.",
 * which then became the email subject. The header line is unmistakable, so cut
 * everything above it rather than trusting the instruction to hold every time.
 */
function stripPreamble(text) {
  const headerAt = text.search(/^\s*\*[⚡📌]?\s*AEO radar/m);
  return (headerAt > 0 ? text.slice(headerAt) : text).trim();
}

/** Keep a copy of what went out, so a digest can be re-read without a mailbox. */
async function saveSent(kind, text) {
  const stamp = new Date().toISOString();
  await writeFile(
    join(ROOT, 'state', 'last-sent.md'),
    `<!-- ${kind} · ${stamp} -->\n\n${text}\n`,
  );
}

/**
 * Separate items that are still news from ones that have gone stale.
 *
 * A low-priority item can sit in the queue for a while, which is fine — until
 * it is old enough that presenting it as "what's new" is simply wrong. One
 * August item resurfacing in late September under that heading is what this
 * exists to prevent.
 */
function splitByAge(items, maxDays = MAX_NEWS_AGE_DAYS) {
  const cutoff = Date.now() - maxDays * 864e5;
  const current = [];
  const stale = [];
  for (const it of items) {
    // Undated items are index scrapes and documentation diffs, both of which
    // are current by construction.
    const when = it.published ? new Date(it.published).getTime() : Date.now();
    (when >= cutoff ? current : stale).push(it);
  }
  return { current, stale };
}

/**
 * The reply when a requested check turns up nothing.
 *
 * "Nothing new" on its own is indistinguishable from a broken radar, so this
 * has to show its working: how many sources were actually reached, when, and
 * what the most recent item in the feeds is. If that last line is recent, the
 * feeds are current and the quiet is real.
 */
function nothingNewMessage(report, newest) {
  const ok = report.filter((r) => r.ok).length;
  const failed = report.filter((r) => !r.ok);
  const when = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });

  const lines = [
    `*AEO radar · nothing new*`,
    ``,
    `Checked ${ok} of ${report.length} sources at ${when}. No new updates.`,
    ``,
    `———`,
    `*Feeds are current*`,
  ];

  if (newest) {
    const date = new Date(newest.published).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    lines.push(
      ``,
      `The most recent item anywhere in your sources is from ${date}:`,
      ``,
      `_${newest.title}_`,
      `${newest.sourceName}`,
      newest.url,
      ``,
      `You have already had everything up to that point. Nothing has been`,
      `published since.`,
    );
  } else {
    lines.push(``, `No dated items in the current window.`);
  }

  if (failed.length) {
    lines.push(
      ``,
      `———`,
      `*Could not reach*`,
      failed.map((f) => `· ${NAME_BY_ID[f.id] || f.id}`).join('\n'),
    );
  }

  return lines.join('\n');
}

/** Date of the most recent thing actually sent, for the "nothing new" note. */
async function latestSentDate() {
  const seen = await readState('seen.json', {});
  const times = Object.values(seen).map((v) => v.t || 0).filter(Boolean);
  if (!times.length) return 'the last check';
  return new Date(Math.max(...times)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long',
  });
}

function prune(seen) {
  const cutoff = Date.now() - SEEN_RETENTION_DAYS * 864e5;
  for (const [k, v] of Object.entries(seen)) if ((v.t || 0) < cutoff) delete seen[k];
  return seen;
}

// ---------------------------------------------------------------- commands

async function cmdScan({ dryRun, manual = false }) {
  const { fresh, seen, report, newest } = await gatherNew({ dryRun });
  const failed = report.filter((r) => !r.ok);
  if (failed.length) log(`sources failed: ${failed.map((f) => f.id).join(', ')}`);
  log(`${fresh.length} new item(s) past the free filters`);

  // Health is tracked on every scan, including quiet ones — a source going
  // dark is precisely the thing a quiet scan would otherwise hide.
  const healthAlerts = dryRun ? [] : await updateHealth(report);
  if (healthAlerts.length) {
    await send(formatHealthAlert(healthAlerts, NAME_BY_ID));
    log(`sent source-health notice for: ${healthAlerts.map((a) => a.id).join(', ')}`);
  }

  if (dryRun) {
    for (const it of fresh.slice(0, 20)) console.log(`  [${it.sourceName}] ${it.title}`);
    log('dry run: stopping before any model call');
    return;
  }

  let kept = [];
  if (fresh.length) {
    const batch = await enrichThin(fresh.slice(0, MAX_ITEMS_PER_GATE));
    const gated = await gate(batch);
    kept = gated.kept;
    await logRejections(gated.rejected);
    log(`gate kept ${kept.length}/${batch.length}`);

    // Everything we looked at is now permanently seen, kept or not.
    for (const it of batch) seen[it._key] = { t: Date.now(), r: 'gated' };
  }

  const strip = ({ _key, ...rest }) => rest;

  if (manual) {
    // You asked, so you get an answer. A hand-triggered check sends everything
    // it found plus anything already waiting, most urgent first — and says so
    // plainly when there is nothing, rather than leaving you wondering whether
    // it worked. The urgency threshold exists to avoid pestering you on the
    // automatic runs; it has no business filtering a reply you requested.
    const waiting = await readState('queue.json', []);
    const { current, stale } = splitByAge([...kept.map(strip), ...waiting]);
    if (stale.length) log(`dropped ${stale.length} stale item(s) from the queue`);

    const all = current.sort(
      (a, b) => b.score - a.score || (b.authority || 0) - (a.authority || 0),
    );

    const text = all.length
      ? await writeUp(all.slice(0, MAX_DIGEST_ITEMS), 'requested update')
      : nothingNewMessage(report, newest);

    await send(text);
    await saveSent('requested update', text);
    await writeState('queue.json', []);
    await writeState('seen.json', prune(seen));
    log(`sent requested update (${all.length} item(s))`);
    return;
  }

  const urgent = kept.filter((k) => k.score >= BREAKING_SCORE);
  const later = kept.filter((k) => k.score < BREAKING_SCORE);

  if (urgent.length) {
    // Several high-impact items landing in one scan is a backlog, not an
    // emergency — a catch-up reads better than four "breaking" alarms.
    const kind = urgent.length > MAX_BREAKING ? 'catch-up digest' : 'breaking alert';
    const text = await writeUp(urgent, kind);
    await send(text);
    await saveSent(kind, text);
    log(`sent ${urgent.length} item(s) as ${kind}`);
  }

  if (later.length) {
    const queue = await readState('queue.json', []);
    queue.push(...later.map(strip));
    await writeState('queue.json', queue);
    log(`queued ${later.length} item(s) for the weekly digest`);
  }

  if (!kept.length) log('nothing new — staying silent');
  await writeState('seen.json', prune(seen));
}

async function cmdDigest({ dryRun }) {
  const queue = await readState('queue.json', []);
  if (!queue.length) {
    log('queue empty — no digest sent');
    return;
  }

  const { current, stale } = splitByAge(queue);
  if (stale.length) log(`dropped ${stale.length} stale item(s) from the digest`);
  if (!current.length) {
    await writeState('queue.json', []);
    log('everything queued had gone stale — no digest sent');
    return;
  }

  const ranked = [...current].sort((a, b) => b.score - a.score || b.authority - a.authority);
  const featured = ranked.slice(0, MAX_DIGEST_ITEMS);
  const rest = ranked.slice(MAX_DIGEST_ITEMS);

  if (dryRun) {
    console.log(featured.map((f) => `[${f.score}] ${f.title}`).join('\n'));
    return;
  }

  let text = await writeUp(featured, 'weekly digest');
  if (rest.length) {
    text +=
      `\n———\n*Also this week*\n` +
      rest.map((r) => `· ${r.title} — ${r.sourceName}\n${r.url}`).join('\n');
  }

  await send(text);
  await saveSent('weekly digest', text);
  await writeState('queue.json', []);
  log(`digest sent (${featured.length} featured, ${rest.length} listed)`);
}

/**
 * Full pipeline, printed to the terminal instead of sent, and without touching
 * the ledger. Use it to tune prompts/writeup.md against real items.
 */
async function cmdPreview() {
  const { fresh } = await gatherNew({ dryRun: false });
  if (!fresh.length) return log('nothing new to preview');

  const { kept, rejected } = await gate(await enrichThin(fresh.slice(0, MAX_ITEMS_PER_GATE)));
  log(`gate kept ${kept.length}, rejected ${rejected.length}`);
  for (const r of rejected) log(`  rejected: [${r.source}] ${r.title} — ${r.why}`);
  if (!kept.length) return;

  const ranked = kept.sort((a, b) => b.score - a.score).slice(0, MAX_DIGEST_ITEMS);
  console.log('\n' + (await writeUp(ranked, 'weekly digest')));
  log('\npreview only — nothing sent, ledger untouched');
}

/**
 * Cold start. Fingerprint the watched pages, then mark everything older than
 * BACKFILL_DAYS as already seen so the first real scan produces one catch-up
 * digest instead of a year of history.
 */
async function cmdInit() {
  await watch({ seed: true });
  const { items } = await collect({ dryRun: true });
  const seen = await readState('seen.json', {});
  const cutoff = Date.now() - BACKFILL_DAYS * 864e5;
  let marked = 0;
  for (const item of items) {
    const old = item.published && new Date(item.published).getTime() < cutoff;
    if (old) {
      seen[itemKey(item)] = { t: Date.now(), r: 'backfill' };
      marked++;
    }
  }
  await writeState('seen.json', seen);
  await writeState('queue.json', []);
  log(`initialised: ${marked} historical items marked seen, watchers fingerprinted`);
  log(`run \`npm run scan\` to produce the first catch-up batch`);
}

/**
 * Check for an emailed trigger and run whatever it asks for. Runs every couple
 * of minutes; almost always finds nothing and exits having done one small IMAP
 * round-trip, so it costs nothing in model usage.
 */
async function cmdListen(opts) {
  const { checkInbox } = await import('./lib/inbox.mjs');
  const command = await checkInbox();
  if (!command) return;
  // Any trigger word means the same thing: tell me what's new. There is no
  // useful distinction to make the reader remember.
  log(`triggered by email (${command}): sending a requested update`);
  await cmdScan({ ...opts, manual: true });
}

const cmd = process.argv[2] || 'scan';
const opts = { dryRun: process.argv.includes('--dry-run') };
await loadEnv();

try {
  if (cmd === 'scan') await cmdScan(opts);
  else if (cmd === 'digest') await cmdDigest(opts);
  else if (cmd === 'init') await cmdInit();
  else if (cmd === 'preview') await cmdPreview();
  else if (cmd === 'listen') await cmdListen(opts);
  else {
    console.error(`usage: node pipeline.mjs [scan|digest|init|preview|listen] [--dry-run]`);
    process.exit(2);
  }
} catch (e) {
  log('FAILED:', e.message);
  process.exit(1);
}
