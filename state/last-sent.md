<!-- breaking alert · 2026-10-04T03:00:20.091Z -->

*⚡ AEO radar · Breaking · 1 item · Oct 3, 7:59 PM*

One update today: Cloudflare says AI bots now outnumber human visitors on the web, and it's rolling out tools to see, control, and charge them.
———
*🟠 AI bots are now majority of web traffic*
_Cloudflare Blog (AI) · September 30, 2026_

*Synopsis*
Cloudflare (runs infrastructure behind roughly a fifth of the web) says automated traffic has overtaken humans, and is launching tools so site owners can manage it instead of just blocking it.
· Automated (non-human) requests now make up over 50% of all internet traffic, Cloudflare says.
· Requests from AI agents grew 1,700% year-over-year.
· 52% of crawler requests are now for AI training, up from 22% in Spring 2025.
· Some sectors saw human traffic drop 40% in under a year.
· Cloudflare launched separate controls for search crawling, agent access, and AI training — plus ways to charge bots per request.

*What the terms mean*
Crawler — automatic program that visits and reads web pages; search engines and AI tools both run them.
AI agent — software that acts on its own to complete a task, e.g. browsing sites to answer a user's question.
AI training — using scraped content to build or improve an AI model, different from citing it in a one-off answer.
Web Bot Auth — cryptographic signing that lets a site verify a bot is genuinely who it claims to be.
Pay Per Use / Monetization Gateway — new Cloudflare tools letting a site charge an AI company each time its bot requests the site's content.

*Why it matters for your content*
As AI answers pull content straight into chat instead of sending a click, visibility stops being about traffic and starts being about whether you're crawled, cited, and paid for it. These new controls let you split the decision three ways: allow AI search citation, block AI training, or charge for it. That's a licensing choice brands now have to make on purpose, not by default.

*Example*
A recipe site sees organic search visits down sharply this year. Checking Cloudflare's crawler dashboard, the team finds heavy AI-training-bot traffic with zero citations back. They block training with "Disallow AI Training" while still letting ChatGPT and Google crawlers cite the site in answers, and turn on Pay Per Use so any bot that still wants full-text access pays for it. (Illustrative scenario, not a reported case.)

*Do this*
If your site sits behind Cloudflare (many do), check your bot/crawler settings this quarter and decide, per AI company, whether you allow citation, block training, or charge for it.

https://blog.cloudflare.com/agentic-web/
