# clyve-visibility-updates-real-time

A small local agent that watches **primary sources only** for AEO / GEO / AI-SEO
news, never repeats itself, stays silent when nothing happened, and explains what
it finds in language a marketer can act on.

No web app, no server, no API key. A handful of scripts, a JSON ledger, and two
`launchd` timers.

## Setup

```bash
npm install
npm run setup              # connect email (creates .env)
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

**Bing's help centre** renders entirely in JavaScript, so there is no server-side
text to fingerprint. Its own pages load each article from a public,
unauthenticated JSON endpoint — `/webmasters/api/help/htmlcontent?ArticleId=` —
which the watchers read directly; `url` stays the human-readable page so digest
links open somewhere useful. Four articles are watched: the Webmaster Guidelines,
the robots meta tags Bing supports (`noarchive` / `nocache`), AI Performance
reporting, and the crawler list. This is where Bing documents whether Copilot may
quote a page at all, which makes a silent edit there worth more than most blog
posts.

Bing's webmaster blog is also live and on-topic — just slow, roughly six posts a
year, so expect long silences rather than a fault.

**The three AI assistants** are covered on the two axes that matter: what they
announce, and how their crawlers behave. Anthropic runs three separate agents —
`ClaudeBot` for training, `Claude-User` for live fetches, and `Claude-SearchBot`
for what Claude cites — and the support article defining them is watched. OpenAI's
crawler docs and its web-search/citation guide are watched alongside the news feed
and release notes. Perplexity's crawler docs and API changelog are covered
directly; its hub blog, where the Publishers' Program is announced, blocks every
fetch and exposes no timestamp to gate on, so it gets a once-weekly search sweep
constrained to `perplexity.ai` URLs — the only source in the system without a
free trigger, which is why it runs weekly rather than every scan.

## Credentials

**None are needed, and none are used.** Every source is public: feeds, public
JSON endpoints, sitemaps, and documentation pages. No logins, no API keys, no
cookies. The only secret in the project is your Telegram bot token.

Two things genuinely do require an account, and both are *your own site's data*
rather than platform news — so they are deliberately out of scope here:
Google Search Console, and Bing Webmaster Tools' AI Performance report, which
shows which of your URLs Copilot actually cites. Worth logging into occasionally;
not something this radar can or should do for you.

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
node probe.mjs          # which sources answer, and how fast
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
| `lib/channel.mjs` | Picks the delivery adapter from `CHANNEL` in `.env` |
| `lib/email.mjs` | Email delivery (default) — renders the digest as HTML |
| `lib/telegram.mjs` | Telegram delivery |
| `lib/inbox.mjs` | Finds emailed requests and queues them in `pending.json` |
| `lib/lock.mjs` | One run at a time |
| `lib/headers.mjs` | Builds every message's opening line, which is also the email subject |
| `state/` | `seen.json` ledger, `delivered.json` what reached you, `pending.json` unanswered requests, `hashes.json` fingerprints, `queue.json` pending digest, `health.json` source health, `rejected.json` gate audit |

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

## Triggering a scan from your phone

Two things you can ask for, both by emailing yourself. Get the code with
`npm run trigger:code`; the inbox is checked every two minutes.

| Subject | What it does |
|---|---|
| `scan <code>` | Checks every source now for anything you have not been sent |
| `review <code>` | Looks back over the last 14 days |
| `review 30 <code>` | Same, over any window up to 90 days |

**Every request gets exactly one reply, and the reply only carries content
when there is a legitimate update** — something you have not already been
sent, by any email. Otherwise it is a short note pointing at your latest
update, so the newest content email is always the one place to look:

| Outcome | Reply subject |
|---|---|
| scan, something new | `AEO radar · Scan · 3 new · Sep 29, 7:21 PM` |
| review, something new | `AEO radar · Review · last 14 days · 6 items · Sep 29, 7:21 PM` |
| either, nothing new | `AEO radar · Scan · no update · …` / `AEO radar · Review · last 14 days · no update · …` |
| request failed 3 times | `AEO radar · Scan · failed · …`, with the reason |
| code missing | `AEO radar · Request · not run · …` |
| code present, request unclear | `AEO radar · Request · not understood · …` |

A "no update" reply still does the full check. It says how many sources it
reached, names the email holding your latest update, and shows the newest item
anywhere in your sources, so a quiet radar can be told apart from a broken one.
A review that does have news sends the whole window and says how many of its
items are new.

What counts as "already sent" is `state/delivered.json`: every item that has
reached you, by scan, review, breaking alert or Monday digest. The same record
stops the scheduled scan and the digest repeating something a review already
showed you.

Subjects are built in code, not by the write-up model, and carry the time, so
no two replies share one and Gmail never folds them into a single thread.

Silence is still the rule for *scheduled* scans — only high-impact items
interrupt you, the rest wait for Monday.

### Why a request never goes unanswered

- **Several at once.** A `review` and then a `scan` each get a reply, in the
  order sent. Two identical requests are answered once.
- **Crashes and outages.** A request is written to `state/pending.json` before
  the inbox marker moves past it, and removed only once its reply is out. A run
  that fails is retried on the next checks; after three failures you get a
  message saying why instead.
- **A sleeping Mac.** Requests up to 12 hours old are still answered, with a
  note saying when you sent it and when it was picked up.
- **Typos.** A mail from you that looks like a request but lacks the code, or
  has the code but no recognisable request, gets a reply saying so.
- **Replying to a radar email.** Works: the radar's own mail is recognised by an
  `X-AEO-Radar` header, not by its subject, and only the text you typed above
  the quote is read.
- **Overlapping runs.** Scans, digests and requests take turns through a lock,
  so they cannot overwrite each other's state.
- **A scheduled scan that keeps failing** sends one notice after two failures
  in a row, then stays quiet until it recovers.

The one thing it cannot do is answer while the Mac is off or asleep: requests
wait until it wakes (up to 12 hours), and anything older is logged and skipped.

New trigger mail is found by tracking the highest message UID already examined,
not by the unread flag. Opening your own inbox to see whether a reply arrived
marks the trigger mail read, and a flag-based check would then skip it — a
trigger that fails precisely because you went looking for its result.

Three conditions must all hold before anything runs: the code appears in the
subject or body, the mail came from your own address (or `EMAIL_TO`, or an
address listed in `TRIGGER_FROM`), and it arrived in the last 12 hours. The code
is what carries the security — a From address can be forged, so on its own the
sender check only stops accidents. Replays are impossible because the UID marker
never examines a message twice. The code is never written to `state/`, which is
pushed to a public repository. Rotate it any time with
`npm run trigger:code -- --new`.

To rehearse a change without mailing yourself, point the pipeline at a copy of
the state and print instead of sending:

```bash
cp -R state /tmp/radar-state
AEO_STATE_DIR=/tmp/radar-state CHANNEL=console node pipeline.mjs listen
```

Email was chosen over a watched iCloud folder because macOS privacy protection
blocks background agents from reading iCloud Drive — an agent there runs but
sees `Operation not permitted`, and the only fix is granting Full Disk Access to
`/bin/bash`, which is far too broad for a convenience feature. Email needs no
new permission, no token, and no open port: the app password already set up for
sending also reads.

## Changing where it sends

Every adapter exposes the same `send(text)`, so the channel is one line in
`.env` and nothing else moves:

```
CHANNEL=email       # default — npm run setup:email
CHANNEL=telegram    #           npm run setup:telegram
CHANNEL=whatsapp    #           needs an approved template, see below
```

Email needs an **app password**, not an account password — Google rejects
ordinary passwords for SMTP. `npm run setup:email` walks through creating one.
The write-up prompt emits phone-friendly `*bold*` and `_italic_` once; each
adapter translates that to whatever its channel understands, so switching
channels never means re-tuning the prompt.

## WhatsApp

Telegram first because WhatsApp cannot receive a rich push. Business-initiated
WhatsApp messages must be pre-approved templates — max 1024 characters, no
newlines. Long formatted messages are only allowed inside a 24-hour window that
opens when *you* message the bot. The migration path is a short template with a
quick-reply button; tapping it opens the window and the full digest follows in
the same format Telegram already uses. `lib/whatsapp.mjs` implements the same
`send(text)` and nothing else changes.
