# clyve-visibility-updates-real-time

A small local agent that watches **primary sources only** for AEO / GEO / AI-SEO
news, never repeats itself, stays silent when nothing happened, and explains what
it finds in language a marketer can act on.

No web app, no server, no API key. A handful of scripts, a JSON ledger, and two
`launchd` timers.

## Setup

```bash
npm install
npm run setup              # connect Telegram (creates .env)
npm run init               # seed the ledger so you don't get a year of backlog
npm run scan               # first real run
./install-schedule.sh      # install the timers
```

## What it does

**Scans every 6 hours.** Anything scoring 4-5 for impact is sent immediately as
a breaking alert. Everything else queues for the Monday 09:00 digest. **If
nothing new cleared the filters, nothing is sent** — no "quiet week" message.

**Never repeats.** Every item is keyed on its canonical URL plus its normalised
title and written to `state/seen.json`. Seen once, never sent again.

**Watches pages that change silently.** Google's AI-features and crawler docs,
OpenAI's and Perplexity's bot docs, Apple's Applebot page, the IETF AI-preferences
drafts, and the llms.txt spec are fingerprinted every scan. When the text moves,
the before/after diff is what gets explained. This tier catches policy shifts
that never get a blog post — Apple in particular revises its AI opt-out
documentation without announcing it.

**Tells you when it goes blind.** The quiet failure that matters is a feed moving
or 404ing: the collector returns zero and everything looks healthy. `lib/health.mjs`
tracks every source and sends one notice when a source starts failing, or when a
source that used to publish has been silent for about ten days. It alerts once,
then stays quiet until the source recovers. Sources that have *never* published
never alert, so Bing's dormant blogs stay silent instead of nagging.

## Sources

Platform primary sources only — Google (Search, AI, Gemini, status, docs),
OpenAI, Anthropic, Perplexity, Apple, Meta, Reddit, Cloudflare, Schema.org, the
IETF AI-preferences working group, plus arXiv for original research. SEO trade
press and commentary are deliberately excluded. See `sources.mjs`.

**ChatGPT release notes** are covered by a different mechanism. The page blocks
every automated fetch, but OpenAI's `robots.txt` is `Allow: /` — this is bot
detection, not a policy refusal — and two things make it reachable anyway: the
sitemap carries a genuine per-page `lastmod`, and search engines have indexed the
content. So the timestamp is watched for free, and only when it moves is a single
search-backed call spent recovering what changed, constrained to `openai.com` and
`help.openai.com` URLs so the primary-source rule still holds.

**Known gap, deliberately left open:** Microsoft/Copilot has no reachable primary
feed — Bing's blogs stopped publishing in February 2026 and every other Microsoft
endpoint blocks automated access. A genuine gap rather than an oversight; there
is no clean primary source to point at today.

## Cost

Near zero, by design. Telegram, `launchd`, and feed fetching are free. The model
step shells out to `claude -p` against your existing Claude Code login, so there
is no per-token bill — only subscription usage. Dedupe and keyword filtering are
plain JavaScript and run *first*, so a scan that finds nothing spends nothing,
and most scans find nothing. Gating uses Haiku and batches every item into one
call; only the digest write-up uses a larger model.

## Commands

```bash
npm run scan            # collect, filter, alert on anything urgent
npm run digest          # send the queued weekly digest
npm run dry             # full pipeline with zero model calls — free to run
node collect.mjs        # per-source item counts, for checking feeds still work
node watch.mjs          # check the silent-change watchers
```

## Layout

| Path | What it does |
|---|---|
| `sources.mjs` | The source registry, in three tiers |
| `collect.mjs` | Feed and HTML collection |
| `watch.mjs` | Fingerprint-and-diff for silently edited docs |
| `pipeline.mjs` | Dedupe → filter → gate → score → route |
| `prompts/gate.md` | Decides what is primary-source and what matters |
| `prompts/writeup.md` | Turns an item into something readable on a phone |
| `lib/health.mjs` | Source watchdog — notices when a feed breaks or goes silent |
| `lib/telegram.mjs` | Delivery (WhatsApp adapter slots in behind the same `send()`) |
| `state/` | `seen.json` ledger, `hashes.json` fingerprints, `queue.json` pending digest, `health.json` source health, `rejected.json` gate audit |

## Checking the gate's judgement

The gate decides what you never see. `state/rejected.json` keeps the last 300
items it dropped, each with its one-line reason — skim it occasionally to confirm
nothing good is being thrown away. Nothing sends it anywhere; it is there purely
so a wrong call is catchable.

## Troubleshooting

**Nothing arrives.** That is usually correct. Confirm with `npm run dry` — it
prints what the free filters found without spending anything.

**A source shows `⚠ 0`.** Run `node collect.mjs`. A zero means either the feed
moved or that publication has genuinely gone quiet (Bing's blogs have). You do
not need to watch for this — the health watchdog will message you if a source
that used to work stops working.

**You got a source-check message.** A feed has probably moved. Find its new URL
and update the entry in `sources.mjs`. This is the only routine maintenance the
system asks for, and it should come up a couple of times a year.

**Timers not firing.** `launchctl list | grep aeoradar`, then check
`logs/launchd.scan.log`. Force a run with
`launchctl kickstart -k gui/$UID/com.clyve.aeoradar.scan`.

## WhatsApp

Telegram first because WhatsApp cannot receive a rich push. Business-initiated
WhatsApp messages must be pre-approved templates — max 1024 characters, no
newlines. Long formatted messages are only allowed inside a 24-hour window that
opens when *you* message the bot. The migration path is a short template with a
quick-reply button; tapping it opens the window and the full digest follows in
the same format Telegram already uses. `lib/whatsapp.mjs` implements the same
`send(text)` and nothing else changes.
