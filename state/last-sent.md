<!-- weekly digest · 2026-11-04T10:31:01.445Z -->

*AEO radar · Weekly digest · week of November 4, 2026*

Eight updates this week: one OpenAI docs edit, one standards-body update, and six research papers on how AI picks and cites sources.

———

*🟡 OpenAI quietly rewrote its web search guide*
_OpenAI — Web search & citation behaviour · November 4, 2026_

*Synopsis*
OpenAI edited its developer guide for web search with no announcement.
· New advice: build search on the Responses API with the web_search tool and a model called gpt-6-astra.
· Apps showing web results must display inline citations as prominent, clickable links.
· Older search setups are being retired. The o4-mini model shut down on October 23, 2026.
· The older preview search models were due to shut down on July 23, 2026.
· The old section describing three types of web search was removed.

*What the terms mean*
API — the way software talks to an AI model
Responses API — OpenAI's current API for building with its models
web_search — the tool that lets a model look things up on the web
Inline citations — source links shown inside the answer text
Reasoning model — a model that plans, then refines its searches as it reads results

*Why it matters for your content*
Apps built on OpenAI's search must show sources as clickable links. So a citation is a visible link, not just a mention. That makes being a cited source worth chasing.

*Example*
A shopper asks a chatbot built on OpenAI, "best running shoes for flat feet." The answer shows three clickable source links. Your buying guide is one of them, so you get a visit. Before, it might only have shaped the answer unseen.

*Do this*
Ask whoever runs your chatbots or site search whether they still use the retired OpenAI models.

https://platform.openai.com/docs/guides/tools-web-search

———

*🟡 Standards body updates AI usage-preference drafts*
_IETF — AI Preferences working group · October 28, 2026_

*Synopsis*
The IETF's AI Preferences group edited its document list with no announcement.
· The list now shows a new version, 03, of the grant-binding draft, dated October 27, 2026.
· That draft covers how a site can lift its AI usage preferences for specific parties.
· The other drafts on the list are carried over: attribution marks, compliance records, vocabulary parameters.

*What the terms mean*
IETF — the body that writes the technical standards of the internet
Working group — a team inside the IETF that drafts one standard
AIPREF — the working group's name: a shared way for sites to state how AI may use their content
Draft — a proposal still being worked on, not a rule

*Why it matters for your content*
If AIPREF becomes a standard, you could state your rules for AI use in one common format. Today that is patchy. These are drafts, so nothing is enforced yet.

*Example*
A publisher wants AI to quote its articles with credit but not train on them. A shared standard could let it say so once, in a form every AI company reads.

*Do this*
Nothing to do yet — just know it's coming.

https://datatracker.ietf.org/wg/aipref/documents/

———

*🟡 Rewriting pages around reader intent, without knowing queries*
_arXiv — AI search & citation research · October 28, 2026_

*Synopsis*
A research paper proposes RAID, a method for rewriting pages to be cited more by AI search.
· It works without knowing the exact questions users will ask.
· It infers the main question a page answers, then imagines who might ask it and why.
· It then rewrites the page using those intents.
· Tested on 100 samples and 500 questions it had not seen, it scored 3.00% and 1.32% relative improvement on two measures.

*What the terms mean*
Generative search engine — a search tool that writes an answer using AI, such as ChatGPT search
GEO (generative engine optimization) — shaping content so these tools show and cite it
Relative improvement — the gain compared with the unoptimized page

*Why it matters for your content*
Gains here are small, a few percent. But the idea is practical: you publish before you know the questions. Pages built around a clear intent seem to travel better.

*Example*
A "how to choose a CRM" page opens with a vague intro. After: it opens with "For a 10-person sales team, choose a CRM that does X, Y, Z," then covers buyers with other needs.

*Do this*
Pick one key page, write in one line the question it answers and who asks it, and check it opens with that answer.

https://arxiv.org/abs/2508.11158

———

*🟡 Researchers can now predict which pages get cited*
_arXiv — AI search & citation research · October 30, 2026_

*Synopsis*
A study tested tools that predict which pages AI engines cite, across ten answer engines given the same sources.
· The engines agreed with each other at a score of 0.704, where 1.0 is perfect agreement.
· The best predictors, without special training, scored 0.575 to 0.578.
· A small open model, GEO Citation Ranker 4B, scored 0.542 to 0.549.
· The authors released the model, benchmark, predictions and code.

*What the terms mean*
Reranker — a tool that sorts candidate pages by how useful they are for a question
Spearman correlation — a score of how closely two rankings match
Open model — an AI model whose weights anyone can download and run

*Why it matters for your content*
Different engines largely agree on which sources deserve citation. So one good page can win across engines. A free, small predictor also means page scoring before publishing may become cheap.

*Example*
Your team drafts three versions of a pricing-comparison page. A predictor ranks which is most likely to get cited, before you publish.

*Do this*
Forward this to whoever builds your measurement tools; no action needed otherwise.

https://arxiv.org/abs/2610.38090

———

*🟡 Google's health answers often miss their own sources*
_arXiv — AI search & citation research · October 30, 2026_

