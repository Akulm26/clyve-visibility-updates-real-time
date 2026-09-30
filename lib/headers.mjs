// The opening line of every message, which the email adapter also uses as the
// subject.
//
// This used to be left to the write-up model, following a list in the prompt.
// That made the subject only as reliable as the model's obedience, and the
// wording never said what produced the mail — a requested scan came back as
// "what's new" and a look-back as "last 14 days", which read alike in an inbox.
// Built here instead, each subject names its trigger up front and carries a
// count and a time, so no two replies share a subject and Gmail cannot fold
// them into one thread.

/** "Sep 29, 7:21 PM" — local time, since that is when you asked. */
export function stamp(now = new Date()) {
  return now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Header for a message of the given kind. `n` is the number of items in it.
 * Kinds are the same strings the pipeline already passes to writeUp.
 */
export function headerFor(kind, n, now = new Date()) {
  const review = /^(\d+)-day review$/.exec(kind);
  if (review) {
    return `*AEO radar · Review · last ${review[1]} days · ${plural(n, 'item')} · ${stamp(now)}*`;
  }
  switch (kind) {
    case 'requested update':
      return `*AEO radar · Scan · ${n} new · ${stamp(now)}*`;
    case 'nothing new':
      return `*AEO radar · Scan · nothing new · ${stamp(now)}*`;
    case 'breaking alert':
      return `*⚡ AEO radar · Breaking · ${plural(n, 'item')} · ${stamp(now)}*`;
    case 'catch-up digest':
      return `*AEO radar · Catch-up · ${plural(n, 'item')} · ${stamp(now)}*`;
    case 'weekly digest': {
      const week = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      return `*AEO radar · Weekly digest · week of ${week}*`;
    }
    default:
      return `*AEO radar · ${kind} · ${stamp(now)}*`;
  }
}

/**
 * Header for a message the pipeline writes itself rather than the model: a
 * "no update" pointer, a failure notice, a reply to a malformed request.
 * `label` names what was asked for ("Scan", "Review · last 14 days").
 */
export function statusHeader(label, status, now = new Date()) {
  return `*AEO radar · ${label} · ${status} · ${stamp(now)}*`;
}

/** "Scan" or "Review · last 14 days" — how a request is named in its reply. */
export function requestLabel(kind, days) {
  return kind === 'review' ? `Review · last ${days} days` : 'Scan';
}

/**
 * Put the header on the message, replacing any header the model wrote. Only
 * the opening line is ever replaced, so an item that happens to mention the
 * radar further down is left alone.
 */
export function withHeader(text, header) {
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l.trim());
  if (first >= 0 && /^\s*\*[^\n]*AEO radar[^\n]*\*\s*$/.test(lines[first])) {
    lines[first] = header;
    return lines.join('\n');
  }
  return `${header}\n\n${text}`;
}
