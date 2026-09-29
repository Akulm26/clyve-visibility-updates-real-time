// Source registry. Every endpoint here was probed live and returned 200.
//
// tier 1 = machine-readable feed, parsed deterministically (no LLM)
// tier 2 = no feed exists, HTML extraction
// tier 3 = docs pages that change silently; we fingerprint them and diff
//
// `filter: true` means the source publishes plenty of off-topic material and
// must clear the keyword pre-filter in filter.mjs before costing us anything.
// Sources dedicated to search/crawling are exempt — everything they publish is
// on-topic by definition.

export const TIER1 = [
  {
    id: 'google-search-central',
    name: 'Google Search Central Blog',
    url: 'https://developers.google.com/search/blog/feed.xml',
    type: 'rss',
    authority: 10,
    filter: false,
  },
  {
    id: 'google-search-product',
    name: 'Google — The Keyword (Search)',
    url: 'https://blog.google/products/search/rss/',
    type: 'rss',
    authority: 9,
    filter: false,
  },
  {
    id: 'google-ai',
    name: 'Google — The Keyword (AI)',
    url: 'https://blog.google/technology/ai/rss/',
    type: 'rss',
    authority: 8,
    filter: true,
  },
  {
    id: 'google-search-status',
    name: 'Google Search Status Dashboard',
    url: 'https://status.search.google.com/incidents.json',
    type: 'google-status',
    authority: 10,
    filter: false,
  },
  {
    id: 'openai-news',
    name: 'OpenAI News',
    url: 'https://openai.com/news/rss.xml',
    type: 'rss',
    authority: 9,
    filter: true,
  },
  {
    id: 'bing-webmaster',
    name: 'Bing Webmaster Blog',
    url: 'https://blogs.bing.com/webmaster/feed',
    type: 'rss',
    authority: 8,
    filter: false,
  },
  {
    id: 'bing-search-quality',
    name: 'Bing Search Quality Insights',
    url: 'https://blogs.bing.com/search-quality-insights/feed',
    type: 'rss',
    authority: 8,
    filter: false,
  },
  {
    id: 'meta-newsroom',
    name: 'Meta Newsroom',
    url: 'https://about.fb.com/news/feed/',
    type: 'rss',
    authority: 7,
    filter: true,
  },
  {
    id: 'reddit-inc',
    name: 'Reddit Inc. Blog',
    url: 'https://redditinc.com/blog/rss.xml',
    type: 'rss',
    authority: 8,
    filter: true,
  },
  {
    id: 'cloudflare-ai',
    name: 'Cloudflare Blog (AI)',
    url: 'https://blog.cloudflare.com/tag/ai/rss/',
    type: 'rss',
    authority: 7,
    filter: true,
  },
  {
    id: 'arxiv-geo',
    name: 'arXiv — AI search & citation research',
    url:
      'http://export.arxiv.org/api/query?search_query=' +
      encodeURIComponent(
        'all:"generative engine optimization" OR all:"answer engine optimization" ' +
          'OR all:"LLM citation" OR all:"search engine optimization for LLMs"',
      ) +
      '&sortBy=submittedDate&sortOrder=descending&max_results=15',
    type: 'atom',
    authority: 6,
    filter: false,
  },
  {
    id: 'claude-release-notes',
    name: 'Claude Release Notes',
    url: 'https://docs.claude.com/en/release-notes/feed.xml',
    type: 'rss',
    authority: 7,
    filter: true,
  },
  {
    id: 'openai-status',
    name: 'OpenAI Status',
    url: 'https://status.openai.com/history.rss',
    type: 'rss',
    authority: 5,
    filter: true,
  },
  {
    id: 'anthropic-status',
    name: 'Anthropic Status',
    url: 'https://status.anthropic.com/history.rss',
    type: 'rss',
    authority: 5,
    filter: true,
  },
];

export const TIER2 = [
  {
    id: 'anthropic-news',
    name: 'Anthropic News',
    url: 'https://www.anthropic.com/news',
    type: 'html-anchors',
    // Anchors on the news index look like href="/news/<slug>"
    pattern: /href="(\/news\/[a-z0-9-]+)"/g,
    base: 'https://www.anthropic.com',
    authority: 9,
    filter: true,
  },
  {
    id: 'perplexity-changelog',
    name: 'Perplexity Changelog',
    url: 'https://docs.perplexity.ai/changelog',
    // Cloudflare blocks plain fetch here; this one goes through claude -p + WebFetch.
    type: 'webfetch',
    authority: 8,
    filter: false,
  },
];

// Pages nobody announces changes to. A sha256 of the extracted text is stored;
// when it moves, the before/after goes to the LLM to describe what changed.
// This is where crawler policy and AI-surface behaviour actually shifts first.
export const TIER3 = [
  {
    id: 'google-ai-features',
    name: 'Google — AI features & your site',
    url: 'https://developers.google.com/search/docs/appearance/ai-features?hl=en',
    authority: 10,
  },
  {
    id: 'google-crawlers',
    name: 'Google — Common crawlers (Google-Extended etc.)',
    url: 'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers?hl=en',
    authority: 10,
  },
  {
    id: 'google-ranking-updates',
    name: 'Google — Ranking updates log',
    url: 'https://developers.google.com/search/updates/ranking?hl=en',
    authority: 10,
  },
  {
    id: 'openai-bots',
    name: 'OpenAI — Crawlers (GPTBot, OAI-SearchBot, ChatGPT-User)',
    url: 'https://platform.openai.com/docs/bots',
    authority: 9,
  },
  {
    id: 'perplexity-bots',
    name: 'Perplexity — Crawlers',
    url: 'https://docs.perplexity.ai/guides/bots',
    authority: 8,
  },
  {
    id: 'llmstxt',
    name: 'llms.txt specification',
    url: 'https://llmstxt.org/',
    authority: 6,
  },
];
