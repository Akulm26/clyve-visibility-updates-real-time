import { TIER3 } from './sources.mjs';
import { fetchText, htmlToText, sha, readState, writeState, log } from './lib/util.mjs';

// Nav chrome and build artefacts change without the documentation changing.
// Anything that survives this scrub should be real prose.
function scrub(text) {
  return text
    .replace(/\b[0-9a-f]{16,}\b/gi, '') // build hashes, nonces, asset digests
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    .replace(/\b\d{10,13}\b/g, '') // epoch timestamps
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prefer the <main> region; page chrome outside it is pure noise. */
function extract(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return scrub(htmlToText(main ? main[1] : html));
}

/**
 * Pull the watchable text for one page. Most are plain HTML; Bing's help centre
 * renders in JavaScript and has to be read from the JSON endpoint its own page
 * calls, which returns the article body under `HtmlContent`.
 */
async function pageText(page) {
  if (page.type === 'bing-help') {
    const json = JSON.parse(await fetchText(page.api, { timeout: 30000 }));
    return scrub(htmlToText(json.HtmlContent || ''));
  }
  return extract(await fetchText(page.url, { timeout: 30000 }));
}

/**
 * Report the lines that appeared and disappeared, so the LLM sees the actual
 * edit rather than two walls of identical text.
 */
function diff(before, after) {
  const split = (t) =>
    t.split(/(?<=[.:!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 25);
  const b = new Set(split(before));
  const a = split(after);
  const added = a.filter((s) => !b.has(s));
  const aSet = new Set(a);
  const removed = split(before).filter((s) => !aSet.has(s));
  return { added, removed };
}

/**
 * Fingerprint each watched page; emit an item only where the text actually
 * moved. Costs nothing until something changes — the hash comparison is local.
 */
/**
 * Returns the items plus a `commit` that saves the new fingerprints. Saving is
 * left to the caller: once saved, a change is gone for good, so it must only
 * happen after the change has safely been recorded. Saving here meant a scan
 * that crashed at the gate, a dry run, or a look-back review each swallowed a
 * documentation change without it ever being reported.
 */
export async function watch({ seed = false } = {}) {
  const prev = await readState('hashes.json', {});
  const next = { ...prev };
  const items = [];
  const report = [];

  const results = await Promise.allSettled(
    TIER3.map(async (page) => {
      const text = await pageText(page);
      if (text.length < 200) throw new Error('extracted text too short — layout may have changed');
      return { page, text, hash: sha(text) };
    }),
  );

  for (const [i, r] of results.entries()) {
    const page = TIER3[i];
    if (r.status === 'rejected') {
      const error = String(r.reason?.message || r.reason);
      log(`watch failed: ${page.id}: ${error}`);
      report.push({ id: page.id, ok: false, count: 0, error });
      continue;
    }
    // A watcher that fetches cleanly is healthy whether or not the page moved;
    // "no change" is the expected result, not a zero to worry about.
    report.push({ id: page.id, ok: true, count: 1 });
    const { text, hash } = r.value;
    const before = prev[page.id];
    next[page.id] = { hash, text, checked: new Date().toISOString() };

    if (!before) {
      log(`watch: seeded ${page.id}`);
      continue; // first sight is a baseline, never an alert
    }
    if (before.hash === hash) continue;

    const { added, removed } = diff(before.text || '', text);
    if (!added.length && !removed.length) continue; // whitespace-only churn

    if (!seed) {
      items.push({
        source: page.id,
        sourceName: page.name,
        authority: page.authority,
        url: page.url,
        title: `Documentation changed: ${page.name}`,
        published: new Date().toISOString(),
        isDocChange: true,
        dedupeKey: `doc|${page.id}|${hash}`,
        summary:
          `This documentation page was edited with no announcement.\n` +
          `ADDED:\n${added.slice(0, 12).join('\n') || '(nothing)'}\n` +
          `REMOVED:\n${removed.slice(0, 12).join('\n') || '(nothing)'}`,
      });
    }
  }

  const commit = () => writeState('hashes.json', next);
  if (seed) await commit();
  return { items, report, commit };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { items } = await watch({ seed: process.argv.includes('--seed') });
  // Inspecting from the command line never consumes a change.
  console.log(items.length ? JSON.stringify(items, null, 2) : 'no documentation changes');
}
