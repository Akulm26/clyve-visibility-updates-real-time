import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const STATE_DIR = join(ROOT, 'state');

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

/** The dedupe key. Same URL or same title text = already seen. */
export function itemKey(item) {
  return sha(`${canonical(item.url)}|${normalizeTitle(item.title)}`);
}

export async function fetchText(url, { timeout = 20000 } = {}) {
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function readState(file, fallback) {
  try {
    return JSON.parse(await readFile(join(STATE_DIR, file), 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeState(file, data) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(join(STATE_DIR, file), JSON.stringify(data, null, 2) + '\n');
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
