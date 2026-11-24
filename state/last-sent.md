<!-- breaking alert · 2026-11-24T11:02:06.465Z -->

*⚡ AEO radar · Breaking · 1 item · Nov 24, 3:01 AM*

New research finds AI search tools ignore several of the rules publishers use to control them, and the findings affect how your pages get read and reused.

———

*🟠 AI search tools ignore publisher rules*
_arXiv — AI search & citation research · November 24, 2026_

*Synopsis*
A black-box measurement study of how AI search agents from OpenAI, Anthropic, xAI and Google fetch, read and reuse web pages. It also covers the consumer apps of ten services.
· OpenAI and xAI do not honor robots.txt. No service acts on Retry-After.
· No service reads JavaScript-only content. xAI reads only the first 0.5 MB of a page. OpenAI drops some formats.
· OpenAI, Anthropic and xAI share fetched pages across users and largely ignore Cache-Control.
· Answers can reflect outdated pages for 30 minutes to a day or more.
· The authors conclude publishers lack effective control. The code and data are released.

*What the terms mean*
AI search agents — AI tools that fetch web pages live to answer a user's question
Black-box measurement study — researchers test a system from the outside, without seeing how it works inside
robots.txt — a file on your site telling bots which pages they may not visit
Retry-After — a signal telling a bot to wait before it asks again
Cache-Control — a setting that says how long a saved copy of your page may be reused
JavaScript-only content — text that appears only after a script runs, not in the page's basic HTML
Search APIs — the paid feeds developers use to plug an AI vendor's search into their own products

*Why it matters for your content*
Blocking or throttling AI tools may not work, so you cannot assume robots.txt keeps your pages out of AI answers. Content that sits behind scripts, or deep in a very long page, may never be read, so it cannot be cited. Changes you make can take up to a day or more to show up in AI answers, because copies of your pages are shared across users.

*Example*
Your product page loads its price and feature table through a script. A buyer asks an AI tool, "How much does [your brand] cost for a team of 10?" Before: the tool cannot see the table, so it answers from a reseller's page or leaves you out. After: the price sits in plain page text near the top, so the tool can read and cite it. Later you cut the price. Shared copies mean some answers may still quote the old price for hours, or longer.

*Do this*
Check that your pricing, product facts and key claims appear as plain text near the top of each page, not only behind scripts.

https://arxiv.org/abs/2611.30546
