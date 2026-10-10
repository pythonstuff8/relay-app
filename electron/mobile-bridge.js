const { EventEmitter } = require('events');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const WebSocket = require('ws');
const QRCode = require('qrcode');

// LAN bridge between the desktop app and the Relay mobile app.
// Phones pair by scanning a QR code that carries host, port, and a pairing token.
//
// Desktop -> phone: WELCOME, PONG, ALERT, CAPTION, AUDIO_ACK, AUDIO_REJECTED
// Phone -> desktop: PING, SET_LANGUAGE, AUDIO_START, AUDIO_STOP, binary PCM16 audio frames
//
// SET_LANGUAGE {language} asks for captions translated into that language
// (Classroom Broadcast); null means captions in the spoken language.

const PROTOCOL_VERSION = 1;
const PORT_CANDIDATES = [8080, 8081, 8082, 8083, 8084, 8085];
const HEARTBEAT_MS = 30_000;
const MAX_AUDIO_FRAME_BYTES = 64 * 1024;
const MAX_BUFFERED_BYTES = 512 * 1024;
const AUTH_FAILURE_LIMIT = 5;
const AUTH_FAILURE_WINDOW_MS = 60_000;
const SUPPORTED_SAMPLE_RATES = new Set([8000, 16000, 24000, 44100, 48000]);
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TOKEN_LENGTH = 10;
const SKIPPED_INTERFACES = /^(lo|utun|bridge|vmnet|vboxnet|docker|veth|br-|virbr|awdl|llw|ap\d|anpi|gif|stf|tun|tap|vEthernet|Loopback)/i;
const CAPTION_LANGUAGE_PATTERN = /^[A-Za-z][A-Za-z ()-]{1,39}$/;
const PREFERRED_INTERFACES = /^(en0|en1|eth0|eth1|wlan0|wlp|enp|eno|Wi-?Fi|Ethernet|WLAN)/i;

function generateToken() {
    const bytes = crypto.randomBytes(TOKEN_LENGTH);
    let token = '';
    for (const byte of bytes) token += CROCKFORD[byte % 32];
    return token;
}

function formatToken(token) {
    return `${token.slice(0, 5)}-${token.slice(5)}`;
}

function normalizeToken(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/[^0-9A-Z]/g, '')
        .replace(/O/g, '0')
        .replace(/[IL]/g, '1');
}

