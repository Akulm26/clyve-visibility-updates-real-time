// Free pre-filter. Runs before any LLM call, and is the main reason a typical
// scan costs nothing: general-purpose sources publish a lot, and almost none of
// it touches how content gets found or cited by an AI system.
//
// Deliberately generous — this is a cheap first pass, not the real gate. It only
// has to be good enough to keep obvious noise out of a prompt. prompts/gate.md
// does the strict judging on whatever survives.

const TOPIC = [
  // search surfaces
  'search', 'seo', 'serp', 'ranking', 'rank', 'index', 'indexing', 'crawl',
  'crawler', 'crawling', 'robots.txt', 'sitemap', 'search console',
  'ai overview', 'ai overviews', 'ai mode', 'featured snippet', 'knowledge panel',
  'discover', 'core update', 'spam policy', 'helpful content', 'structured data',
  'schema', 'rich result',
  // AI visibility / answer engines
  'aeo', 'geo', 'generative engine', 'answer engine', 'ai search',
  'citation', 'cite', 'cited', 'sources', 'grounding', 'grounded',
  'retrieval', 'rag', 'web search', 'browsing', 'deep research',
  'llms.txt', 'attribution', 'publisher', 'publishers',
  // named agents and surfaces
  'gptbot', 'oai-searchbot', 'chatgpt-user', 'google-extended', 'perplexitybot',
  'claudebot', 'bingbot', 'applebot', 'ccbot', 'anthropic-ai',
  // content strategy
  'content', 'e-e-a-t', 'eeat', 'authority', 'traffic', 'referral',
  'shopping', 'ads in ai', 'licensing', 'pay per crawl', 'pay-per-crawl',
];

const STRONG = [
  'ai overview', 'ai overviews', 'ai mode', 'core update', 'spam update',
  'ranking update', 'search console', 'robots.txt', 'llms.txt', 'gptbot',
  'oai-searchbot', 'google-extended', 'perplexitybot', 'claudebot',
  'generative engine', 'answer engine', 'pay per crawl', 'pay-per-crawl',
  'crawler', 'citation', 'publisher',
];

// Hard rejects — recurring corporate noise that will never be relevant.
const NEVER = [
  'earnings call', 'quarterly results', 'appoints', 'board of directors',
  'joins the board', 'award', 'sponsorship', 'anniversary', 'holiday hours',
  'job opening', 'we are hiring', 'now hiring',
];

function hay(item) {
  return `${item.title} ${item.summary || ''}`.toLowerCase();
}

/** True if the item is worth spending a prompt on. */
export function passesPrefilter(item, source) {
  const h = hay(item);
  if (NEVER.some((n) => h.includes(n))) return false;
  // A firehose source (arXiv's daily listings) names exactly what it is for.
  if (source?.match) return source.match.test(h);
  if (!source?.filter) return true; // dedicated source — everything counts
  return TOPIC.some((t) => h.includes(t));
}

/**
 * Cheap 0-1 hint at how load-bearing an item looks, used only to order items
 * before the per-run cap is applied. The LLM assigns the real 1-5 score.
 */
export function prefilterWeight(item) {
  const h = hay(item);
  const hits = STRONG.filter((s) => h.includes(s)).length;
  return Math.min(1, hits / 3);
}
