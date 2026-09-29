<!-- breaking alert · 2026-09-29T10:12:26.482Z -->

Breaking item ready below, plain English per format spec.

*⚡ AEO radar · breaking*

Cloudflare split search crawling from AI training crawling — one new switch instead of one blunt block.

———

*Cloudflare lets you block AI training, keep search visibility*
_Cloudflare Blog (AI) · 2026-09-15_

*What happened*
Cloudflare rolled out controls for "mixed-use" AI crawlers — bots that fetch your pages for two different jobs at once: indexing you for search, and training AI models. Site owners can now allow the crawl for search while refusing it for training, on crawlers that support this split.

*What the terms mean*
Mixed-use crawler — a single bot that fetches your site for more than one purpose (search indexing and AI training) under one identity, so blocking it used to mean blocking both at once.

*Why it matters for your content*
Until now, blocking AI training crawlers on a shared bot risked also losing search visibility and AI-answer citations, since it was all-or-nothing. This gives you a way to cut off training use of your content without dropping out of search or citation-worthy AI answers.

*Example*
Say your pricing page is crawled by a mixed-use bot. Before: blocking it to stop AI training also meant it could vanish from Google and get skipped in AI Overviews (Google's AI-written answer box above the blue links). After: you can permit the crawl for indexing/citation, deny it for training, same bot.

*Do this*
Check your crawler/bot-blocking settings and separate "allow for search" from "allow for AI training" wherever that option now exists.

https://blog.cloudflare.com/accountable-mixed-use-ai-crawlers/
