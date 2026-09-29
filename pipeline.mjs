import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collect } from './collect.mjs';
import { watch } from './watch.mjs';
import { passesPrefilter, prefilterWeight } from './lib/filter.mjs';
import { askClaude, askClaudeJSON } from './lib/claude.mjs';
import { send } from './lib/channel.mjs';
import { updateHealth, formatHealthAlert } from './lib/health.mjs';
import { TIER1, TIER2, TIER3 } from './sources.mjs';
import { ROOT, itemKey, readState, writeState, truncate, log } from './lib/util.mjs';

// Caps. Their job is to bound the worst case, not the normal one — a typical
// scan sends nothing to the model at all.
const MAX_ITEMS_PER_GATE = 15;
const MAX_DIGEST_ITEMS = 8;
const BREAKING_SCORE = 4;
const BACKFILL_DAYS = 14;
const SEEN_RETENTION_DAYS = 400;

const SOURCE_BY_ID = Object.fromEntries([...TIER1, ...TIER2].map((s) => [s.id, s]));
const NAME_BY_ID = Object.fromEntries(
  [...TIER1, ...TIER2, ...TIER3].map((s) => [s.id, s.name]),
);
const MAX_REJECTION_LOG = 300;

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

  return { fresh: diversify(fresh), seen, report };
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
  return askClaude(`${tpl}\n\nThis is a ${kind}.`, { model: 'sonnet', timeout: 300000 });
}

function prune(seen) {
  const cutoff = Date.now() - SEEN_RETENTION_DAYS * 864e5;
  for (const [k, v] of Object.entries(seen)) if ((v.t || 0) < cutoff) delete seen[k];
  return seen;
}

// ---------------------------------------------------------------- commands

async function cmdScan({ dryRun }) {
  const { fresh, seen, report } = await gatherNew({ dryRun });
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

  if (!fresh.length) {
    await writeState('seen.json', prune(seen));
    log('nothing new — exiting silently, no model calls, no message');
    return;
  }

  if (dryRun) {
    for (const it of fresh.slice(0, 20)) console.log(`  [${it.sourceName}] ${it.title}`);
    log('dry run: stopping before any model call');
    return;
  }

  const batch = fresh.slice(0, MAX_ITEMS_PER_GATE);
  const { kept, rejected } = await gate(batch);
  await logRejections(rejected);
  log(`gate kept ${kept.length}/${batch.length}`);

  // Everything we looked at is now permanently seen, kept or not.
  for (const it of batch) seen[it._key] = { t: Date.now(), r: 'gated' };

  const breaking = kept.filter((k) => k.score >= BREAKING_SCORE);
  const queued = kept.filter((k) => k.score < BREAKING_SCORE);

  if (breaking.length) {
    await send(await writeUp(breaking, 'breaking alert'));
    log(`sent ${breaking.length} breaking item(s)`);
  }

  if (queued.length) {
    const queue = await readState('queue.json', []);
    queue.push(...queued.map(({ _key, ...rest }) => rest));
    await writeState('queue.json', queue);
    log(`queued ${queued.length} item(s) for the weekly digest`);
  }

  await writeState('seen.json', prune(seen));
}

async function cmdDigest({ dryRun }) {
  const queue = await readState('queue.json', []);
  if (!queue.length) {
    log('queue empty — no digest sent');
    return;
  }

  const ranked = [...queue].sort((a, b) => b.score - a.score || b.authority - a.authority);
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

  const { kept, rejected } = await gate(fresh.slice(0, MAX_ITEMS_PER_GATE));
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

const cmd = process.argv[2] || 'scan';
const opts = { dryRun: process.argv.includes('--dry-run') };
await loadEnv();

try {
  if (cmd === 'scan') await cmdScan(opts);
  else if (cmd === 'digest') await cmdDigest(opts);
  else if (cmd === 'init') await cmdInit();
  else if (cmd === 'preview') await cmdPreview();
  else {
    console.error(`usage: node pipeline.mjs [scan|digest|init|preview] [--dry-run]`);
    process.exit(2);
  }
} catch (e) {
  log('FAILED:', e.message);
  process.exit(1);
}
