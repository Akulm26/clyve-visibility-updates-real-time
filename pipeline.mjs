import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collect } from './collect.mjs';
import { watch } from './watch.mjs';
import { passesPrefilter, prefilterWeight } from './lib/filter.mjs';
import { askClaude, askClaudeJSON } from './lib/claude.mjs';
import { send as channelSend } from './lib/channel.mjs';
import { checkIssues, closeIssue, issuesEnabled } from './lib/issues.mjs';
import { updateHealth, formatHealthAlert } from './lib/health.mjs';
import { headerFor, withHeader, statusHeader, requestLabel, stamp } from './lib/headers.mjs';
import { subjectFrom } from './lib/email.mjs';
import { withLock } from './lib/lock.mjs';
import { TIER1, TIER2, TIER3 } from './sources.mjs';
import {
  ROOT, STATE_DIR, itemKey, canonical, readState, writeState, truncate, fetchText, htmlToText, log,
} from './lib/util.mjs';

// Caps. Their job is to bound the worst case, not the normal one — a typical
// scan sends nothing to the model at all.
const MAX_ITEMS_PER_GATE = 15;
const MAX_DIGEST_ITEMS = 8;
// A look-back covers a whole window rather than one scan, so it carries more.
const REPORT_ITEMS = 12;
const BREAKING_SCORE = 4;
const MAX_BREAKING = 2;
const BACKFILL_DAYS = 14;
// How old an item may be and still count as news. Anything parked longer than
// this was never urgent and has stopped being current — it must not resurface
// under a "what's new" heading.
const MAX_NEWS_AGE_DAYS = 14;
const SEEN_RETENTION_DAYS = 400;
// A triggered request that fails is retried on the next inbox checks; after
// this many attempts you get a message saying what went wrong instead.
const MAX_ATTEMPTS = 3;
// A request answered later than this gets a note saying when it was sent.
const LATE_MINUTES = 10;

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
  const [{ items: feedItems, report: feedReport }, { items: docChanges, report: watchReport, commit }] =
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

  // Doc-change fingerprints are saved only on a real run, and only once the
  // caller has recorded what it found — see `watch()`.
  const commitWatch = dryRun ? async () => {} : commit;
  return { fresh: diversify(fresh), seen, report, newest, commitWatch };
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
  const header = headerFor(kind, items.length);
  try {
    const tpl = await prompt('writeup.md', payload);
    const raw = await askClaude(`${tpl}\n\nThis is a ${kind}.`, {
      model: 'sonnet',
      timeout: 300000,
    });
    return withSources(withHeader(stripPreamble(raw), header), items);
  } catch (e) {
    // The items were already judged worth sending; only the prose failed. A
    // plain list that arrives beats a polished one that never does.
    log(`write-up failed, sending a plain list instead: ${e.message}`);
    return plainList(header, items, e.message);
  }
}

