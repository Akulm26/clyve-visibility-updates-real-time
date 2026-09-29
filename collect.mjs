import { XMLParser } from 'fast-xml-parser';
import { TIER1, TIER2 } from './sources.mjs';
import { fetchText, htmlToText, truncate, log } from './lib/util.mjs';
import { askClaude } from './lib/claude.mjs';

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
  const json = raw.match(/\[[\s\S]*\]/);
  if (!json) return [];
  return JSON.parse(json[0]).map((e) => mkItem(source, e));
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

async function collectOne(source, opts) {
  const body =
    source.type === 'webfetch' ? null : await fetchText(source.url);
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