function tokensMatch(expected, provided) {
    const a = Buffer.from(expected);
    const b = Buffer.from(normalizeToken(provided));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function listLanAddresses() {
    const results = [];
    const nets = os.networkInterfaces();
    for (const [name, entries] of Object.entries(nets)) {
        if (SKIPPED_INTERFACES.test(name)) continue;
        for (const net of entries || []) {
            if (net.family !== 'IPv4' || net.internal || net.address.startsWith('169.254.')) continue;
            results.push({ name, address: net.address, preferred: PREFERRED_INTERFACES.test(name) });
        }
    }
    results.sort((a, b) => Number(b.preferred) - Number(a.preferred));
    return results.map((entry) => entry.address);
}

function deviceName() {
    // "Suhaans-MacBook.local" / "Mac.lan" -> "Suhaans-MacBook" / "Mac"
    return String(os.hostname() || 'Relay Desktop').split('.')[0] || 'Relay Desktop';
}

class MobileBridge extends EventEmitter {
    constructor({ hooks = {}, store = null, ports = PORT_CANDIDATES } = {}) {
        super();
        this.hooks = hooks;
        this.ports = ports;
        if (!store) {
            const Store = require('electron-store');
            store = new Store({ name: 'relay-pairing' });
        }
        this.store = store;
        if (!this.store.get('token')) this.store.set('token', generateToken());
        this.server = null;
        this.wss = null;
        this.port = null;
        this.running = false;
        this.error = null;
        this.clients = new Set();
        this.remoteMic = null;
        this.authFailures = new Map();
        this.heartbeat = null;
    }

    get token() {
        return this.store.get('token');
    }

    get connectedCount() {
        return this.clients.size;
    }

    async start() {
        if (this.running) return;
        this.wss = new WebSocket.Server({ noServer: true, maxPayload: 256 * 1024 });
        this.wss.on('error', (error) => console.error('[MobileBridge] socket server error:', error.message));
        this.wss.on('connection', (ws, request, meta) => this.handleConnection(ws, request, meta));

        for (const port of this.ports) {
            try {
                await this.listen(port);
                this.port = port;
                this.running = true;
                this.error = null;
                break;
            } catch (error) {
                if (error.code !== 'EADDRINUSE' && error.code !== 'EACCES') {
                    this.error = error.message;
                    break;
                }
            }
        }

        if (!this.running) {
            this.error = this.error || `Ports ${this.ports[0]}-${this.ports.at(-1)} are in use`;
            console.error('[MobileBridge] Not started:', this.error);
            this.emitStatus();
            return;
        }

        this.heartbeat = setInterval(() => {
            for (const ws of this.clients) {
                if (ws.isAlive === false) {
                    ws.terminate();
                    continue;
                }
                ws.isAlive = false;
                try { ws.ping(); } catch { /* socket already closing */ }
            }
        }, HEARTBEAT_MS);

        console.log(`[MobileBridge] Listening on port ${this.port} (${listLanAddresses().join(', ') || 'no LAN address'})`);
        this.emitStatus();
    }

    listen(port) {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ app: 'Relay Desktop', protocol: PROTOCOL_VERSION }));
            });
            server.on('upgrade', (request, socket, head) => this.handleUpgrade(request, socket, head));
            server.once('error', reject);
            server.listen(port, () => {
                server.removeListener('error', reject);
                server.on('error', (error) => console.error('[MobileBridge] server error:', error.message));
                this.server = server;
                resolve();
            });
        });
    }

    handleUpgrade(request, socket, head) {
        const ip = request.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const failures = this.authFailures.get(ip);
        if (failures && now - failures.start < AUTH_FAILURE_WINDOW_MS && failures.count >= AUTH_FAILURE_LIMIT) {
            socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
            return;
        }

        let url;
        try {
            url = new URL(request.url || '/', 'http://relay.local');
        } catch {
            socket.destroy();
            return;
        }

        if (!tokensMatch(this.token, url.searchParams.get('token'))) {
            const entry = failures && now - failures.start < AUTH_FAILURE_WINDOW_MS
                ? { start: failures.start, count: failures.count + 1 }
                : { start: now, count: 1 };
            this.authFailures.set(ip, entry);
            socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
            return;
        }

        this.authFailures.delete(ip);
        const meta = { name: String(url.searchParams.get('name') || 'Phone').slice(0, 60) };
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit('connection', ws, request, meta);
        });
    }

    handleConnection(ws, _request, meta) {
        ws.isAlive = true;
        ws.deviceName = meta?.name || 'Phone';
        ws.captionLanguage = null;
        this.clients.add(ws);
        console.log(`[MobileBridge] ${ws.deviceName} connected`);

        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('message', (data, isBinary) => {
            ws.isAlive = true;
            if (isBinary) {
                this.handleAudioFrame(ws, data);
                return;
            }
            let message;
            try {
                message = JSON.parse(data.toString());
            } catch {
                return;
            }
            this.handleMessage(ws, message);
        });
        ws.on('close', () => {
            this.clients.delete(ws);
            if (this.remoteMic?.ws === ws) this.endRemoteMic();
            console.log(`[MobileBridge] ${ws.deviceName} disconnected`);
            this.emitStatus();
        });
        ws.on('error', (error) => console.warn('[MobileBridge] client error:', error.message));

        this.send(ws, {
            type: 'WELCOME',
            app: 'Relay Desktop',
            name: deviceName(),
            platform: process.platform,
            protocol: PROTOCOL_VERSION,
            port: this.port
        });
        this.emitStatus();
    }

    async handleMessage(ws, message) {
        switch (message?.type) {
            case 'PING':
                this.send(ws, { type: 'PONG' });
                break;
            case 'SET_LANGUAGE': {
                const language = typeof message.language === 'string' ? message.language.trim() : '';
                ws.captionLanguage = CAPTION_LANGUAGE_PATTERN.test(language) && language !== 'English' ? language : null;
                this.emitStatus();
                break;
            }
            case 'AUDIO_START':
                await this.beginRemoteMic(ws, message);
                break;
            case 'AUDIO_STOP':
                if (this.remoteMic?.ws === ws) this.endRemoteMic();
                break;
            default:
                break;
        }
    }

    async beginRemoteMic(ws, message) {
        const sampleRate = Number(message.sampleRate) || 16000;
        if (message.encoding && message.encoding !== 'linear16') {
            this.send(ws, { type: 'AUDIO_REJECTED', reason: 'unsupported_encoding' });
            return;
        }
        if (!SUPPORTED_SAMPLE_RATES.has(sampleRate) || (message.channels && Number(message.channels) !== 1)) {
            this.send(ws, { type: 'AUDIO_REJECTED', reason: 'unsupported_format' });
            return;
        }
        if (this.remoteMic && this.remoteMic.ws !== ws) {
            this.send(ws, { type: 'AUDIO_REJECTED', reason: 'busy' });
            return;
        }

        this.remoteMic = { ws, sampleRate, name: ws.deviceName };
        let result = { ok: true };
        try {
            result = (await this.hooks.onAudioStart?.({ sampleRate, deviceName: ws.deviceName })) || { ok: true };
        } catch (error) {
            result = { ok: false, error: error.message };
        }

        if (this.remoteMic?.ws !== ws) return;
        if (!result.ok) {
            this.remoteMic = null;
            this.hooks.onAudioStop?.();
            this.send(ws, { type: 'AUDIO_REJECTED', reason: 'captions_unavailable', message: result.error || '' });
        } else {
            this.send(ws, { type: 'AUDIO_ACK', sampleRate });
        }
        this.emitStatus();
    }

    endRemoteMic() {
        if (!this.remoteMic) return;
        this.remoteMic = null;
        try {
            this.hooks.onAudioStop?.();
        } catch (error) {
            console.warn('[MobileBridge] onAudioStop failed:', error.message);
        }
        this.emitStatus();
    }

    handleAudioFrame(ws, data) {
        if (this.remoteMic?.ws !== ws) return;
        const buffer = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
        if (buffer.length === 0 || buffer.length % 2 !== 0 || buffer.length > MAX_AUDIO_FRAME_BYTES) return;
        this.hooks.onAudioFrame?.(buffer);
    }

    send(ws, message) {
        if (ws.readyState !== WebSocket.OPEN) return;
        try {
            ws.send(JSON.stringify(message));
        } catch (error) {
            console.warn('[MobileBridge] send failed:', error.message);
        }
    }

    // Optional filter(ws) limits the message to some phones.
    broadcast(message, filter = null) {
        if (!this.clients.size) return;
        const payload = JSON.stringify(message);
        for (const ws of this.clients) {
            if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > MAX_BUFFERED_BYTES) continue;
            if (filter && !filter(ws)) continue;
            try { ws.send(payload); } catch { /* dropped for this client */ }
        }
    }

    // Languages phones have asked captions to be translated into.
    get captionLanguages() {
        const languages = new Set();
        for (const ws of this.clients) {
            if (ws.captionLanguage) languages.add(ws.captionLanguage);
        }
        return [...languages];
    }

    getStatus() {
        return {
            running: this.running,
            port: this.port,
            error: this.error,
            connectedCount: this.clients.size,
            devices: [...this.clients].map((ws) => (ws.captionLanguage ? `${ws.deviceName} (${ws.captionLanguage})` : ws.deviceName)),
            captionLanguages: this.captionLanguages,
            remoteMicActive: Boolean(this.remoteMic),
            remoteMicDevice: this.remoteMic?.name || null
        };
    }

    emitStatus() {
        this.emit('status', this.getStatus());
    }

    async getPairingInfo() {
        const hosts = listLanAddresses();
        const host = hosts[0] || null;
        const name = deviceName();
        const token = this.token;
        let url = null;
        let qrDataUrl = null;
        if (this.running && host) {
            const params = new URLSearchParams({ host, port: String(this.port), token, name, v: String(PROTOCOL_VERSION) });
            url = `relay://pair?${params.toString()}`;
            qrDataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
        }
        return {
            ...this.getStatus(),
            host,
            hosts,
            name,
            code: formatToken(token),
            url,
            qrDataUrl
        };
    }

    async regenerateToken() {
        this.store.set('token', generateToken());
        for (const ws of this.clients) {
            try { ws.close(4401, 'token_rotated'); } catch { /* already closing */ }
        }
        return this.getPairingInfo();
    }

    stop() {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
        for (const ws of this.clients) {
            try { ws.terminate(); } catch { /* ignore */ }
        }
        this.clients.clear();
        this.remoteMic = null;
        try { this.wss?.close(); } catch { /* ignore */ }
        try { this.server?.close(); } catch { /* ignore */ }
        this.running = false;
    }
}

module.exports = {
    MobileBridge,
    PROTOCOL_VERSION,
    generateToken,
    normalizeToken,
    tokensMatch,
    listLanAddresses
};
