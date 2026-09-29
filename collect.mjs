import { XMLParser } from 'fast-xml-parser';
import { TIER1, TIER2 } from './sources.mjs';
import { fetchText, htmlToText, truncate, readState, writeState, log } from './lib/util.mjs';
import { askClaude, extractJSON } from './lib/claude.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // Status feeds embed long escaped HTML that trips the entity-expansion guard.
  processEntities: false,
});

// Feeds vary wildly in length — OpenAI's runs to four figures, status pages to
// hundreds. We only ever care about the recent edge, and everything older is
// dead weight in both the ledger and any prompt.
const MAX_PER_SOURCE = 30;
const MAX_AGE_DAYS = 45;

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (typeof x === 'object' && x ? x['#text'] ?? '' : x ?? '');

function mkItem(source, { url, title, published, summary }) {
  return {
    source: source.id,
    sourceName: source.name,
    authority: source.authority,
    url: String(url || '').trim(),
    title: htmlToText(String(title || '')).trim(),
    published: published ? new Date(published).toISOString() : null,
    summary: truncate(htmlToText(String(summary || '')), 1500),
  };
}

function parseRss(xml, source) {
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel;
  if (!channel) return [];
  return arr(channel.item).map((it) =>
    mkItem(source, {
      url: text(it.link) || it.guid?.['#text'] || it.guid,
      title: text(it.title),
      published: text(it.pubDate) || text(it.date),
      summary: text(it.description) || text(it['content:encoded']),
    }),
  );
}

function parseAtom(xml, source) {
  const doc = parser.parse(xml);
  const feed = doc?.feed;
  if (!feed) return [];
  return arr(feed.entry).map((e) => {
    const link = arr(e.link).find((l) => !l['@_rel'] || l['@_rel'] === 'alternate');
    return mkItem(source, {
      url: link?.['@_href'] || text(e.id),
      title: text(e.title),
      published: text(e.published) || text(e.updated),
      summary: text(e.summary) || text(e.content),
    });
  });
}

// The Search status dashboard is a JSON array of incidents, each with a list of
// dated updates. We surface the incident itself, keyed on its own id.
function parseGoogleStatus(body, source) {
  const incidents = JSON.parse(body);
  return incidents.slice(0, 20).map((inc) =>
    mkItem(source, {
      url: `https://status.search.google.com/incidents/${inc.id}`,
      title: `Google Search: ${inc.external_desc || inc.service_name || 'incident'}`,
      published: inc.begin || inc.created,
      summary: arr(inc.most_recent_update?.text || inc.updates?.[0]?.text).join(' '),
    }),
  );
}

// Index pages with no feed. We pull the article links and use the slug as the
// title; the real title and body arrive later only if the item clears the gate.
function parseAnchors(html, source) {
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(source.pattern)) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    const slug = path.split('/').filter(Boolean).pop() || path;
    out.push(
      mkItem(source, {
        url: source.base + path,
        title: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        published: null,
        summary: '',
      }),
    );
  }
  return out.slice(0, 20);
}

// Cloudflare-gated page: plain fetch gets a challenge, so this one is read
// through Claude's fetcher instead.
async function parseWebfetch(source, { dryRun }) {
  if (dryRun) return [];
  const raw = await askClaude(
    `Fetch ${source.url} and list the most recent changelog entries. ` +
      `Reply with ONLY a JSON array, no prose, no code fence. Each element: ` +
      `{"title": string, "published": "YYYY-MM-DD" or null, "summary": string (max 300 chars), "url": string}. ` +
      `Use the entry's own anchor URL if it has one, otherwise "${source.url}". Max 15 entries.`,
    { tools: 'WebFetch', model: 'haiku' },
  );
  return extractJSON(raw).map((e) => mkItem(source, e));
}

/**
 * Newest first, drop anything past the age window, then cap. Undated items
 * (index-page scrapes) are kept — the page already lists them newest first.
 */
function trim(items) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
  const dated = items.filter((i) => i.published);
  const undated = items.filter((i) => !i.published);
  dated.sort((a, b) => new Date(b.published) - new Date(a.published));
  return [...dated.filter((i) => new Date(i.published).getTime() >= cutoff), ...undated]
    .slice(0, MAX_PER_SOURCE);
}

/**
 * For pages that block automated fetching but are indexed by search engines.
 *
 * The sitemap's `lastmod` is the free trigger — verified to be a genuine
 * per-page content timestamp rather than a site-wide build stamp. Only when it
 * moves do we spend one search-backed call to recover what actually changed,
 * and the result is constrained to first-party pages so the primary-source rule
 * still holds.
 */
