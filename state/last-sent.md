<!-- catch-up digest · 2026-10-14T09:24:17.287Z -->

*AEO radar · Catch-up · 5 items · Oct 14, 2:22 AM*

Five new research papers on what really drives AI citations, brand bias, and ranking manipulation in AI search.
———
*🔴 AI picks citations by hidden sub-searches, not page tweaks*
_arXiv — AI search & citation research · October 14, 2026_

*Synopsis*
A study of 158,099 answers to commercial questions from ChatGPT, Gemini and Perplexity, with 468,037 citations, across two 90-day datasets in contrasting markets.
· Pages whose title and text match real search questions get cited more than similar pages on the same site.
· FAQ blocks, structured data, summary boxes and site speed only matter when comparing different websites, not pages within one.
· Query fan-out explains 32% of citation differences between pages; page features explain just 2.8%.
· ChatGPT writes brand names it already knows into its searches, and names brands even with no supporting page.
· Brand name alone reordered ChatGPT's product rankings in tests, even when products had identical specs.

*What the terms mean*
Generative Engine Optimization (GEO) — structuring content so AI chat tools cite it as a source.
Citation — when an AI answer names or links to your page as its source.
Query fan-out — the AI secretly runs several related searches behind your one question, then picks citations from those results.
Retrieval — the step where the AI's search finds candidate pages before it writes an answer.

*Why it matters for your content*
Matching the literal phrasing of real buyer questions in titles and body text beats generic checklist SEO like FAQ schema. Since hidden sub-searches decide citations far more than page polish, win by targeting the exact questions buyers type. Brand recognition also biases citations regardless of facts, so brand mentions elsewhere feed AI visibility too.

*Example*
A SaaS pricing page titled "Our Pricing" targets "best CRM for small teams under $50/month." ChatGPT's hidden sub-searches look more like "cheap CRM software 2026" or "CRM pricing comparison small business" — a page titled "Best CRM for Small Teams Under $50/Month" matches that phrasing and gets picked up instead.

*Do this*
Rewrite page titles and intros to mirror buyers' literal question phrasing, not just add FAQ schema.

https://arxiv.org/abs/2610.15033
———
*🔴 AI Overviews boost Reddit engagement, AI Mode erases it*
_arXiv — AI search & citation research · October 14, 2026_

*Synopsis*
A study comparing Google AI Overviews' effect on safe-for-work vs not-safe-for-work Reddit communities (the latter barred from AI Overview citations), using a before/after comparison design.
· AI Overviews raised daily comments on eligible Reddit communities by 12.0% versus communities barred from citation.
· Commenting users on those communities rose 12.4% compared to the barred group.
· Gains concentrated in opinion, advice and personal-experience discussions, not fact-based Q&A content.
· Google AI Mode wiped out most of these engagement gains after it launched.

*What the terms mean*
AI Overviews — the AI-written answer Google puts above the blue links.
AI Mode — Google's chat-style search feature, where AI Overviews becomes a back-and-forth conversation instead of one answer.

*Why it matters for your content*
Being cited in AI Overviews can still drive engagement for opinion and experience-style content (reviews, advice, discussions). But AI Mode's conversational format can cut that referral benefit once users chat instead of clicking through. Content type and interface, not just citation, determine whether you actually see traffic.

*Example*
A home-appliance review site runs a "best air fryers 2026 — real owner opinions" page that gets cited in AI Overviews and sees a traffic bump. After AI Mode rolls out more widely, clicks on that same page could flatten, the way Reddit's gains did.

*Do this*
Track referral traffic from AI Overview-cited, opinion-style pages separately, so you can spot if AI Mode erodes it.

https://arxiv.org/abs/2605.16428
———
*🟠 ChatGPT citations shift across model versions and modes*
_arXiv — AI search & citation research · October 14, 2026_

*Synopsis*
A study of ChatGPT Web across four settings (GPT-5.2 to 5.5, Instant and Thinking modes), tracing how it rewrites queries, retrieves pages, and picks citations.
· Instant modes mostly search once per answer; GPT-5.4 Thinking mode often runs multiple retrieval rounds.
· Pages retrieved more often across repeated runs are also more likely to get cited.
· Google Search and OpenAI's Responses API, used as outside stand-ins, each recover only part of ChatGPT's real citations.
· Combined, both outside signals still recover only about one quarter of the URLs ChatGPT actually cites.

