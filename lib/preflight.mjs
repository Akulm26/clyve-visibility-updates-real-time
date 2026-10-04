// Can a run actually succeed right now?
//
// A closed MacBook on battery is not off: macOS wakes it every few minutes for
// a few seconds of maintenance ("dark wake"), with the screen off and often no
// network. launchd fires any run it missed during sleep on the first of these,
// and a scan started there gets a few seconds of CPU every quarter of an hour.
// Every fetch fails, every model call "times out", and before this check the
// result was either a misleading failure notice or — worse — a scan that read
// nothing and reported "nothing new".
//
// So: no run starts unless the Mac is fully awake and can resolve a hostname.
// A skipped scan is caught up later by the inbox listener (see pipeline.mjs).

import { execFile } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PROBE_HOST = 'www.google.com';
const DNS_TIMEOUT_MS = 5000;

/**
 * `pmset -g systemstate` lists what the system is powered up for. A full wake
 * includes Graphics; a dark wake runs with CPU and maybe Network but no
 * Graphics. Unknown output (not a Mac, pmset missing) counts as awake, so the
 * check can never block a run on a machine it does not understand.
 */
export function parseSystemState(text = '') {
  const m = text.match(/Current System Capabilities are:([^\n]*)/i);
  if (!m) return { known: false, awake: true, network: true };
  const caps = m[1].trim().split(/\s+/);
  return { known: true, awake: caps.includes('Graphics'), network: caps.includes('Network') };
}

/** Lid closed and running on battery: the one state nothing keeps awake. */
export function parseLidOnBattery(ioregText = '', battText = '') {
  const lidClosed = /"AppleClamshellState"\s*=\s*Yes/.test(ioregText);
  const onBattery = /'Battery Power'/.test(battText);
  return lidClosed && onBattery;
}

async function out(cmd, args) {
  try {
    return (await run(cmd, args, { timeout: 5000 })).stdout;
  } catch {
    return '';
  }
}

async function resolves(host) {
  let timer;
  try {
    await Promise.race([
      lookup(host),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('DNS timed out')), DNS_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns `{ ok: true }` or `{ ok: false, reason }`, where `reason` is plain
 * words fit for a status email. The probes are injectable so the decision
 * logic can be tested without putting the Mac to sleep.
 */
export async function preflight({
  systemState = () => out('pmset', ['-g', 'systemstate']),
  lid = () => out('ioreg', ['-r', '-k', 'AppleClamshellState', '-d', '1']),
  battery = () => out('pmset', ['-g', 'batt']),
  dns = () => resolves(PROBE_HOST),
} = {}) {
  if (process.env.AEO_SKIP_PREFLIGHT === '1') return { ok: true };

  const state = parseSystemState(await systemState());
  if (!state.awake) {
    const closed = parseLidOnBattery(await lid(), await battery());
    return {
      ok: false,
      reason: closed
        ? 'the Mac was asleep (lid closed, on battery)'
        : 'the Mac was asleep (background wake only)',
    };
  }
  if (state.known && !state.network) return { ok: false, reason: 'the Mac had no network' };
  if (!(await dns())) return { ok: false, reason: 'the Mac had no working internet connection' };
  return { ok: true };
}
