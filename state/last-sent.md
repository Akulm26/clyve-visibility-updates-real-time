<!-- breaking alert · 2026-11-05T00:57:04.237Z -->

*⚡ AEO radar · Breaking · 2 items · Nov 4, 4:56 PM*

Two updates: Anthropic quietly changed how it treats "no AI training" requests from websites, and Cloudflare published a post on controlling personal AI agents.

———

*🔴 Anthropic now honors a "no AI training" signal*
_Anthropic help docs · November 5, 2026_

*Synopsis*
Anthropic edited its help page on web crawlers with no announcement. It now says it respects a new "no AI training" preference from site owners.
· Since October 30, 2026, Anthropic recognizes a machine-readable signal saying a site's content must not train AI models.
· Rollout covers all Anthropic services, globally, "over time". No dates were given.
· If your robots.txt names ClaudeBot, that rule beats any general setting that says something different.
· The signal follows an IETF draft (aipref). Anthropic says how it reads these settings may change.
· The page also now links to a separate page on Anthropic-hosted browsers that act for users.

*What the terms mean*
ClaudeBot — Anthropic's crawler that gathers web pages to train its AI
Crawler — a program that visits websites and reads their pages automatically
robots.txt — a file on your site telling bots which pages they may visit
AI training — feeding content into a model so it learns from it
IETF — the group that sets many of the internet's technical standards
aipref — the IETF working group drafting a standard for "no AI training" preferences

*Why it matters for your content*
You can now say "don't train on my pages" and have Anthropic say it will listen. Blocking training can also reduce how much of your brand the model has learned. That is a trade-off between protecting content and being known by the AI. Naming ClaudeBot in robots.txt overrides your general setting.

*Example*
A skincare brand has a general "no AI training" setting. Its robots.txt also has an old rule allowing ClaudeBot on its blog. Anthropic follows the ClaudeBot rule, so the blog may still be used for training. This is an invented scenario.

*Do this*
Open your robots.txt, check whether ClaudeBot is named, and confirm the rule matches what you want.

https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler

———

*🟠 Cloudflare launches visibility and control for personal agents*
_Cloudflare Blog (AI) · November 4, 2026_

*Synopsis*
A Cloudflare blog post on new visibility and control for personal agents. We only had the title and tags, not the article text.
· Titled "See the agents, set the terms", it pairs seeing agent visits with setting rules for them.
· Tagged AI, Analytics, Bot Management, Product News and Security.
· Details such as features, availability and pricing were not in the material we had.

*What the terms mean*
Cloudflare — a web infrastructure company whose services sit in front of many websites
Personal agents — AI assistants that act for one person, such as browsing sites on their behalf
Bot management — tools that identify automated visitors to a site and decide what they may do

*Why it matters for your content*
More AI visits now come from assistants acting for individual people, not only from big crawlers. If your site sits behind Cloudflare, you may soon be able to see those visits. That would show which of your pages these agents read, and that is discovery you can't currently measure.

*Example*
A shopper asks a personal assistant to "find a gluten-free protein bar under ₹500". The assistant opens your product page. Today that visit looks like noise in your analytics. With agent visibility, you could see which pages get read. This is an invented scenario.

*Do this*
Read the post, then ask whoever manages your Cloudflare account what it can show about AI agents visiting your site.

https://blog.cloudflare.com/personal-agents-visibility-control/
