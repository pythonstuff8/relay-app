// Shared request guards for the Relay API proxy.
// Clients ship without secrets, so these checks only deter casual abuse;
// real spend protection comes from provider budget caps and the Vercel WAF rule.

const ALLOWED_CLIENTS = new Set(['relay-desktop', 'relay-mobile']);
const buckets = new Map();

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }
  });
}

export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

// Best-effort fixed-window limiter. State lives per function instance.
export function rateLimited(key, limit, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (now - v.start >= windowMs) buckets.delete(k);
      }
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

export function checkClient(request, scope, limit) {
  const client = request.headers.get('x-relay-client');
  if (!ALLOWED_CLIENTS.has(client)) {
    return json(403, { error: { message: 'Unknown client' } });
  }
  if (rateLimited(`${scope}:${clientIp(request)}`, limit)) {
    return json(429, { error: { message: 'Too many requests, slow down' } }, { 'retry-after': '60' });
  }
  return null;
}
