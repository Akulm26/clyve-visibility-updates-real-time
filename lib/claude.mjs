import { spawn } from 'node:child_process';
import { log } from './util.mjs';

/**
 * One-shot call to the Claude Code CLI using the existing login — no API key,
 * so this draws on the subscription rather than generating a per-token bill.
 *
 * Keep calls batched and rare: a scan that finds nothing must never reach here.
 */
export function askClaude(prompt, { model = 'haiku', tools = '', timeout = 240000 } = {}) {
  const args = ['-p', '--model', model];
  if (tools) args.push('--allowed-tools', tools);

  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`claude timed out after ${timeout}ms`));
    }, timeout);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${err.slice(0, 500)}`));
      resolve(out.trim());
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Pull the first complete JSON value out of a reply.
 *
 * Scanning for the matching bracket rather than the last one in the string
 * matters: a web-search reply ends with a markdown list of sources, and those
 * links contain `]` characters that a greedy match happily swallows.
 */
export function extractJSON(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;

  const start = body.search(/[[{]/);
  if (start === -1) throw new Error(`no JSON in response: ${raw.slice(0, 300)}`);

  const open = body[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === '"') inString = !inString;
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close && --depth === 0) {
      return JSON.parse(body.slice(start, i + 1));
    }
  }
  throw new Error(`unterminated JSON in response: ${raw.slice(0, 300)}`);
}

/** Ask for JSON and tolerate the model wrapping it in prose or a code fence. */
export async function askClaudeJSON(prompt, opts = {}) {
  const raw = await askClaude(prompt, opts);
  try {
    return extractJSON(raw);
  } catch (e) {
    log('unparseable JSON from claude:', raw.slice(0, 400));
    throw e;
  }
}