function plainList(header, items, reason) {
  const marker = (s) => (s >= 5 ? '🔴' : s >= 4 ? '🟠' : s >= 3 ? '🟡' : '⚪');
  const body = items
    .map((it) => {
      const date = it.published
        ? new Date(it.published).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : '';
      return [
        `*${marker(it.score)} ${it.title}*`,
        `_${it.sourceName}${date ? ` · ${date}` : ''}_`,
        it.why || '',
        it.url,
      ].filter(Boolean).join('\n');
    })
    .join('\n———\n');
  return `${header}\n\nThe usual write-up could not be produced (${reason}), so here are the items as they are.\n———\n${body}`;
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

/** Put a line directly under the header. */
function withNote(text, note) {
  if (!note) return text;
  const [first, ...rest] = text.split('\n');
  return [first, '', note, ...rest].join('\n');
}

/** Keep a copy of what went out, so a digest can be re-read without a mailbox. */
async function saveSent(kind, text) {
  const stamp = new Date().toISOString();
  await writeFile(
    join(STATE_DIR, 'last-sent.md'),
    `<!-- ${kind} · ${stamp} -->\n\n${text}\n`,
  );
}

// ---------------------------------------------------------------- delivery

/**
 * What has actually reached you, as opposed to what has merely been looked at.
 *
 * `seen.json` records everything the gate judged, kept or not; it cannot say
 * whether you have already read about something. This can — and it is what
 * makes "is there a legitimate update?" answerable for both a scan and a
 * review, whichever of the two (or a breaking alert, or the Monday digest)
 * delivered the item first.
 */
async function readDelivered() {
  return { items: {}, urls: {}, last: null, ...(await readState('delivered.json', {})) };
}

/**
 * Matched on the item key or on its link. The link catches a publisher that
 * retitles a post after you have read it. Documentation changes are keyed per
 * edit and share one link across edits, so they match on the key alone.
 */
const isDelivered = (delivered, item) =>
  Boolean(delivered.items[itemKey(item)]) ||
  (!item.dedupeKey && Boolean(item.url && delivered.urls[canonical(item.url)]));

/** Send a message that carries items, then record the items and the message. */
async function deliver(kind, text, items) {
  await send(text);
  await saveSent(kind, text);

  const d = await readDelivered();
  const now = Date.now();
  for (const it of items) {
    d.items[itemKey(it)] = now;
    if (it.url && !it.dedupeKey) d.urls[canonical(it.url)] = now;
  }
  const cutoff = now - SEEN_RETENTION_DAYS * 864e5;
  for (const map of [d.items, d.urls]) {
    for (const [k, t] of Object.entries(map)) if (t < cutoff) delete map[k];
  }
  d.last = {
    subject: subjectFrom(text),
    at: new Date(now).toISOString(),
    kind,
    headlines: items.slice(0, 8).map((i) => i.title),
  };
  await writeState('delivered.json', d);
}

/**
 * The reply when a requested scan or review finds nothing you have not already
 * been sent. It does not repeat old content; it points at the email that holds
 * it, so the newest content email is always the one place to look. It still
 * shows its working — sources reached, and the newest item anywhere — because
 * "no update" on its own is indistinguishable from a broken radar.
 */
function noUpdateMessage({ label, summary, report, newest, last, note }) {
  const ok = report.filter((r) => r.ok).length;
  const failed = report.filter((r) => !r.ok);

  const lines = [
    statusHeader(label, 'no update'),
    ``,
    ...(note ? [note, ``] : []),
    `Checked ${ok} of ${report.length} sources just now. ${summary}`,
    ``,
    `———`,
    `*Your latest update*`,
    ``,
  ];

  if (last) {
    // New subjects carry their own time; older ones do not, so add it.
    const when = /\d:\d\d/.test(last.subject) ? '' : `, sent ${stamp(new Date(last.at))}`;
    lines.push(
      `Open the email _${last.subject}_${when}. It is still the current picture.`,
    );
    if (last.headlines?.length) {
      lines.push(``, ...last.headlines.map((h) => `· ${h}`));
    }
  } else {
    lines.push(`Nothing has been sent to you yet — the radar has found nothing worth sending.`);
  }

  if (newest) {
    const date = new Date(newest.published).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    lines.push(
      ``,
      `———`,
      `*Feeds are current*`,
      ``,
      `The most recent item anywhere in your sources is from ${date}:`,
      `_${newest.title}_ — ${newest.sourceName}`,
      newest.url,
    );
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

function prune(seen) {
  const cutoff = Date.now() - SEEN_RETENTION_DAYS * 864e5;
  for (const [k, v] of Object.entries(seen)) if ((v.t || 0) < cutoff) delete seen[k];
  return seen;
}

/** Every outgoing message goes through here, so a request can say what answered it. */
let lastSubject = '';
async function send(text) {
  await channelSend(text);
  lastSubject = subjectFrom(text);
}

const byUrgency = (a, b) => b.score - a.score || (b.authority || 0) - (a.authority || 0);

// ---------------------------------------------------------------- commands

async function cmdScan({ dryRun, manual = false, note = '' }) {
  const { fresh, seen, report, newest, commitWatch } = await gatherNew({ dryRun });
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

  const delivered = await readDelivered();
  let kept = [];
  if (fresh.length) {
    const batch = await enrichThin(fresh.slice(0, MAX_ITEMS_PER_GATE));
    const gated = await gate(batch);
    // A look-back review can reach an item before the scan does. It is not
    // news a second time.
    kept = gated.kept.filter((k) => !isDelivered(delivered, k));
    await logRejections(gated.rejected);
    log(`gate kept ${kept.length}/${batch.length}`);

    // Everything we looked at is now permanently seen, kept or not.
    for (const it of batch) seen[it._key] = { t: Date.now(), r: 'gated' };
  }

  const strip = ({ _key, ...rest }) => rest;

  if (manual) {
    // You asked, so you always get an answer — the content when there is a
    // legitimate update, otherwise a pointer to the email that already has it.
    // Everything found plus anything already waiting goes out, most urgent
    // first: the urgency threshold exists to avoid pestering you on automatic
    // runs and has no business filtering a reply you requested.
    const waiting = await readState('queue.json', []);
    const { current, stale } = splitByAge([...kept.map(strip), ...waiting]);
    if (stale.length) log(`dropped ${stale.length} stale item(s) from the queue`);

    const updates = current.filter((i) => !isDelivered(delivered, i)).sort(byUrgency);

    if (updates.length) {
      const shown = updates.slice(0, MAX_DIGEST_ITEMS);
      await deliver('requested update', withNote(await writeUp(shown, 'requested update'), note), shown);
    } else {
      await send(noUpdateMessage({
        label: 'Scan',
        summary: 'Nothing new since your last update.',
        report, newest, last: delivered.last, note,
      }));
    }
    // Recorded only after the reply is out: if sending fails, the request is
    // retried and must find the same items again.
    await writeState('queue.json', updates.slice(MAX_DIGEST_ITEMS));
    await writeState('seen.json', prune(seen));
    await commitWatch();
    log(updates.length ? `sent requested update (${Math.min(updates.length, MAX_DIGEST_ITEMS)} item(s))` : 'sent requested update: no update');
    return;
  }

  const urgent = kept.filter((k) => k.score >= BREAKING_SCORE);
  const later = kept.filter((k) => k.score < BREAKING_SCORE);

  if (urgent.length) {
    // Several high-impact items landing in one scan is a backlog, not an
    // emergency — a catch-up reads better than four "breaking" alarms.
    const kind = urgent.length > MAX_BREAKING ? 'catch-up digest' : 'breaking alert';
    await deliver(kind, await writeUp(urgent, kind), urgent);
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
  await commitWatch();
}

async function cmdDigest({ dryRun }) {
  const queue = await readState('queue.json', []);
  const delivered = await readDelivered();
  // A requested scan or a review may already have sent some of these.
  const pending = queue.filter((i) => !isDelivered(delivered, i));
  if (!pending.length) {
    if (queue.length) await writeState('queue.json', []);
    log('queue empty — no digest sent');
    return;
  }

  const { current, stale } = splitByAge(pending);
  if (stale.length) log(`dropped ${stale.length} stale item(s) from the digest`);
  if (!current.length) {
    await writeState('queue.json', []);
    log('everything queued had gone stale — no digest sent');
    return;
  }

  const ranked = [...current].sort(byUrgency);
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

  await deliver('weekly digest', text, ranked);
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
 * A deliberate look back over a fixed window, regardless of what has already
 * been sent. Use it to sanity-check coverage, or to catch up after a break.
 *
 * Deliberately does not touch the ledger, the queue or the doc fingerprints.
 * An earlier attempt at this deleted entries from `seen.json` so items would be
 * rediscovered, which re-sent things that had already gone out — exactly the
 * duplication the ledger exists to prevent. Reading past it is safe; editing
 * it is not.
 *
 * It always replies. When the window holds at least one item you have not
 * been sent, the whole window goes out with the new ones guaranteed a place;
 * otherwise the reply points at your latest update.
 */
async function cmdReport({ dryRun, days: requested, note = '' }) {
  const days =
    requested || Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1]) || 14;
  const cutoff = Date.now() - days * 864e5;

  const [{ items, report: feedReport }, { items: docChanges, report: watchReport }] = await Promise.all([
    collect({ dryRun: false }),
    watch(),
  ]);
  const report = [...feedReport, ...watchReport];

  const inWindow = [...items, ...docChanges]
    .filter((i) => i.isDocChange || passesPrefilter(i, SOURCE_BY_ID[i.source]))
    .filter((i) => !i.published || new Date(i.published).getTime() >= cutoff)
    .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));

  log(`${inWindow.length} on-topic item(s) in the last ${days} days`);
  if (dryRun) {
    for (const i of inWindow) console.log(`  ${(i.published || '').slice(0, 10)}  ${i.sourceName} — ${i.title}`);
    return;
  }

  // Gate in batches so a long window is not truncated to a single call.
  const kept = [];
  if (inWindow.length) {
    const enriched = await enrichThin(inWindow.slice(0, 45));
    for (let i = 0; i < enriched.length; i += MAX_ITEMS_PER_GATE) {
      const { kept: k } = await gate(enriched.slice(i, i + MAX_ITEMS_PER_GATE));
      kept.push(...k);
    }
    log(`gate kept ${kept.length}/${enriched.length}`);
  }

  const delivered = await readDelivered();
  const fresh = kept.filter((i) => !isDelivered(delivered, i));
  const label = requestLabel('review', days);

  if (!fresh.length) {
    const summary = kept.length
      ? `Looked back ${days} days: ${kept.length} relevant item(s), every one already sent to you.`
      : `Looked back ${days} days: nothing relevant was published.`;
    const newest = inWindow.find((i) => i.published) || null;
    await send(noUpdateMessage({ label, summary, report, newest, last: delivered.last, note }));
    log(`sent ${days}-day review: no update (${kept.length} relevant, all already sent)`);
    return;
  }

  // New items first so none is cut by the cap, then fill with the rest of the
  // window, and present the lot most urgent first.
  const already = kept.filter((i) => isDelivered(delivered, i));
  const shown = [...fresh.sort(byUrgency), ...already.sort(byUrgency)]
    .slice(0, REPORT_ITEMS)
    .sort((a, b) => b.score - a.score || new Date(b.published || 0) - new Date(a.published || 0));

  // Say which part is new, so a review can be read against the last one.
  const newCount = shown.filter((i) => !isDelivered(delivered, i)).length;
  const whatsNew = newCount === shown.length
    ? ''
    : `_${newCount} of these ${shown.length} ${newCount === 1 ? 'is' : 'are'} new since your last update; the rest you have seen before._`;
  const text = withNote(await writeUp(shown, `${days}-day review`), [note, whatsNew].filter(Boolean).join('\n'));
  await deliver(`${days}-day review`, text, shown);
  log(`sent ${shown.length}-item review of the last ${days} days (${fresh.length} new)`);
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

// ---------------------------------------------------------------- requests

/** Reply to a request that could not run as written. No model, no sources. */
function noticeMessage(req) {
  const asked = `_${req.subject || '(no subject)'}_`;
  if (req.issue) {
    return [
      statusHeader('Request', 'not understood'),
      ``,
      `Your Shortcut request ${asked} is not one I recognise. Use "scan", "review" or "review 30" as the title.`,
    ].join('\n');
  }
  if (req.reason === 'no-code') {
    return [
      statusHeader('Request', 'not run'),
      ``,
      `Your email ${asked} looked like a request, but it did not include your code, so nothing ran.`,
      ``,
      `Send it again with the code in the subject — for example "scan <code>" or "review <code>". To see the code, run \`npm run trigger:code\` on the Mac.`,
    ].join('\n');
  }
  return [
    statusHeader('Request', 'not understood'),
    ``,
    `Your email ${asked} had the right code, but no request I recognise.`,
    ``,
    `"scan <code>" — anything new since your last update`,
    `"review <code>" — a look back over the last 14 days`,
    `"review 30 <code>" — the same over any window up to 90 days`,
  ].join('\n');
}

/** Errors in words you can act on; the raw message stays in the log. */
function plainReason(message = '') {
  if (/spawn claude ENOENT|claude.*not found/i.test(message)) return 'the Claude command-line tool could not be found on the Mac';
  if (/claude exited|not logged in|authenticat/i.test(message)) return 'the Claude command-line tool refused to run — it may need logging in again';
  if (/claude timed out/i.test(message)) return 'the AI step took too long to answer';
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|ETIMEOUT|EAI_AGAIN|fetch failed|network/i.test(message)) return 'the Mac had no working internet connection';
  if (/Invalid login|535|EAUTH/i.test(message)) return 'the email account rejected the app password';
  if (/another run is still going/i.test(message)) return 'another scan was still running';
  return message;
}

function failureMessage(req, error) {
  return [
    statusHeader(requestLabel(req.kind, req.days), 'failed'),
    ``,
    `Your request, sent ${stamp(new Date(req.arrived))}, could not be completed after ${MAX_ATTEMPTS} attempts.`,
    ``,
    `Reason: ${plainReason(error)}.`,
    ``,
    `Send it again in a few minutes. If this keeps happening, the details are in logs/ on the Mac.`,
  ].join('\n');
}

function lateNote(req) {
  const arrived = new Date(req.arrived);
  if (Date.now() - arrived.getTime() < LATE_MINUTES * 60000) return '';
  return `_You sent this request at ${stamp(arrived)}; it was picked up at ${stamp()} — the Mac was asleep or offline in between._`;
}

/**
 * Answer every pending request. Each is removed only once its reply has gone
 * out; a failure leaves it for the next check, and the last failure sends a
 * message saying what went wrong. Repeats of the same request are answered
 * once.
 */
async function runPending(opts) {
  let pending = await readState('pending.json', []);
  const done = new Set();
  let firstError = null;

  for (const req of pending) {
    if (done.has(req.uid)) continue;
    const same = pending.filter(
      (p) => p.kind === req.kind && (p.kind !== 'review' || p.days === req.days) && p.kind !== 'notice',
    );
    const group = req.kind === 'notice' ? [req] : same;

    try {
      if (req.kind === 'notice') {
        await send(noticeMessage(req));
      } else if (req.kind === 'review') {
        log(`triggered by email: ${req.days}-day review`);
        await cmdReport({ ...opts, days: req.days, note: lateNote(req) });
      } else {
        log('triggered by email: scan');
        await cmdScan({ ...opts, manual: true, note: lateNote(req) });
      }
      for (const g of group) done.add(g.uid);
    } catch (err) {
      const attempts = (req.attempts || 0) + 1;
      log(`request ${req.kind} (uid ${req.uid}) failed, attempt ${attempts}/${MAX_ATTEMPTS}: ${err.message}`);
      firstError ||= err;
      for (const g of group) g.attempts = attempts;
      if (attempts >= MAX_ATTEMPTS) {
        try {
          await send(failureMessage(req, err.message));
          for (const g of group) done.add(g.uid);
        } catch (sendErr) {
          // Could not even send the failure notice — the network or the mail
          // account is down. Keep the request; the next check tries again.
          log(`could not send the failure notice either: ${sendErr.message}`);
        }
      }
    }

    // Close the issues behind anything answered. A test run prints instead of
    // mailing, and says so on the issue.
    for (const p of pending.filter((x) => done.has(x.uid) && x.issue)) {
      const where = (process.env.CHANNEL || '').toLowerCase() === 'console'
        ? 'Test run: the reply was printed in the Actions log, not emailed.'
        : `Answered by email: **${lastSubject}**`;
      await closeIssue(p.issue, where);
    }

    // Save progress after every request, so a crash on the next one cannot
    // re-send a reply that has already gone out.
    pending = pending.filter((p) => !done.has(p.uid));
    await writeState('pending.json', pending);
  }

  if (firstError) throw firstError;
}

/**
 * Check for emailed requests and answer them. Runs every couple of minutes;
 * almost always finds nothing and exits having done one small IMAP round-trip,
 * so it costs nothing in model usage.
 *
 * Pending requests are answered even when the inbox check itself fails, so a
 * flaky connection delays new requests but never strands ones already found.
 */
async function cmdListen(opts) {
  const { checkInbox } = await import('./lib/inbox.mjs');
  let inboxError = null;
  try {
    await checkInbox();
  } catch (e) {
    inboxError = e;
    log(`inbox check failed: ${e.message}`);
  }
  if (issuesEnabled()) {
    try {
      await checkIssues();
    } catch (e) {
      inboxError ||= e;
      log(`issue check failed: ${e.message}`);
    }
  }

  const pending = await readState('pending.json', []);
  if (pending.length) {
    // Waits for a scheduled scan to finish rather than racing it. If it is
    // still going, the requests stay pending for the next check.
    await withLock('listen', () => runPending(opts), { wait: 10 * 60000 });
  }
  if (inboxError) throw inboxError;
}

/**
 * A scheduled run that fails only says so in the log — and a radar whose normal
 * state is silence gives you no other reason to look. Two failures in a row
 * (twelve hours of scans) sends one notice; it stays quiet until a run
 * succeeds, then can warn again.
 */
async function trackScheduled(name, run) {
  const record = await readState('failures.json', {});
  try {
    await run();
    const schedule = await readState('schedule.json', {});
    schedule[name] = new Date().toISOString();
    await writeState('schedule.json', schedule);
    if (record[name]) {
      delete record[name];
      await writeState('failures.json', record);
    }
  } catch (e) {
    const schedule = await readState('schedule.json', {});
    schedule[`${name}Attempt`] = new Date().toISOString();
    await writeState('schedule.json', schedule).catch(() => {});
    const r = record[name] || { count: 0, notified: false };
    r.count++;
    r.last = e.message;
    if (r.count >= 2 && !r.notified) {
      try {
        await send([
          statusHeader(name === 'scan' ? 'Scheduled scan' : 'Weekly digest', 'failing'),
          ``,
          `The last ${r.count} scheduled runs failed, so the radar is not currently watching your sources.`,
          ``,
          `Reason: ${plainReason(e.message)}.`,
          ``,
          `You will not be told again until it recovers. Details are in logs/ on the Mac.`,
        ].join('\n'));
        r.notified = true;
      } catch (sendErr) {
        log(`could not send the failure notice: ${sendErr.message}`);
      }
    }
    record[name] = r;
    await writeState('failures.json', record).catch(() => {});
    throw e;
  }
}

// ---------------------------------------------------------------- cloud

const SCAN_EVERY_HOURS = 6;
// A failed scheduled run is retried this long after the last attempt, not on
// every five-minute tick.
const RETRY_AFTER_MINUTES = 30;
const DIGEST_WEEKDAY = 1; // Monday
const DIGEST_HOUR = 9;

const hoursSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600e3 : Infinity);

