#!/usr/bin/env node

// Verifies the desktop <-> phone bridge (auth, protocol, Remote Mic routing)
// and that packaged builds ship without provider secrets.

const fs = require('fs');
const net = require('net');
const path = require('path');
const assert = require('assert');
const WebSocket = require('ws');
const { MobileBridge, normalizeToken } = require('../electron/mobile-bridge');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

function checkStatic() {
    const pkg = JSON.parse(read('package.json'));
    const extra = JSON.stringify(pkg.build?.extraResources || []);
    assert(!extra.includes('.env'), 'package.json must not bundle .env into installers');
    assert(!pkg.dependencies?.dotenv, 'dotenv must stay a dev dependency');

    const mainJs = read('electron/main.js');
    assert(!mainJs.includes("process.resourcesPath, '.env'"), 'main.js must not load .env from resources');
    assert(mainJs.includes('new MobileBridge('), 'main.js must start the MobileBridge');
    assert(mainJs.includes("ipcMain.handle('mobile-pairing-info'"), 'main.js pairing info handler');
    assert(mainJs.includes("ipcMain.handle('set-caption-source'"), 'main.js caption source handler');
    assert(mainJs.includes('translateCaptionForMobiles('), 'main.js translates captions for Classroom Broadcast');

    const aiClients = read('electron/ai-clients.js');
    assert(aiClients.includes("'x-relay-client': 'relay-desktop'"), 'proxy client header');
    assert(aiClients.includes('!app.isPackaged'), 'direct keys limited to development');

    const preload = read('electron/preload.js');
    ['getMobilePairingInfo', 'regenerateMobilePairing', 'onMobileBridgeStatus', 'setCaptionSource', 'onCaptionSourceChanged']
        .forEach((name) => assert(preload.includes(name), `preload API ${name}`));
}

function memoryStore() {
    const data = new Map();
    return { get: (key) => data.get(key), set: (key, value) => data.set(key, value) };
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

function connect(port, token, name = 'Test Phone') {
    const query = token == null ? '' : `?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}`;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${query}`);
    ws.inbox = [];
    ws.on('message', (data, isBinary) => {
        if (!isBinary) ws.inbox.push(JSON.parse(data.toString()));
    });
    return ws;
}

function waitFor(predicate, label, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
            const value = predicate();
            if (value) return resolve(value);
            if (Date.now() - started > timeoutMs) return reject(new Error(`Timed out waiting for ${label}`));
            setTimeout(tick, 10);
        };
        tick();
    });
}

function nextMessage(ws, type) {
    return waitFor(() => ws.inbox.find((message) => message.type === type), type);
}

async function checkRuntime() {
    const blockedPort = await freePort();
    const openPort = await freePort();
    const blocker = net.createServer().listen(blockedPort);

    const events = { starts: [], frames: [], stops: 0 };
    const bridge = new MobileBridge({
        store: memoryStore(),
        ports: [blockedPort, openPort],
        hooks: {
            onAudioStart: async (info) => { events.starts.push(info); return { ok: true }; },
            onAudioFrame: (buffer) => events.frames.push(buffer.length),
            onAudioStop: () => { events.stops += 1; }
        }
    });

    try {
        await bridge.start();
        assert.strictEqual(bridge.port, openPort, 'falls back to the next free port');

        const info = await bridge.getPairingInfo();
        assert(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(info.code), 'pairing code is formatted');
        if (info.host) {
            assert(info.url.startsWith('relay://pair?'), 'pairing URL scheme');
            assert(info.qrDataUrl.startsWith('data:image/png;base64,'), 'QR code rendered');
        }

        const rejected = connect(openPort, 'WRONG-TOKEN');
        const rejection = await new Promise((resolve) => {
            rejected.on('unexpected-response', (_req, res) => resolve(res.statusCode));
            rejected.on('error', () => resolve('error'));
        });
        assert.strictEqual(rejection, 401, 'wrong token is rejected with 401');

        const phone = connect(openPort, info.code.toLowerCase());
        const welcome = await nextMessage(phone, 'WELCOME');
        assert.strictEqual(welcome.protocol, 1, 'WELCOME carries protocol version');
        assert.strictEqual(normalizeToken(info.code), bridge.token, 'formatted code normalizes to token');

        phone.send(JSON.stringify({ type: 'PING' }));
        await nextMessage(phone, 'PONG');

        phone.send(JSON.stringify({ type: 'AUDIO_START', sampleRate: 16000, encoding: 'linear16', channels: 1 }));
        await nextMessage(phone, 'AUDIO_ACK');
        assert.deepStrictEqual(events.starts[0], { sampleRate: 16000, deviceName: 'Test Phone' }, 'audio start hook');

        phone.send(Buffer.alloc(3200));
        phone.send(Buffer.alloc(3));
        await waitFor(() => events.frames.length >= 1, 'audio frame');
        assert.deepStrictEqual(events.frames, [3200], 'only whole PCM16 frames are forwarded');

        const second = connect(openPort, bridge.token, 'Second Phone');
        await nextMessage(second, 'WELCOME');
        second.send(JSON.stringify({ type: 'AUDIO_START', sampleRate: 16000 }));
        const busy = await nextMessage(second, 'AUDIO_REJECTED');
        assert.strictEqual(busy.reason, 'busy', 'second Remote Mic is rejected');

        bridge.broadcast({ type: 'CAPTION', text: 'hello', isFinal: true, speaker: 0 });
        assert.strictEqual((await nextMessage(second, 'CAPTION')).text, 'hello', 'captions broadcast to phones');

        // Classroom Broadcast: phones ask for a caption language; filtered sends reach only them.
        second.send(JSON.stringify({ type: 'SET_LANGUAGE', language: 'Spanish' }));
        phone.send(JSON.stringify({ type: 'SET_LANGUAGE', language: 'English' }));
        await waitFor(() => bridge.captionLanguages.length === 1, 'caption language');
        assert.deepStrictEqual(bridge.captionLanguages, ['Spanish'], 'English means no translation');
        phone.inbox.length = 0;
        second.inbox.length = 0;
        bridge.broadcast({ type: 'CAPTION', text: 'hola', isFinal: true }, (ws) => ws.captionLanguage === 'Spanish');
        assert.strictEqual((await nextMessage(second, 'CAPTION')).text, 'hola', 'translated caption reaches the Spanish phone');
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert(!phone.inbox.some((message) => message.type === 'CAPTION'), 'translated caption skips other phones');
        second.send(JSON.stringify({ type: 'SET_LANGUAGE', language: '<script>' }));
        await waitFor(() => bridge.captionLanguages.length === 0, 'invalid language cleared');

        phone.send(JSON.stringify({ type: 'AUDIO_STOP' }));
        await waitFor(() => events.stops === 1, 'audio stop hook');

        const closeCode = new Promise((resolve) => second.on('close', (code) => resolve(code)));
        const fresh = await bridge.regenerateToken();
        assert.notStrictEqual(normalizeToken(fresh.code), normalizeToken(info.code), 'regenerate changes the code');
        assert.strictEqual(await closeCode, 4401, 'regenerate disconnects phones');

        phone.terminate();
    } finally {
        bridge.stop();
        blocker.close();
    }
}

(async () => {
    try {
        checkStatic();
        await checkRuntime();
        console.log('Verified mobile bridge: token auth, port fallback, Remote Mic routing, caption broadcast, per-phone caption languages, no bundled secrets.');
        process.exit(0);
    } catch (error) {
        console.error(`[verify-mobile-bridge] ${error.message}`);
        process.exit(1);
    }
})();