*Synopsis*
A study of 3,611 health questions compared Google's AI Overviews with its normal results.
· Overviews appeared for 96.4% of questions.
· Only 44.4% of the top five normal results were cited by the Overview.
· Overviews favoured commercial health sites like WebMD and Healthline over academic and government ones.
· An estimated 56.7% of cited statements were supported by the page cited.
· Another 20.8% of all statements were factual claims with no citation.

*What the terms mean*
AI Overviews — the AI-written answer Google puts above the blue links
Grounding — whether a claim is actually backed by the source it cites
Credibility criteria — standard checks of source quality

*Why it matters for your content*
Ranking high in normal results does not mean being cited in the Overview. And a citation does not guarantee your claim is quoted correctly. In health, this affects both traffic and reputation.

*Example*
A clinic's diabetes diet guide ranks fourth for "is fasting safe with type 2 diabetes." The Overview cites WebMD instead and summarizes the topic in a way the clinic's guide would not.

*Do this*
Check whether an AI Overview appears for your ten most important questions, who it cites, and whether it states your claims correctly.

https://arxiv.org/abs/2610.39339

———

*🟡 AI cites far fewer news sources than people visit*
_arXiv — AI search & citation research · October 30, 2026_

*Synopsis*
A study mapped ownership of 9,761 news outlets across 77 countries and compared it with what seven AI systems cite.
· AI citations are up to 2.08x more concentrated than web traffic.
· Counting by owner, concentration is a median 1.30x higher than counting by outlet.
· If AI Overviews handled all US organic search, concentration would rise several times more than a major media merger would cause.
· AI systems preferentially cited state-controlled outlets when asked in that country.

*What the terms mean*
Concentration — how much attention or citations pile up in a few owners
Organic search — unpaid search results

*Why it matters for your content*
AI answers lean on a small set of sources. Smaller publishers can have traffic but few citations. Standing out needs something the big names do not have.

*Example*
A regional food site gets steady visits but is never named when someone asks AI about "best street food in Pune." Two national outlets are always cited instead.

*Do this*
Ask ChatGPT, Gemini and Perplexity your top category questions, list the sources they cite, and see whether you appear.

https://arxiv.org/abs/2610.40164

———

*🟡 Does llms.txt do anything? Little evidence so far*
_arXiv — AI search & citation research · October 30, 2026_

*Synopsis*
A review and small test of llms.txt, a file meant to guide AI systems to your key pages.
· The review of 39 sources found none that isolated the file's effect on results.
· A test of 15 tools saw no automatic requests for the file in 45 trials at one endpoint.
· In a log study, 97% of domains with the file got no recorded requests in May 2026.
· In a small pilot, models adopted the attacker's target in 21 of 24 responses to adversarial files.

*What the terms mean*
llms.txt — a file on your site that lists your key pages for AI systems
Manifest — a file that describes what's on a site
Adversarial — written by someone trying to manipulate the AI

*Why it matters for your content*
There is no proof yet that llms.txt brings citations. The pilot is small and fed the evidence directly, with no live retrieval. But a file AI may trust can also be abused if someone else can edit it.

*Example*
Your agency adds llms.txt to every client site. Server logs show no AI crawler ever requested it, while the same hours went into improving the pages themselves.

*Do this*
Don't spend serious effort on llms.txt; if you already have one, make sure only your team can edit it.

https://arxiv.org/abs/2610.38361

———

*🟡 One product description can't fit every buyer's intent*
_arXiv — AI search & citation research · November 4, 2026_

*Synopsis*
A paper tests how GEO tactics perform when buyers have different needs and are at different decision stages.
· Existing tactics' visibility gains vary depending on what the user is asking.
· Prompts tuned by machine learning can underperform the handwritten starting prompt on average.
· Tracing the updates shows drift from clear recommendation instructions toward generic promotional tactics.
· The proposed fix, AMO, improved average citation-rank gain by 35% over the strongest prior learning-based baseline.
· AMO led on nine of ten intent states across four domains.

*What the terms mean*
Prompt optimization — automatically tuning the instructions given to an AI
Citation-rank gain — how much higher an item ranks in AI-cited results
Intent state — what a user needs and how close they are to deciding

*Why it matters for your content*
A description that wins for "ideas" may lose for "ready to buy." Generic promotional wording is not what AI recommendations reward. Clear, specific, recommendation-ready content holds up across intents.

*Example*
Before: "Our premium blender is powerful and stylish." After: "Best for smoothies for two: 1,200W motor, 1.5L jar, fits under standard cabinets."

*Do this*
Take one top product page and check it answers both browsing questions and ready-to-buy questions, with specifics instead of praise.

https://arxiv.org/abs/2611.04225
———
*Also this week*
· Characterizing Adversarial GEO via Implicit Brand Injection — arXiv — AI search & citation research
https://arxiv.org/abs/2611.04005
· Low, medium, high, and xhigh presets use Fast Search — Perplexity Changelog
https://docs.perplexity.ai/changelog
· Agent API: effort level updates and the `ultra-preview` effort level — Perplexity Changelog
https://docs.perplexity.ai/changelog