*What the terms mean*
Instant mode — ChatGPT answers fast in one search pass.
Thinking mode — ChatGPT searches and reasons across multiple rounds before answering.
Responses API — OpenAI's developer tool, used here as a stand-in to guess what ChatGPT would retrieve.

*Why it matters for your content*
Tools that estimate "AI visibility" from Google rank or public APIs will miss most of what ChatGPT actually cites — there's no reliable outside proxy. Monitoring needs direct test prompts in ChatGPT itself, not borrowed rank data. Thinking mode's multiple search rounds also mean a page can get reconsidered several times per answer, rewarding pages that keep resurfacing.

*Example*
A travel brand uses an SEO tool's "AI visibility" score based on Google ranking as a stand-in for ChatGPT citations. This study suggests that proxy could miss roughly three-quarters of what ChatGPT truly cites.

*Do this*
Don't trust Google-rank or API-based "AI citation" proxies; verify with direct test prompts in ChatGPT.

https://arxiv.org/abs/2610.15382
———
*🟠 Big brand names dominate LLM product picks easily*
_arXiv — AI search & citation research · October 14, 2026_

*Synopsis*
Three experiments testing GPT-4o-mini, Claude Sonnet and Gemini 3 Flash on skincare recommendations, a category where buyers can't easily judge quality upfront.
· Well-known brands got recommended 100% of the time when rival products had identical specs.
· A rival brand beating it by just +0.1 star rating broke that 100% dominance completely.
· Authority-styled marketing language, including fabricated evidence claims, also broke the monopoly, with each model reacting differently.
· When every brand used the same tricks, individual gains collapsed to near zero, and non-participants got zero recommendations.

*What the terms mean*
Conditional Monopoly — one brand gets recommended almost every time, until some small input changes.
Payoff — a model's estimate of a brand's expected gain from using GEO tactics.

*Why it matters for your content*
Being a known, incumbent brand gives a default edge in LLM recommendations, but that edge is fragile — a tiny rating gap or a competitor's authoritative-sounding copy can flip it. If every brand in a category starts optimizing the same way, the whole category can lose value together, not just compete against each other.

*Example*
A mid-size skincare brand at 4.3 stars competes against a famous incumbent. This study suggests about 20 more strong reviews (just +0.1 star) could be enough to break the incumbent's lock on ChatGPT's recommendations.

*Do this*
Prioritize collecting genuine, higher-rated reviews over copying competitors' authority-style marketing language.

https://arxiv.org/abs/2606.17443
———
*🟠 New benchmark tests tricks to rig AI rankings*
_arXiv — AI search & citation research · October 14, 2026_

*Synopsis*
A new benchmark, GEO-Bench, scores ranking-manipulation attacks and legitimate GEO strategies under one shared test, using a fixed publicly available AI model as the ranker.
· Benchmark compares prompt-based attacks, gradient-based attacks and ten legitimate content strategies side by side.
· Attacks that boost rank more are generally easier to detect, and vice versa.
· Rewriting content in natural language matched or beat technical attacks at boosting rank, while reading more naturally.
· How much access an attacker has to the model did not predict how strong the attack was.

*What the terms mean*
White-hat — legitimate, above-board tactics, as opposed to manipulative ones.
Prompt-based attack — rewriting visible text to fool the AI into ranking it higher.
Gradient-based attack — using the model's internal workings to craft manipulative wording.

*Why it matters for your content*
Real manipulation techniques exist for AI rankings and citations, and some evade detection while reading naturally — meaning bad actors could out-rank honest content undetected. This benchmark measures legitimate techniques against manipulative ones side by side, which likely feeds into platforms tightening detection over time.

*Example*
A competitor rewrites their product page copy with subtle phrases proven to boost ranking, without tripping obvious spam filters — similar to the natural-language rewriting this study found effective and hard to detect.

*Do this*
Nothing to do yet — just know it's coming; watch for platform detection updates targeting this kind of manipulation.

https://arxiv.org/abs/2605.29107
