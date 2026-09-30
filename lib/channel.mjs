// Delivery channel selector.
//
// Every adapter exposes the same `send(text)`, so changing where the digest
// lands is a one-word change in .env and nothing else in the pipeline moves.
//
//   CHANNEL=email      (default)
//   CHANNEL=telegram
//   CHANNEL=whatsapp   requires an approved template — see lib/whatsapp.mjs

const CHANNELS = {
  email: () => import('./email.mjs'),
  telegram: () => import('./telegram.mjs'),
  whatsapp: () => import('./whatsapp.mjs'),
  // Prints instead of sending — for rehearsing a change without mailing you.
  console: async () => ({
    send: async (text) => console.log(`\n=============== OUTGOING ===============\n${text}\n========================================\n`),
  }),
};

export async function send(text) {
  const name = (process.env.CHANNEL || 'email').toLowerCase();
  const load = CHANNELS[name];
  if (!load) {
    throw new Error(`unknown CHANNEL "${name}" — expected one of: ${Object.keys(CHANNELS).join(', ')}`);
  }
  const adapter = await load();
  return adapter.send(text);
}