async function parseSitemapSearch(source, { dryRun }) {
  const xml = await fetchText(source.sitemap, { timeout: 40000 });
  const block = xml
    .split('<url>')
    .find((b) => b.includes(`<loc>${source.url}</loc>`));
  const lastmod = block?.match(/<lastmod>(.*?)<\/lastmod>/)?.[1];
  if (!lastmod) throw new Error('page not listed in sitemap — url may have moved');

  const stateFile = `lastmod.json`;
  const state = await readState(stateFile, {});
  const previous = state[source.id];

  if (previous === lastmod) return [];
  if (dryRun) return [];

  // First sight is a baseline: record it and say nothing, exactly as the
  // documentation watchers do.
  if (!previous) {
    await writeState(stateFile, { ...state, [source.id]: lastmod });
    log(`${source.id}: seeded lastmod baseline`);
    return [];
  }

  const since = previous.slice(0, 10);
  // Phrasing matters here. Told merely to "only report first-party entries",
  // the model reads that as needing to open the page to verify — which it
  // cannot, since the page blocks it — and returns nothing. Saying explicitly
  // that a first-party URL in a search result is sufficient attribution is what
  // makes this source work at all.
  const raw = await askClaude(
    `Search the web to find what is currently listed on the OpenAI ChatGPT ` +
      `release notes page (${source.url}) and the OpenAI Help Center ChatGPT ` +
      `release notes, for entries dated ${since} or later.\n` +
      `A search result whose URL is on openai.com or help.openai.com counts as ` +
      `first-party — you do not need to open the page to use it. Exclude anything ` +
      `whose only URL is a third-party site (news outlets, aggregators, newsletters).\n` +
      `Reply with ONLY a JSON array. Each element: ` +
      `{"title": string, "published": "YYYY-MM-DD", "summary": string (max 300 chars), "url": string}. ` +
      `Max 10 entries. Use [] only if searches genuinely surface no openai.com ` +
      `entries in that date range.`,
    { tools: 'WebSearch', model: 'haiku', timeout: 240000 },
  );

  // Parse before recording the new timestamp: a failure here must leave the
  // window open so the next scan retries, rather than silently losing it.
  const entries = extractJSON(raw).filter((e) =>
    /(^|\/\/)(www\.)?(openai\.com|help\.openai\.com)/.test(e.url || ''),
  );
  await writeState(stateFile, { ...state, [source.id]: lastmod });
  return entries.map((e) => mkItem(source, e));
}

/**
 * Search-only source, for hosts that block every fetch and expose no timestamp
 * to gate on. There is no free trigger here, so the call itself is the cost —
 * which is why these are paced weekly rather than run on every scan.
 */
async function parseSearchSweep(source, { dryRun }) {
  if (dryRun) return [];

  const sweeps = await readState('sweeps.json', {});
  const last = sweeps[source.id];
  const dueAfter = source.cadence === 'weekly' ? 7 * 864e5 : 864e5;
  if (last && Date.now() - new Date(last).getTime() < dueAfter) return [];

  const since = last ? new Date(last).toISOString().slice(0, 10) : 'the last 30 days';
  const hosts = source.hosts.join(' or ');
  const raw = await askClaude(
    `Search the web for ${source.query}, published since ${since}.\n` +
      `A search result whose URL is on ${hosts} counts as first-party — you do ` +
      `not need to open the page to use it. Exclude anything whose only URL is a ` +
      `third-party site (news outlets, aggregators, newsletters, agency blogs).\n` +
      `Reply with ONLY a JSON array. Each element: ` +
      `{"title": string, "published": "YYYY-MM-DD", "summary": string (max 300 chars), "url": string}. ` +
      `Max 10 entries. Use [] if nothing first-party is found in that window.`,
    { tools: 'WebSearch', model: 'haiku', timeout: 240000 },
  );

  const hostRe = new RegExp(`//([a-z0-9-]+\\.)*(${source.hosts.map((h) => h.replace('.', '\\.')).join('|')})/`, 'i');
  const entries = extractJSON(raw).filter((e) => hostRe.test(e.url || ''));
  await writeState('sweeps.json', { ...sweeps, [source.id]: new Date().toISOString() });
  return entries.map((e) => mkItem(source, e));
}

async function collectOne(source, opts) {
  const needsOwnFetch =
    source.type === 'webfetch' ||
    source.type === 'sitemap-search' ||
    source.type === 'search-sweep';
  const body = needsOwnFetch ? null : await fetchText(source.url);
  switch (source.type) {
    case 'rss':
      return parseRss(body, source);
    case 'atom':
      return parseAtom(body, source);
    case 'google-status':
      return parseGoogleStatus(body, source);
    case 'html-anchors':
      return parseAnchors(body, source);
    case 'webfetch':
      return parseWebfetch(source, opts);
    case 'sitemap-search':
      return parseSitemapSearch(source, opts);
    case 'search-sweep':
      return parseSearchSweep(source, opts);
    default:
      throw new Error(`unknown source type: ${source.type}`);
  }
}

/**
 * Pull every Tier 1 and Tier 2 source in parallel. A source that fails is
 * logged and skipped — one dead feed must never take down the run.
 */
export async function collect(opts = {}) {
  const sources = [...TIER1, ...TIER2];
  const results = await Promise.allSettled(
    sources.map((s) => collectOne(s, opts)),
  );

  const items = [];
  const report = [];
  results.forEach((r, i) => {
    const s = sources[i];
    if (r.status === 'fulfilled') {
      const kept = trim(r.value);
      items.push(...kept);
      report.push({ id: s.id, count: kept.length, ok: true });
    } else {
      report.push({ id: s.id, count: 0, ok: false, error: String(r.reason?.message || r.reason) });
      log(`source failed: ${s.id}: ${r.reason?.message || r.reason}`);
    }
  });

  return { items: items.filter((i) => i.url && i.title), report };
}

// `node collect.mjs` on its own prints the per-source counts — the quickest way
// to find out whether a feed has moved.
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  const { items, report } = await collect({ dryRun });
  for (const r of report) {
    console.log(
      `${r.ok ? (r.count > 0 ? '✓' : '⚠') : '✗'} ${String(r.count).padStart(3)}  ${r.id}${r.error ? '  ' + r.error : ''}`,
    );
  }
  console.log(`\ntotal: ${items.length} items`);
}
