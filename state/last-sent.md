<!-- catch-up digest · 2026-10-31T03:00:01.054Z -->

*AEO radar · Catch-up · 3 items · Oct 30, 7:59 PM*

📡 Google, OpenAI and Microsoft's Bing are all moving toward simple controls that let your site say whether AI may train on your content.

———

*🔴 Google backs one shared AI opt-out switch*
_Google Search Central Blog · October 30, 2026_

*Synopsis*
Google announced plans to support a shared AI training control in robots.txt, built on work by an industry standards group.
· Sites will set one "policy token" in robots.txt to state their AI training preference across several AI companies.
· If a site opts out with the token and doesn't mention Google-Extended, Google will treat it as blocking Google-Extended.
· Google-Extended and other company-specific controls keep working alongside the new shared signal.
· Sites that specifically allow Google-Extended can appear in responses and get clicks through grounding in Gemini Apps.
· Google aims to support this in 2027, together with other AI providers.

*What the terms mean*
robots.txt — a public text file on your site that tells automated visitors what they may or may not read
AI training — AI companies using your pages to teach their models
Policy token — a single agreed keyword you put in robots.txt to state a preference
Google-Extended — the switch that controls whether Google may use your pages for its AI
IETF (Internet Engineering Task Force) — the body that writes internet technical standards
AIPREF — the IETF working group drafting AI preference rules
Grounding — an AI checking live web pages so its answer is based on real sources
Gemini Apps — Google's AI assistant, Gemini, in its app and web form

*Why it matters for your content*
Today, opting out of AI training means a separate rule for each company. This promises one rule for many. But the choice has a trade-off: allowing Google-Extended is tied to being eligible for citations and clicks in Gemini. Blocking AI broadly could cost you discovery there.

*Example*
A D2C skincare brand has a blog full of ingredient guides. Today, it has no rule for Google-Extended. Later, someone adds the shared opt-out token to protect the content. Google treats that as blocking Google-Extended, so the guides may stop being eligible for Gemini answers on "is niacinamide safe with retinol".

*Do this*
Ask whoever owns your robots.txt what it says about AI today, and decide your stance on training versus appearing in AI answers before 2027.

https://developers.google.com/search/blog/2026/10/ai-training-control

———

*🔴 OpenAI will honor the shared AI opt-out*
_OpenAI News · October 30, 2026_

*Synopsis*
OpenAI announced it will honor the common robots.txt signal for AI training preferences, joining other members of the same standards group.
· The signal is voluntary and lets one preference reach several participating AI providers at once.
· Before, site owners had to find each company's crawler and keep separate rules for each.
· OpenAI aims to implement it in the coming months and will share details then.
· Its existing crawler controls stay in place and will still be respected.

*What the terms mean*
Crawler — a program that visits web pages automatically to read them

*Why it matters for your content*
This is the same shared signal Google announced, now backed by the company behind ChatGPT. It makes a single opt-out realistic across the biggest AI players. It also means a careless setting could shut you out of several AI systems at once.

*Example*
A B2B software company publishes comparison pages such as "best invoicing tools for freelancers". Someone adds the shared opt-out to protect the pages. Once OpenAI starts honoring it, the pages may drop out of training for ChatGPT too, which the company may not have intended.

*Do this*
Ask your web team to list every AI-related rule in robots.txt, and who approves changes to it.

https://openai.com/index/helping-websites-express-ai-training-preferences

———

*🔴 Bing adds separate AI training and grounding controls*
_Bing — Robots meta tags (noarchive, nocache) · October 31, 2026_

*Synopsis*
Microsoft edited a Bing help page without announcing it. The page now says it is introducing new controls.
· Microsoft is introducing separate AI Training and AI Grounding preferences.
· These replace NoArchive and NoCache for these AI uses.
· The page points to a blog and FAQ with the new controls and transition guidance.
· Nothing was removed from the page. The source gives no dates or exact syntax.

*What the terms mean*
Bing — Microsoft's search engine, which also feeds some AI answers
Robots meta tags — short instructions in a page's code telling search engines how to treat that page
NoArchive / NoCache — older tags that stopped engines from keeping or showing stored copies of a page

*Why it matters for your content*
Training and grounding are different choices. Training means teaching the model. Grounding means citing you in an answer. You will be able to set them apart on Bing. Old NoArchive or NoCache tags may stop doing what you expect for AI.

*Example*
A publisher has NoArchive on its premium explainer pages to stop stored copies. After the change, that tag may no longer govern AI use. The publisher could have to set AI Training to off and AI Grounding to on, so the pages can be cited without being used for training.

*Do this*
Have your web team search your pages for NoArchive and NoCache tags, then read Bing's linked blog and FAQ before changing anything.

https://www.bing.com/webmasters/help/which-robots-metatags-does-bing-support-5198d240
