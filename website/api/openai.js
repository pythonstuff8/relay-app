// OpenAI passthrough for the Relay desktop and mobile apps.
// Reached through the rewrite /api/openai/v1/:path* -> /api/openai?path=:path*
// so clients can point the OpenAI SDK's baseURL at /api/openai/v1.

import { checkClient, json } from './_lib/guard.js';

const OPENAI_BASE = 'https://api.openai.com/v1';
const MAX_OUTPUT_TOKENS = 1200;
const DEFAULT_OUTPUT_TOKENS = 600;
const MAX_TTS_CHARS = 4096;

const MODELS_BY_ROUTE = {
  'chat/completions': new Set(['gpt-4o-mini', 'gpt-4.1-nano']),
  'audio/speech': new Set(['tts-1', 'gpt-4o-mini-tts']),
  'audio/transcriptions': new Set(['gpt-4o-mini-transcribe'])
};

function upstreamHeaders(contentType) {
  const headers = { authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
  if (contentType) headers['content-type'] = contentType;
  return headers;
}

function relay(upstream) {
  const headers = new Headers({ 'cache-control': 'no-store' });
  const type = upstream.headers.get('content-type');
  if (type) headers.set('content-type', type);
  return new Response(upstream.body, { status: upstream.status, headers });
}

function routeOf(request) {
  const url = new URL(request.url);
  return (url.searchParams.get('path') || '').replace(/^\/+|\/+$/g, '');
}

function clampTokens(body) {
  for (const key of ['max_tokens', 'max_completion_tokens']) {
    if (body[key] != null) body[key] = Math.min(Math.max(1, Number(body[key]) || 1), MAX_OUTPUT_TOKENS);
  }
  if (body.max_tokens == null && body.max_completion_tokens == null) {
    body.max_tokens = DEFAULT_OUTPUT_TOKENS;
  }
}

export async function GET(request) {
  if (!process.env.OPENAI_API_KEY) return json(503, { error: { message: 'AI service not configured' } });
  const denied = checkClient(request, 'openai', 60);
  if (denied) return denied;

  const route = routeOf(request);
  if (route !== 'models' && !/^models\/[\w.-]+$/.test(route)) {
    return json(404, { error: { message: 'Route not available' } });
  }
  const upstream = await fetch(`${OPENAI_BASE}/${route}`, { headers: upstreamHeaders() });
  return relay(upstream);
}

export async function POST(request) {
  if (!process.env.OPENAI_API_KEY) return json(503, { error: { message: 'AI service not configured' } });
  const denied = checkClient(request, 'openai', 60);
  if (denied) return denied;

  const route = routeOf(request);
  const allowedModels = MODELS_BY_ROUTE[route];
  if (!allowedModels) return json(404, { error: { message: 'Route not available' } });

  if (route === 'audio/transcriptions') {
    let form;
    try {
      form = await request.formData();
    } catch {
      return json(400, { error: { message: 'Expected multipart form data' } });
    }
    if (!allowedModels.has(String(form.get('model') || ''))) {
      return json(400, { error: { message: 'Model not allowed' } });
    }
    const upstream = await fetch(`${OPENAI_BASE}/${route}`, {
      method: 'POST',
      headers: upstreamHeaders(),
      body: form
    });
    return relay(upstream);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: { message: 'Expected JSON body' } });
  }
  if (!body || !allowedModels.has(body.model)) {
    return json(400, { error: { message: 'Model not allowed' } });
  }

  if (route === 'chat/completions') {
    clampTokens(body);
    body.n = 1;
    body.stream = false;
    delete body.stream_options;
  } else if (route === 'audio/speech') {
    if (typeof body.input !== 'string' || !body.input.trim()) {
      return json(400, { error: { message: 'Missing input text' } });
    }
    body.input = body.input.slice(0, MAX_TTS_CHARS);
  }

  const upstream = await fetch(`${OPENAI_BASE}/${route}`, {
    method: 'POST',
    headers: upstreamHeaders('application/json'),
    body: JSON.stringify(body)
  });
  return relay(upstream);
}
