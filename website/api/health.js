import { json } from './_lib/guard.js';

export function GET() {
  return json(200, {
    ok: true,
    openai: Boolean(process.env.OPENAI_API_KEY),
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY)
  });
}
