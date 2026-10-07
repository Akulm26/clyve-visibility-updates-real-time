<!-- breaking alert · 2026-10-07T16:11:58.438Z -->

*⚡ AEO radar · Breaking · 1 item · Oct 7, 9:11 AM*

One update: Anthropic quietly edited a support page about its AI crawlers.
———
*🟠 Anthropic quietly edits its crawler support page*
_Anthropic — ClaudeBot, Claude-User & Claude-SearchBot · October 7, 2026_

*Synopsis*
Anthropic's support article explaining its ClaudeBot, Claude-User, and Claude-SearchBot crawlers was edited with no public announcement.
· Change was limited to the "Related Articles" sidebar — links swapped, not the crawler rules themselves.
· Removed link: "Does Anthropic Act as a Data Processor or Controller?"
· Added links: "Business Associate Agreements (BAA) for Commercial Customers" and a general "How to get support" page.
· Nothing in the actual crawler-blocking instructions was shown as changed.

*What the terms mean*
ClaudeBot — Anthropic's crawler that visits pages to gather data for training Claude.
Claude-User — the bot Claude sends out live, mid-chat, when someone asks it to look at a specific page.
Claude-SearchBot — the crawler Anthropic uses to fetch pages for search and answer features.
BAA (Business Associate Agreement) — legal contract letting regulated industries (e.g. healthcare) use a vendor's AI under privacy rules.

*Why it matters for your content*
This edit itself didn't touch crawling or blocking rules. But it shows Anthropic is actively maintaining the one page that tells you how to allow or block its AI bots — the page you'd need if you ever want to control whether your content trains Claude or gets cited by it.

*Example*
Say your robots.txt blocks ClaudeBot (no training) but allows Claude-User (so Claude can still fetch and cite your pages live in chat). If a future edit to this page renames or redefines a bot, a rule written by bot name could silently stop working.

*Do this*
Check your robots.txt now to confirm it still correctly names ClaudeBot, Claude-User and Claude-SearchBot.

https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
