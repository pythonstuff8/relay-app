const { app } = require('electron');
const { createClient } = require('@deepgram/sdk');

// Packaged builds never carry provider keys. They reach OpenAI and Deepgram
// through the Relay API proxy. Local development can still use keys from ../.env.
const RELAY_API_BASE = String(process.env.RELAY_API_BASE || 'https://relay.suhaanthayyil.com/api')
    .trim()
    .replace(/\/+$/, '');

const PROXY_HEADERS = {
    'x-relay-client': 'relay-desktop',
    'x-relay-version': app.getVersion()
};

let openAIClient = null;

function useDirectKey(envName) {
    return !app.isPackaged
        && process.env.RELAY_FORCE_PROXY !== '1'
        && Boolean(String(process.env[envName] || '').trim());
}

function getAIMode() {
    return {
        openai: useDirectKey('OPENAI_API_KEY') ? 'direct' : 'proxy',
        deepgram: useDirectKey('DEEPGRAM_API_KEY') ? 'direct' : 'proxy',
        apiBase: RELAY_API_BASE
    };
}

function getOpenAIClient() {
    if (!openAIClient) {
        const OpenAI = require('openai');
        openAIClient = useDirectKey('OPENAI_API_KEY')
            ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim(), timeout: 60_000, maxRetries: 1 })
            : new OpenAI({
                apiKey: 'relay-proxy',
                baseURL: `${RELAY_API_BASE}/openai/v1`,
                defaultHeaders: PROXY_HEADERS,
                timeout: 60_000,
                maxRetries: 1
            });
    }
    return openAIClient;
}

function toUploadFile(buffer, filename) {
    const { toFile } = require('openai');
    return toFile(buffer, filename);
}

// Proxy tokens live ~60s and only need to be valid when a connection opens,
// so callers fetch a fresh client for every live connection or request.
async function getDeepgramClient() {
    if (useDirectKey('DEEPGRAM_API_KEY')) {
        return createClient(process.env.DEEPGRAM_API_KEY.trim());
    }

    const response = await fetch(`${RELAY_API_BASE}/deepgram/token`, {
        headers: PROXY_HEADERS,
        signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
        throw new Error(`Speech service unavailable (${response.status})`);
    }
    const { access_token: accessToken } = await response.json();
    if (!accessToken) {
        throw new Error('Speech service returned no token');
    }
    return createClient({ accessToken });
}

module.exports = {
    RELAY_API_BASE,
    getAIMode,
    getOpenAIClient,
    getDeepgramClient,
    toUploadFile
};
