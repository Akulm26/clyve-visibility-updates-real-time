import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ROOT } from './lib/util.mjs';

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log(`
Telegram setup
──────────────
1. Open Telegram, message @BotFather, send /newbot
2. Pick any name and a username ending in "bot"
3. BotFather replies with a token like 1234567890:AAH...
4. Open your new bot and send it any message (e.g. "hi") — this is required
   before it is allowed to message you back.
`);

const token = (await rl.question('Paste the bot token: ')).trim();
if (!/^\d+:[\w-]+$/.test(token)) {
  console.error('That does not look like a bot token. Aborting.');
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const json = await res.json();
if (!json.ok) {
  console.error(`Telegram rejected the token: ${json.description}`);
  process.exit(1);
}

const chats = new Map();
for (const u of json.result) {
  const c = u.message?.chat || u.channel_post?.chat;
  if (c) chats.set(String(c.id), c.username || c.first_name || c.title || c.id);
}

if (!chats.size) {
  console.error(`
No messages found. Open your bot in Telegram, send it "hi", then run this again.
(Telegram will not reveal your chat id until you message the bot first.)`);
  process.exit(1);
}

let chatId;
if (chats.size === 1) {
  [chatId] = [...chats.keys()];
  console.log(`\nFound chat: ${chats.get(chatId)} (${chatId})`);
} else {
  console.log('\nSeveral chats found:');
  for (const [id, name] of chats) console.log(`  ${id}  ${name}`);
  chatId = (await rl.question('Which chat id? ')).trim();
}

await writeFile(
  join(ROOT, '.env'),
  `TELEGRAM_BOT_TOKEN=${token}\nTELEGRAM_CHAT_ID=${chatId}\n`,
);

const test = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    parse_mode: 'Markdown',
    text: '*AEO radar connected*\n\nThis channel is live. You will only hear from it when something actually happens.',
  }),
});

const sent = await test.json();
if (!sent.ok) {
  console.error(`Saved .env, but the test message failed: ${sent.description}`);
  process.exit(1);
}

console.log(`
Saved to .env and sent a test message — check Telegram.

Next:
  npm run init     seed the ledger (marks old news as already seen)
  npm run scan     first real run
  ./install-schedule.sh   install the launchd timers
`);
rl.close();
