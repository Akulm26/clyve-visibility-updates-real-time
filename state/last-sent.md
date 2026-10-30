<!-- breaking alert · 2026-10-30T02:58:32.580Z -->

*⚡ AEO radar · Breaking · 1 item · Oct 29, 7:58 PM*

One Perplexity page changed without an announcement. It explains how to let its crawlers into your site.

———

*🟠 Perplexity quietly rewrites its crawler setup guide*
_Perplexity — Crawlers · October 30, 2026_

*Synopsis*
Perplexity edited its public crawler documentation page and did not announce the change.
· The Cloudflare firewall steps were rewritten. Each bot is now matched against its own list of IP addresses.
· The links to the official IP address lists now point to perplexity.ai instead of perplexity.com.
· The example user-agent strings changed. The old "AppleWebKit/537.36 (KHTML, like Gecko)" wording is gone.
· Perplexity-User still generally ignores robots.txt, because a person asked for the page.

*What the terms mean*
PerplexityBot — Perplexity's crawler. It visits pages so they can show up in Perplexity's answers.
Perplexity-User — A separate Perplexity visitor. It fetches a page when a person asks Perplexity to.
User-agent string — The name tag a bot shows your site when it visits.
robots.txt — A file on your site that tells bots which pages they may visit.
WAF (Web Application Firewall) — Security software that blocks suspicious traffic before it reaches your site.
IP ranges — The published numeric addresses a bot's traffic comes from. They let you check a visitor is who it claims to be.
Cloudflare — A popular service that hosts a WAF in front of websites.

*Why it matters for your content*
If your firewall blocks Perplexity's bots, your pages can't be read or cited in Perplexity answers. You would lose discovery there and never see an error. A firewall rule built from the old instructions may now be out of date or set up wrongly. That is a quiet way to disappear from one AI answer engine.

*Example*
A skincare brand's security team set up a Cloudflare rule last year, using the old steps and the old perplexity.com IP lists. Someone asks Perplexity, "best vitamin C serum for sensitive skin". The brand's product guide is never cited, because the firewall turned the crawler away. After the team rebuilds the rule from the new page, the crawler can read the guide again.

*Do this*
Ask whoever manages your website security to compare your Perplexity firewall rule with the new page and reload the IP lists from the perplexity.ai links.

https://docs.perplexity.ai/guides/bots
