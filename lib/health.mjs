// Source health watchdog.
//
// The failure mode this exists for: a feed quietly moves or 404s, the collector
// returns zero, and the radar looks perfectly healthy while going blind. Nothing
// else in the pipeline would ever tell you.
//
// Two distinct signals, deliberately treated differently:
//
//   errors  — the fetch or parse actually failed. Something is broken. Alert
//             fast, because this is almost always a moved or renamed feed.
//   zeros   — the fetch worked, there was just nothing new. Usually normal. Only
//             worth flagging if the source *used* to produce items and has now
//             gone quiet for a long time.
//
// A source that has never produced anything never alerts. Bing's blogs return
// zero every single scan because they genuinely stopped publishing — that is
// not a fault and must never generate noise.

import { readState, writeState } from './util.mjs';

const ERROR_STREAK = 8; // ~2 days at four scans a day
const ZERO_STREAK = 40; // ~10 days — long enough that a slow publisher is safe

/**
 * Fold this run's collection report into the stored health record and return
 * the sources that just crossed a threshold. Returns only *newly* unhealthy
 * sources: each one alerts once and then stays quiet until it recovers.
 */
export async function updateHealth(report) {
  const health = await readState('health.json', {});
  const alerts = [];
  const now = new Date().toISOString();

  for (const r of report) {
    const h = health[r.id] || { zeroStreak: 0, errorStreak: 0, lastItemAt: null, notified: false };

    if (!r.ok) {
      h.errorStreak++;
      h.lastError = r.error;
    } else {
      h.errorStreak = 0;
      h.lastError = null;
      if (r.count > 0) {
        h.zeroStreak = 0;
        h.lastItemAt = now;
      } else {
        h.zeroStreak++;
      }
    }

    const broken = h.errorStreak >= ERROR_STREAK;
    // A source with no history of producing items cannot have "gone quiet".
    const quiet = h.zeroStreak >= ZERO_STREAK && h.lastItemAt;

    if ((broken || quiet) && !h.notified) {
      h.notified = true;
      alerts.push({
        id: r.id,
        kind: broken ? 'broken' : 'quiet',
        detail: broken
          ? `${h.errorStreak} consecutive failures — ${h.lastError}`
          : `no items for ${h.zeroStreak} scans (last item ${h.lastItemAt?.slice(0, 10)})`,
      });
    }

    // Recovered — re-arm so a future failure alerts again.
    if (!broken && !quiet && h.notified) h.notified = false;

    health[r.id] = h;
  }

  await writeState('health.json', health);
  return alerts;
}

/** Short, plain-language notice. Deliberately not written up by the model. */
export function formatHealthAlert(alerts, nameById) {
  const lines = alerts.map((a) => {
    const name = nameById[a.id] || a.id;
    return a.kind === 'broken'
      ? `· *${name}* is failing — ${a.detail}`
      : `· *${name}* has gone silent — ${a.detail}`;
  });

  return (
    `*🔧 AEO radar · source check*\n\n` +
    `Some sources need a look. This is about the radar itself, not the news.\n\n` +
    lines.join('\n') +
    `\n\nA failing source usually means the feed moved. ` +
    `Run \`node collect.mjs\` to see the current state of all of them.`
  );
}
