// When is a scheduled run trustworthy, overdue, or worth telling you about?
//
// The radar's normal state is silence, so silence must never also be what a
// broken radar looks like. Three rules, kept here as pure functions so they can
// be tested without a sleeping Mac or a dead network:
//
//   blind run — most sources failed at once. That is the Mac's network, not
//               the sources, and the scan saw nothing: a failure, never
//               "nothing new".
//   catch-up  — a scan skipped or failed while the Mac slept is re-run by the
//               inbox listener once the Mac is awake, rather than waiting up
//               to six hours for the next slot.
//   stale     — whatever the cause (failures, skips, blind runs), no good scan
//               for a day sends one notice, re-armed by the next good scan.
//
// State lives in state/schedule.json:
//   { scan:   { lastSuccess, lastAttempt, lastProblem, since, staleNotified },
//     digest: { owed, lastAttempt } }

// A scan where at least this share of sources failed saw nothing worth
// trusting.
export const BLIND_SHARE = 0.5;
// Scheduled scans are six hours apart; past this, a catch-up is owed.
export const CATCHUP_HOURS = 7;
// A catch-up that keeps failing is retried no more often than this.
export const RETRY_MINUTES = 30;
// No good scan for this long sends one notice.
export const STALE_HOURS = 24;

const HOUR = 3600e3;
const ms = (iso) => (iso ? Date.parse(iso) : NaN);

/** The error most of the failed sources share. */
export function commonError(failed) {
  const counts = {};
  for (const f of failed) counts[f.error] = (counts[f.error] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown error';
}

/** An error message if this collection report is a blind run, else null. */
export function blindRun(report, share = BLIND_SHARE) {
  const failed = report.filter((r) => !r.ok);
  if (!report.length || failed.length / report.length < share) return null;
  return `blind run: ${failed.length} of ${report.length} sources unreachable (${commonError(failed)})`;
}

/** Should the listener run a catch-up scan now? */
export function catchUpDue(scan = {}, now = Date.now()) {
  const last = ms(scan.lastSuccess);
  if (now - last < CATCHUP_HOURS * HOUR) return false;
  const tried = ms(scan.lastAttempt);
  if (now - tried < RETRY_MINUTES * 60e3) return false;
  return true;
}

/** Should a digest skipped or failed earlier be run now? */
export function digestDue(digest = {}, now = Date.now()) {
  if (!digest.owed) return false;
  return !(now - ms(digest.lastAttempt) < RETRY_MINUTES * 60e3);
}

/**
 * Hours without a good scan, if that crosses the threshold and nobody has been
 * told yet; otherwise null. With no success on record, the clock starts at
 * `since` — the first time the radar noticed — so a fresh install or an
 * upgrade does not alarm on its first run.
 */
export function staleHours(scan = {}, now = Date.now()) {
  if (scan.staleNotified) return null;
  const from = ms(scan.lastSuccess) || ms(scan.since);
  if (!from) return null;
  const hours = (now - from) / HOUR;
  return hours >= STALE_HOURS ? Math.floor(hours) : null;
}

// --- transitions (mutate and return the record) ---------------------------

export function noteAttempt(scan, now = new Date()) {
  scan.since ||= now.toISOString();
  scan.lastAttempt = now.toISOString();
  return scan;
}

export function noteSuccess(scan, now = new Date()) {
  scan.since ||= now.toISOString();
  scan.lastSuccess = now.toISOString();
  scan.lastProblem = null;
  scan.staleNotified = false;
  return scan;
}

export function noteProblem(scan, problem, now = new Date()) {
  scan.since ||= now.toISOString();
  scan.lastProblem = problem;
  return scan;
}
