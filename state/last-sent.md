<!-- weekly digest · 2026-11-17T03:05:26.097Z -->

*AEO radar · Weekly digest · week of November 16, 2026*

Eight updates this week: how Google's crawler behaves after a site move, new AI search tools from Perplexity, OpenAI and Gemini, three research papers, and one standards-body listing. 📡

———

*🟡 Moving to a CDN can spike Google crawling*
_Google Search Central Blog · November 11, 2026_

*Synopsis*
Google explained why crawler traffic often jumps right after a site moves behind a CDN.
· Faster responses make Google's crawler raise how often it visits, because it reads speed as a sign of a stronger server.
· A new CDN starts with an empty cache, so early requests still go back to your original server.
· Result: the traffic spike you wanted to avoid can hit your server first.
· Google points to its pages on crawl budget and on lowering its crawl rate in emergencies.

*What the terms mean*
CDN (Content Delivery Network) — a network of servers around the world that keeps copies of your pages close to visitors
Origin server — the main server that holds your original content
Googlebot — Google's crawler, the program that reads your pages
Crawl budget — how much Google is willing to read on your site
Cold cache / cache miss — a CDN with no saved copies yet, so it must fetch each page from your origin

*Why it matters for your content*
If your server is overloaded during a migration, pages can load slowly or fail. That can hurt how reliably Google reads and refreshes your pages. This is a timing problem during the move, not a permanent one.

*Example*
Your store moves its 40,000 product pages behind a CDN on a Monday. Googlebot sees faster responses and crawls harder. The CDN has no copies yet, so every request hits your origin and the site slows down.

*Do this*
Before any CDN move, ask your tech team how they will watch server load and slow Google's crawl if needed.

https://developers.google.com/search/blog/2026/11/crawling-cdn

———

*🟡 Perplexity's decision tool now checks the live web*
_Perplexity — Publisher & product announcements · November 4, 2026_

*Synopsis*
Perplexity added live web search to its Decisions API, so its answers use current facts.
· One setting, "mode": "web_grounding", makes it search the web before answering.
· On a 100-question test of current-fact questions, accuracy rose from 51% to 86%.
· Typical responses come back in under 400 milliseconds.
· You can point it at a specific web page, and it answers from that page's text.
· The response lists the search results the model used.

*What the terms mean*
Decisions API — a Perplexity tool developers use to get probability answers (yes/no, pick an option, or a score) about some content
Web grounding — letting the AI look up live web pages before it answers
Benchmark — a fixed set of test questions used to compare accuracy

*Why it matters for your content*
Tools built on this will answer from whatever the live web says about you at that moment. Out-of-date pages become wrong answers. Clear, current pages become the evidence.

*Example*
A partner's tool asks, "Is Priya Shah still the CEO of your company?" If your About page still lists a former CEO, the tool may answer from it. If the page is current and plainly worded, it has the right evidence.

*Do this*
Audit your leadership, pricing and product-launch pages this week and fix anything out of date.

https://www.perplexity.ai/hub/blog/web-grounding-for-the-decisions-api

———

*🟡 OpenAI quietly updated its web search docs*
_OpenAI — Web search & citation behaviour · November 13, 2026_

*Synopsis*
OpenAI edited its web search developer guide without announcing it.
· The page now shows examples for setting how much search context to use and running longer searches.
· Examples show developers listing sources, and allowing or blocking specific sites, including a block on reddit.com, quora.com and wikipedia.org.
· There is also an example for searching for images.
· Code samples moved from JavaScript to TypeScript.

*What the terms mean*
Web search tool — the feature that lets OpenAI's models look up live web pages
Citation — when an AI answer names your page as a source
Domain filter — a list that tells the AI which sites it may or may not use

*Why it matters for your content*
Developers building on OpenAI can steer which sites feed the answer. That means your citations can depend on a builder's choices, not only your content. Image search also suggests pictures can become a discovery route.

*Example*
A health app limits its AI to five medical sites. A wellness brand's article, however good, never gets cited in that app.

*Do this*
Ask your team to test your ten most important questions in ChatGPT with search on, and log whether your pages appear as sources.

https://platform.openai.com/docs/guides/tools-web-search

———

*🟡 Gemini now answers questions inside Chrome*
_Google — The Keyword (Gemini) · November 12, 2026_

*Synopsis*
Google showed how to use Gemini in Chrome to get answers without leaving the page.
· Click the Gemini icon in the Chrome toolbar to open a side panel.
· Ask it to summarize a dense report, compare product details, or explain hard topics simply.
· You stay on the page while you do it.

*What the terms mean*
Side panel — a strip beside the web page where Gemini appears
Gemini — Google's AI assistant

*Why it matters for your content*
Visitors can now have an AI read your page for them. What they see may be the AI's summary, not your wording. Pages with clear, specific facts are easier to summarize and compare correctly.

*Example*
A buyer opens your pricing page and asks Gemini, "Compare these three plans." If the plans differ only in vague labels like "Pro" and "Plus", the comparison comes out muddy. If each lists seats, storage and price, it comes out clean.

