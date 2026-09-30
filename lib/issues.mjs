// Requests from the iPhone Shortcut, which opens a GitHub issue titled
// "scan", "review" or "review 30".
//
// An issue rather than a direct workflow run because GitHub keeps at most one
// run waiting in a concurrency group and silently cancels the rest; a request
// that arrived as a run could vanish while a review was still going. An issue
// stays open until its reply has gone out, so a cancelled or crashed run only
// delays it. Opening the issue also starts a run straight away, so the usual
// wait is seconds, not the five-minute schedule.
//
// No trigger code is needed: GitHub has already authenticated whoever opened
// the issue, and only the repository owner's issues are acted on. Anyone else
// can open an issue on a public repository; theirs are ignored.

import { log, readState, writeState } from './util.mjs';
import { commandFor, daysFor } from './inbox.mjs';

const API = 'https://api.github.com';

function config() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const owner = process.env.GITHUB_REPOSITORY_OWNER || repo?.split('/')[0];
  return token && repo ? { token, repo, owner } : null;
}

async function gh(path, { method = 'GET', body } = {}) {
  const { token } = config();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export const issuesEnabled = () => Boolean(config());

/**
 * Close an answered issue with a note of what was sent. Recorded as answered
 * first, so a close that fails is retried rather than answered twice.
 */
export async function closeIssue(number, note) {
  const state = await readState('issues.json', { answered: {} });
  state.answered[number] = { t: Date.now(), note };
  await writeState('issues.json', state);
  try {
    await gh(`/repos/${config().repo}/issues/${number}/comments`, { method: 'POST', body: { body: note } });
    await gh(`/repos/${config().repo}/issues/${number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'completed' } });
    delete state.answered[number];
    await writeState('issues.json', state);
  } catch (e) {
    log(`issues: could not close #${number}, will retry: ${e.message}`);
  }
}

/**
 * Queue every open request issue from the owner in `state/pending.json`.
 * Returns the number added.
 */
export async function checkIssues() {
  if (!config()) return 0;
  const { repo, owner } = config();
  const open = await gh(`/repos/${repo}/issues?state=open&creator=${encodeURIComponent(owner)}&per_page=50`);
  const state = await readState('issues.json', { answered: {} });
  const pending = await readState('pending.json', []);
  let added = 0;

  for (const issue of open.filter((i) => !i.pull_request)) {
    const uid = `issue-${issue.number}`;
    if (state.answered[issue.number]) {
      // Answered, but the close failed last time. Finish the job.
      await closeIssue(issue.number, state.answered[issue.number].note);
      continue;
    }
    if (pending.some((p) => p.uid === uid)) continue;

    const title = issue.title || '';
    const cmd = commandFor(title);
    const arrived = issue.created_at;
    if (!cmd) {
      log(`issues: #${issue.number} "${title.slice(0, 40)}" is not a request I recognise`);
      pending.push({ uid, issue: issue.number, kind: 'notice', reason: 'no-command', subject: title, arrived, attempts: 0 });
    } else {
      const days = daysFor(title);
      log(`issues: #${issue.number} "${title.slice(0, 40)}" → ${cmd}${cmd === 'review' ? ` (${days} days)` : ''}`);
      pending.push({ uid, issue: issue.number, kind: cmd, days, subject: title, arrived, attempts: 0 });
    }
    added++;
  }

  if (added) await writeState('pending.json', pending);
  return added;
}
