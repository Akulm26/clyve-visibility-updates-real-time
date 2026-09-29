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
    id: 'google-gemini',
    name: 'Google — The Keyword (Gemini)',
    url: 'https://blog.google/products/gemini/rss/',
    type: 'rss',
    authority: 8,
    filter: true,
  },
  {
    id: 'schemaorg-releases',
    name: 'Schema.org releases',
    url: 'https://github.com/schemaorg/schemaorg/releases.atom',
    type: 'atom',
    authority: 7,
    filter: false,
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
    id: 'openai-release-notes',
    name: 'OpenAI — ChatGPT release notes',
    url: 'https://openai.com/products/release-notes/',
    // The page itself 403s to every automated fetch, but OpenAI's robots.txt is
    // `Allow: /` — this is bot detection, not a policy refusal. Two things make
    // it reachable anyway: the sitemap exposes a real per-page `lastmod`, and
    // search engines have indexed the content. So we watch the timestamp, and
    // only when it moves do we spend a search call to find out what changed.
    type: 'sitemap-search',
    sitemap: 'https://openai.com/sitemap.xml/page/',
    authority: 9,
    filter: true,
  },
  {
    id: 'perplexity-hub',
    name: 'Perplexity — Publisher & product announcements',
    url: 'https://www.perplexity.ai/hub/blog',
    // The only source with no cheap trigger. Perplexity's robots.txt permits
    // /hub/, but Cloudflare blocks every fetch and the hub sub-sitemap 403s too,
    // so there is no free "did it change" signal to gate on. A search sweep is
    // the only way in, so it runs weekly rather than every scan — one call a
    // week, not four a day.
    type: 'search-sweep',
    cadence: 'weekly',
    query:
      'new posts on the Perplexity hub blog (perplexity.ai/hub/blog) about the ' +
      'Publishers Program, revenue sharing, citations, or how Perplexity selects sources',
    hosts: ['perplexity.ai'],
    authority: 8,
    filter: false,
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
    id: 'anthropic-crawlers',
    name: 'Anthropic — ClaudeBot, Claude-User & Claude-SearchBot',
    // Three separate agents with three separate meanings: ClaudeBot for training,
    // Claude-User for live fetches, Claude-SearchBot for what Claude cites. The
    // last is the one that decides whether Claude can quote a page.
    url: 'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler',
    authority: 9,
  },
  {
    id: 'openai-web-search',
    name: 'OpenAI — Web search & citation behaviour',
    url: 'https://platform.openai.com/docs/guides/tools-web-search',
    authority: 8,
  },
  {
    id: 'apple-applebot',
    name: 'Apple — Applebot & Applebot-Extended',
    // Apple revises this page without announcing it; the AI-training opt-out
    // control lives here and nowhere else.
    url: 'https://support.apple.com/en-us/119829',
    authority: 9,
  },
  {
    id: 'ietf-aipref',
    name: 'IETF — AI Preferences working group',
    // Where the industry-wide successor to robots.txt opt-outs is being drafted.
    url: 'https://datatracker.ietf.org/wg/aipref/documents/',
    authority: 7,
  },
  // Bing's help pages render entirely in JavaScript, so there is no server-side
  // text to fingerprint. The page itself loads each article from a public,
  // unauthenticated JSON endpoint — /webmasters/api/help/htmlcontent — which we
  // read directly. `url` stays the human-readable page so links in the digest
  // point somewhere a person can actually open.
  //
  // This is where Bing documents whether Copilot may quote a page at all, so a
  // silent edit here matters more than most blog posts.
  {
    id: 'bing-webmaster-guidelines',
    name: 'Bing — Webmaster Guidelines',
    url: 'https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a',
    type: 'bing-help',
    api: 'https://www.bing.com/webmasters/api/help/htmlcontent?ArticleId=30fba23a',
    authority: 9,
  },
  {
    id: 'bing-robots-meta',
    name: 'Bing — Robots meta tags (noarchive, nocache)',
    url: 'https://www.bing.com/webmasters/help/which-robots-metatags-does-bing-support-5198d240',
    type: 'bing-help',
    api: 'https://www.bing.com/webmasters/api/help/htmlcontent?ArticleId=5198d240',
    authority: 9,
  },
  {
    id: 'bing-ai-performance',
    name: 'Bing — AI Performance reporting',
    url: 'https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c',
    type: 'bing-help',
    api: 'https://www.bing.com/webmasters/api/help/htmlcontent?ArticleId=9f8e7d6c',
    authority: 9,
  },
  {
    id: 'bing-crawlers',
    name: 'Bing — Which crawlers Bing uses',
    url: 'https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0',
    type: 'bing-help',
    api: 'https://www.bing.com/webmasters/api/help/htmlcontent?ArticleId=8c184ec0',
    authority: 8,
  },
  {
    id: 'ms-copilot-web-access',
    name: 'Microsoft — How Copilot accesses the public web',
    // Bing's own webmaster help pages are a JavaScript app with no server-side
    // text, so they cannot be fingerprinted. Microsoft Learn is server-rendered
    // and carries the same substance: what Copilot may read, and how.
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/manage-public-web-access',
    authority: 8,
  },
  {
    id: 'ms-copilot-grounding',
    name: 'Microsoft — Public websites in Copilot generative answers',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-ai-public-websites',
    authority: 8,
  },
  {
    id: 'llmstxt',
    name: 'llms.txt specification',
    url: 'https://llmstxt.org/',
    authority: 6,
  },
];
