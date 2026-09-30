// One run at a time.
//
// The scheduled scan, the Monday digest and an emailed trigger are separate
// launchd jobs, and nothing stops them overlapping — a review takes several
// minutes. Two runs reading and rewriting `seen.json` and `queue.json` at once
// lose each other's updates, which shows up later as a repeated or missing item.
//
// `mkdir` is atomic, so it doubles as the lock. The owner's pid is recorded so
// a lock left behind by a killed run is recognised as stale and taken over.

import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STATE_DIR, log } from './util.mjs';

const LOCK = join(STATE_DIR, '.lock');
const OWNER = join(LOCK, 'owner.json');
// Longer than any legitimate run (a review is the slowest, at under ten
// minutes). A lock older than this belongs to a run that hung.
const STALE_MS = 45 * 60000;

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

async function tryTake(label) {
  try {
    await mkdir(LOCK);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let owner = null;
    try {
      owner = JSON.parse(await readFile(OWNER, 'utf8'));
    } catch {
      /* lock dir with no owner yet — either being created right now, or a crash
         between mkdir and write; age it out below */
    }
    const age = Date.now() - (owner?.at || 0);
    const stale = owner ? !alive(owner.pid) || age > STALE_MS : age > STALE_MS;
    if (!stale) return false;
    log(`lock: taking over a stale lock from ${owner ? `pid ${owner.pid} (${owner.label})` : 'an unknown run'}`);
    await rm(LOCK, { recursive: true, force: true });
    return tryTake(label);
  }
  await writeFile(OWNER, JSON.stringify({ pid: process.pid, label, at: Date.now() }));
  return true;
}

/**
 * Run `fn` holding the lock, waiting up to `wait` ms for another run to finish.
 * Throws if it cannot get the lock in time; callers decide whether that is a
 * skip or a retry.
 */
export async function withLock(label, fn, { wait = 15 * 60000 } = {}) {
  const deadline = Date.now() + wait;
  let announced = false;
  while (!(await tryTake(label))) {
    if (Date.now() > deadline) throw new Error(`another run is still going after ${Math.round(wait / 60000)} minutes`);
    if (!announced) {
      log(`lock: another run is in progress — waiting (${label})`);
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  try {
    return await fn();
  } finally {
    await rm(LOCK, { recursive: true, force: true });
  }
}