*Do this*
Open your top product page in Chrome, ask Gemini to summarize and compare it, and fix anything it gets wrong or vague.

https://blog.google/innovation-and-ai/products/gemini-app/research-with-gemini-in-chrome/

———

*🟡 Study: AI search favors fewer, bigger sources*
_arXiv — AI search & citation research · November 10, 2026_

*Synopsis*
A research paper analyzed 2.8 million AI and regular search results from 24,000 queries in 243 countries.
· Google AI Overviews went from 7 countries in 2024 to 229 in 2025. France, Turkey, China and Cuba were left out.
· AI answers to Covid queries rose from 1% in 2024 to over 66% in 2025.
· AI search showed fewer long-tail sources and less variety in its answers than regular search.
· It also showed more low-credibility sources than regular search.

*What the terms mean*
AI Overviews (the AI-written answer Google puts above the blue links)
Long-tail sources — small, niche sites rather than big well-known ones

*Why it matters for your content*
If AI answers lean on fewer sources, smaller publishers have a harder time being named. Distinct, specific content matters more because there are fewer slots. The authors also note this could weaken the reasons to create new content.

*Example*
A small gardening blog ranks well for "how to repot a monstera" in regular search. The AI answer above it cites two large publishers, so the blog gets no mention.

*Do this*
Check whether an AI Overview appears for your top ten queries, and note which sources it cites.

https://arxiv.org/abs/2602.13415

———

*🟡 E-GEO: first big test set for shopping AI*
_arXiv — AI search & citation research · November 10, 2026_

*Synopsis*
Researchers built E-GEO, a test set for improving product listings in AI shopping answers.
· It has 13,746 realistic shopper questions, each paired with 10 Amazon listings.
· They tested five AI engines, seven AI rewriters and fifteen rewriting rules.
· Prompts optimized separately converged on a similar pattern, which hints at a shared strategy.
· They also tested attacks on the system, and a simple in-prompt defense was part of the results.

*What the terms mean*
GEO (generative engine optimization) — shaping your content so AI answers pick and show it
Generative engines — AI tools that write answers instead of listing links
LLM rewriters — AI that rewrites your text, here product listings
Heuristics — rules of thumb, such as "add more detail"
Red-team — deliberately attack a system to find its weak spots

*Why it matters for your content*
Until now, much GEO advice has been guesswork. This gives the field a shared way to test what works on product listings. Expect agencies to start citing it.

*Example*
Two listings for a "waterproof hiking backpack for monsoon trekking" exist. One has a generic description. The other is rewritten to match the multi-sentence way real shoppers phrase their needs. The study tests whether that kind of rewrite changes which product the AI shows.

*Do this*
Nothing to do yet — just know it's coming.

https://arxiv.org/abs/2511.20867

———

*🟡 ChatGPT sends far fewer clicks than Google*
_arXiv — AI search & citation research · November 13, 2026_

*Synopsis*
A study of U.S. desktop browsing data compared ChatGPT and Google referrals.
· Referrals came with 5.4% of ChatGPT sessions, versus 31.1% of Google queries.
· Ad-supported sites got a smaller share of ChatGPT referrals than of Google's.
· Reference and technical sites got a larger share.
· Searches on Google, Bing and Yahoo fell after people adopted ChatGPT.

*What the terms mean*
Clickstream data — records of which sites people visit and click
Referral — a visit sent to your site from another one
ChatGPT Search — ChatGPT's feature that looks up live web pages

*Why it matters for your content*
Being cited in an AI answer does not mean a click. Most ChatGPT sessions end without sending a visitor anywhere. Brands will need to judge success by mentions and brand recall, not only traffic.

*Example*
Your how-to guide is cited in 1,000 ChatGPT answers. At the study's average, roughly 54 of those sessions send a visitor. The same guide in 1,000 Google searches would send about 311.

*Do this*
Set up ChatGPT as its own traffic source in your analytics so you can track it apart from Google.

https://arxiv.org/abs/2607.07652

———

*⚪ AI-preference standards drafts get updated*
_IETF — AI Preferences working group · November 16, 2026_

*Synopsis*
The internet standards body's AI Preferences page was edited without announcement.
· It lists draft proposals, including embedded attribution and rights marks, and a machine-readable training preference signal dated October 30, 2026.
· Others cover verifiable compliance records and a verifiable-credential binding.
· The visible change looks small: the "New" label was dropped from one entry.

*What the terms mean*
IETF — the group that writes technical standards for the internet
AI Preferences working group — the IETF team defining how sites can say how AI may use their content
I-D (Internet-Draft) — an early proposal, not a finished standard
Training — AI companies using your pages to teach their models

*Why it matters for your content*
These drafts are early attempts at a common way to tell AI companies how your content may be used. Nothing here is final. If one becomes a standard, it could shape how you protect or license your content.

*Example*
Your publishing team could one day mark articles as "fine to quote, not fine for training" in a standard format that every AI company reads.

*Do this*
Nothing to do yet — just know it's coming.

https://datatracker.ietf.org/wg/aipref/documents/
