<!-- breaking alert · 2026-10-12T11:48:25.171Z -->

*⚡ AEO radar · Breaking · 1 item · Oct 12, 4:47 AM*

One update: Perplexity's Agent API can now pull and cite live web images inside AI-generated answers.
———
*🟠 Perplexity Agents Can Now Search Images*
_Perplexity Changelog · October 1, 2026_

*Synopsis*
Perplexity added an `image_search` tool to its Agent API — the developer toolkit used to build AI agents that browse the web and answer questions, not just chat.
· Agents can search for web images mid-answer, returned separately from the text as structured `image_search_results` items.
· Results can be filtered by domain (specific websites) and by image format.
· Each image result includes both the image's direct URL and its origin URL — the page it came from.
· Results stream back live, and each search call is billed individually.

*What the terms mean*
Agent API — Perplexity's developer platform for building AI agents that browse the web and take actions, not just answer chat messages.
image_search tool — a built-in action that lets an AI agent fetch real images from the web while building its answer.
Structured output items — data returned in a fixed, labeled format an app can read automatically, instead of plain text.
Domain filter — limits image results to specific websites you choose.
Origin URL — the webpage an image was originally found on, as opposed to the raw image file's own link.
Streaming — results sent back piece by piece as they're found, rather than all at once at the end.

*Why it matters for your content*
Perplexity agents can now reach into the web, grab your images, and trace them back to your page via the origin URL. That's a new discovery path for image-heavy content — recipe steps, product shots, diagrams — outside of Google Images. Image SEO basics (alt text, filenames, clean public URLs) now double as AI-visibility signals for agent-built answers.

*Example*
A Perplexity agent answering "how to fold dumplings" could pull a step-by-step photo from a recipe site and cite it with the origin URL pointing straight to that recipe page — something that wasn't possible when agents only returned text citations.

*Do this*
Check that your highest-traffic images have clear alt text, descriptive filenames, and stable public URLs — this is what makes them findable and citable by agents like this one.

https://docs.perplexity.ai/docs/agent-api/tools/image-search
