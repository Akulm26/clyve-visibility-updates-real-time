import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// Overridable so a rehearsal can run against a copy of the real state.
export const STATE_DIR = process.env.AEO_STATE_DIR || join(ROOT, 'state');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function sha(s) {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Strip everything that varies without the content varying: tracking params,
 * fragments, trailing slashes, protocol and www. Two URLs that differ only in
 * these ways are the same story and must dedupe against each other.
 */
export function canonical(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|source|mc_cid|mc_eid|_ga)/i.test(k)) {
        u.searchParams.delete(k);
      }
    }
    let s = `${u.host.replace(/^www\./, '')}${u.pathname}`.replace(/\/+$/, '');
    const q = u.searchParams.toString();
    return (s + (q ? `?${q}` : '')).toLowerCase();
  } catch {
    return String(rawUrl).trim().toLowerCase();
  }
}

export function normalizeTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The dedupe key. Same URL or same title text = already seen.
 *
 * A documentation change carries its own key instead: its URL and title are the
 * same on every edit, so keying on them meant the second edit to a page ever
 * detected was treated as already seen and never reported.
 */
export function itemKey(item) {
  if (item.dedupeKey) return sha(item.dedupeKey);
  return sha(`${canonical(item.url)}|${normalizeTitle(item.title)}`);
}

async function fetchOnce(url, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      // Google's docs negotiate locale and will happily serve Japanese on one
      // request and English on the next, which reads as a full-page rewrite to
      // the Tier 3 watchers. Pin the language.
      headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.retryAfter = Number(res.headers.get('retry-after')) || 0;
      throw err;
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch with a couple of retries for the failures that are about the moment,
 * not the page: rate limits, overloaded servers, dropped connections. arXiv
 * rate-limits shared cloud addresses and answers a first request with 429 that
 * a second one a few seconds later gets through; a 404 is not retried.
 */
export async function fetchText(url, { timeout = 20000, attempts = 3 } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fetchOnce(url, timeout);
    } catch (e) {
      const transient = !e.status || e.status === 429 || e.status >= 500;
      if (!transient || i >= attempts) throw e;
      const wait = Math.min(Math.max(e.retryAfter * 1000, 3000 * 2 ** (i - 1)), 20000);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/**
 * A missing file is a fresh start; a corrupt one is an error. Quietly falling
 * back on corruption would turn a damaged `seen.json` into an empty ledger,
 * and the next scan would re-send everything it had ever sent.
 */
export async function readState(file, fallback) {
  let raw;
  try {
    raw = await readFile(join(STATE_DIR, file), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`state/${file} is corrupt (${e.message}) — restore it from git`);
  }
}

/**
 * Write to a temporary file and rename over the original. The rename is
 * atomic, so a run killed mid-write leaves the previous version intact rather
 * than half a file.
 */
export async function writeState(file, data) {
  await mkdir(STATE_DIR, { recursive: true });
  const target = join(STATE_DIR, file);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await rename(tmp, target);
}

/** Crude but adequate: strip tags/script/style, collapse whitespace. */
export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(s, n) {
  const t = String(s || '').trim();
  return t.length <= n ? t : t.slice(0, n) + '…';
}

export function log(...args) {
  console.error(`[${new Date().toISOString()}]`, ...args);
}
