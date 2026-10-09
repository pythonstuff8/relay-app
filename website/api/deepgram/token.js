// Issues short-lived Deepgram JWTs so clients never hold the real API key.
// Clients connect to wss://api.deepgram.com/v1/listen with the token as a
// bearer credential; the token only needs to be valid at handshake time.

import { checkClient, json } from '../_lib/guard.js';

const TOKEN_TTL_SECONDS = 60;

async function issue(request) {
  if (!process.env.DEEPGRAM_API_KEY) return json(503, { error: { message: 'Speech service not configured' } });
  const denied = checkClient(request, 'deepgram', 30);
  if (denied) return denied;

  const upstream = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ ttl_seconds: TOKEN_TTL_SECONDS })
  });
  if (!upstream.ok) {
    return json(502, { error: { message: `Token grant failed (${upstream.status})` } });
  }
  const { access_token: accessToken, expires_in: expiresIn } = await upstream.json();
  return json(200, { access_token: accessToken, expires_in: expiresIn ?? TOKEN_TTL_SECONDS });
}

export const GET = issue;
export const POST = issue;
