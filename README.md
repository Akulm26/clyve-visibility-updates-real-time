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
OpenAI's and Perplexity's bot docs, and the llms.txt spec are fingerprinted every
scan. When the text moves, the before/after diff is what gets explained. This
tier catches policy shifts that never get a blog post.

## Sources

Platform primary sources only — Google, OpenAI, Anthropic, Perplexity, Microsoft
/ Bing, Meta, Reddit, Cloudflare, plus arXiv for original research. SEO trade
press and commentary are deliberately excluded. See `sources.mjs`.

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
| `lib/telegram.mjs` | Delivery (WhatsApp adapter slots in behind the same `send()`) |
| `state/` | `seen.json` ledger, `hashes.json` fingerprints, `queue.json` pending digest |

## Troubleshooting

**Nothing arrives.** That is usually correct. Confirm with `npm run dry` — it
prints what the free filters found without spending anything.

**A source shows `⚠ 0`.** Run `node collect.mjs`. A zero means either the feed
moved or that publication has genuinely gone quiet (Bing's blogs often have).

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
