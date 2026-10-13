<!-- weekly digest · 2026-10-13T00:50:42.448Z -->

*AEO radar · Weekly digest · week of October 12, 2026*

Two updates this week — a quiet edit to an internet-standards drafts page, and a new tool for catching AI's fake citations.
———
*🟡 IETF quietly edits its AI rules drafts page*
_IETF — AI Preferences working group · October 12, 2026_

*Synopsis*
The IETF's AI Preferences group edited its drafts listing page with no announcement, and one draft disappeared.
· Listed related drafts dropped from 7 to 6.
· "Crawler best practices," a draft co-authored by Google's Gary Illyes, dropped off the page.
· Five other drafts — on usage grants, compliance records, attribution marks, and vocabulary — stayed listed.

*What the terms mean*
IETF — the global body that writes core internet standards (same group behind HTTP).
AI Preferences (AIPREF) — the IETF's in-progress standard letting sites tell AI crawlers what they can and can't do with their content, a successor to robots.txt.
Internet-Draft (I-D) — a proposal on the path to becoming an official standard, not yet final.

*Why it matters for your content*
AIPREF is the group that will likely define how sites control AI crawling, training, and "grounding" (letting an AI quote your page in an answer) separately, instead of one blunt robots.txt block. Nothing final yet, but worth knowing the vocabulary before it ships.

*Example*
Say your site blocks GPTBot outright today. Once AIPREF is final, you could instead allow AI engines to quote your pages in answers while still refusing to let them train on your content — two separate switches instead of one.

*Do this*
Nothing to do yet — just know AIPREF is coming as robots.txt's more granular successor.

https://datatracker.ietf.org/wg/aipref/documents/
———
*🟡 New tool catches AI's fake science citations*
_arXiv — AI search & citation research · October 6, 2026_

*Synopsis*
A new tool called CiteCheck catches fake or garbled citations that AI models invent in scientific writing.
· Built and tested on a 982-citation physics set with deliberately planted citation errors.
· CiteCheck scored 88.7 macro-F1 and 88.9% accuracy at spotting bad citations.
· Beat GPT, Claude, and Gemini at the same task, including versions that used web search.

*What the terms mean*
LLM — a large language model, the AI behind chatbots like ChatGPT, Claude, and Gemini.
Citation hallucination — when an AI invents a fake source, or scrambles a real source's details, while making it look correct.
Macro-F1 — a single score blending how often a detector is right and how often it actually catches real errors.

*Why it matters for your content*
Tools that cross-check AI-generated citations against real sources are getting good — 88.9% accuracy here. Any AI-assisted content with invented or garbled references can now get caught, so verified sourcing becomes a trust and differentiation signal as scrutiny of AI content rises.

*Example*
A content team drafts a blog with AI claiming "a 2025 Gartner survey found 73% of buyers prefer X" — but no such study exists in that form. A CiteCheck-style check flags the mismatch before it goes live and damages credibility.

*Do this*
Add a citation-verification step, manual or tool-assisted, before publishing any AI-drafted content that cites stats or studies.

https://arxiv.org/abs/2605.27700