/** "2026-09-28" — the local date of this week's digest day. */
function digestWeek(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() - DIGEST_WEEKDAY + 7) % 7));
  return d.toLocaleDateString('en-CA');
}

/**
 * One command for a scheduler that ticks often and unreliably. GitHub's cron
 * runs late, skips runs under load, and cancels queued ones — so rather than a
 * schedule per job, every tick answers requests and then does whatever has
 * fallen due. A skipped tick is made up by the next.
 */
async function cmdAuto(opts) {
  let firstError = null;
  const attempt = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      log(`${label} failed: ${e.message}`);
      firstError ||= e;
    }
  };

  await attempt('requests', () => cmdListen(opts));

  const s = await readState('schedule.json', {});
  const retryOk = (name) => hoursSince(s[`${name}Attempt`]) * 60 >= RETRY_AFTER_MINUTES;

  if (hoursSince(s.scan) >= SCAN_EVERY_HOURS - 0.1 && retryOk('scan')) {
    log(`auto: scan due (last ${s.scan || 'never'})`);
    await attempt('scan', () => trackScheduled('scan', () => withLock('scan', () => cmdScan(opts))));
  }

  const now = new Date();
  const week = digestWeek(now);
  const digestTime = now.getDay() !== DIGEST_WEEKDAY || now.getHours() >= DIGEST_HOUR;
  if (digestTime && (s.digestWeek || '') < week && retryOk('digest')) {
    log(`auto: digest due for the week of ${week}`);
    await attempt('digest', async () => {
      await trackScheduled('digest', () => withLock('digest', () => cmdDigest(opts)));
      const after = await readState('schedule.json', {});
      after.digestWeek = week;
      await writeState('schedule.json', after);
    });
  }

  if (firstError) throw firstError;
}

const cmd = process.argv[2] || 'scan';
const opts = { dryRun: process.argv.includes('--dry-run') };
await loadEnv();

try {
  if (cmd === 'scan') await trackScheduled('scan', () => withLock('scan', () => cmdScan(opts)));
  else if (cmd === 'digest') await trackScheduled('digest', () => withLock('digest', () => cmdDigest(opts)));
  else if (cmd === 'init') await withLock('init', () => cmdInit());
  else if (cmd === 'preview') await cmdPreview();
  else if (cmd === 'listen') await cmdListen(opts);
  else if (cmd === 'auto') await cmdAuto(opts);
  else if (cmd === 'report') await withLock('report', () => cmdReport(opts));
  else {
    console.error(
      `usage: node pipeline.mjs [scan|digest|init|preview|listen|report|auto] [--dry-run] [--days=N]`,
    );
    process.exit(2);
  }
} catch (e) {
  log('FAILED:', e.message);
  process.exit(1);
}
