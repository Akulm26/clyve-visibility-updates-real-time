// Which URLs answer from here, and how fast. Run it where the radar runs —
// a source that works on the Mac can be blocked from a cloud address.
//
//   node probe.mjs                 every source in sources.mjs
//   node probe.mjs <url> [<url>…]  just these
import { TIER1, TIER2, TIER3 } from './sources.mjs';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const urls = process.argv.length > 2
  ? process.argv.slice(2).map((url) => ({ id: 'arg', url }))
  : [...TIER1, ...TIER2, ...TIER3].map((s) => ({ id: s.id, url: s.sitemap || s.url }));

await Promise.all(urls.map(async ({ id, url }) => {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  let result;
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': UA } });
    const body = await res.text();
    result = `${res.status} ${body.length}b`;
  } catch (e) {
    result = `ERR ${e.cause?.code || e.name}: ${e.message}`;
  } finally {
    clearTimeout(timer);
  }
  console.log(`${String(Date.now() - started).padStart(6)}ms  ${result.padEnd(24)} ${id}  ${url.slice(0, 110)}`);
}));
