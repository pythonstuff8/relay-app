// Relay Transcript Store
// IndexedDB-backed persistent transcript storage with search and export

const DB_NAME = 'RelayTranscripts';
const DB_VERSION = 1;
const STORE_NAME = 'transcripts';
const SESSION_STORE = 'sessions';

export class TranscriptStore {
    constructor() {
        this.db = null;
        this.currentSessionId = `session_${Date.now()}`;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('sessionId', 'sessionId', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('speaker', 'speaker', { unique: false });
                }

                if (!db.objectStoreNames.contains(SESSION_STORE)) {
                    const sessionStore = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
                    sessionStore.createIndex('startTime', 'startTime', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this._startSession();
                resolve();
            };

            request.onerror = (event) => {
                console.error('[TranscriptStore] Failed to open DB:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    _startSession() {
        const tx = this.db.transaction(SESSION_STORE, 'readwrite');
        tx.objectStore(SESSION_STORE).put({
            id: this.currentSessionId,
            startTime: Date.now(),
            meetingApp: null,
            meetingName: null,
        });
    }

    updateSession(data) {
        if (!this.db) return;
        const tx = this.db.transaction(SESSION_STORE, 'readwrite');
        const store = tx.objectStore(SESSION_STORE);
        const getReq = store.get(this.currentSessionId);
        getReq.onsuccess = () => {
            const session = getReq.result || { id: this.currentSessionId, startTime: Date.now() };
            Object.assign(session, data);
            store.put(session);
        };
    }

    async store(segment) {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).add({
                sessionId: this.currentSessionId,
                text: segment.text,
                words: segment.words || [],
                speaker: segment.speaker ?? null,
                confidence: segment.confidence || 0,
                timestamp: segment.timestamp || Date.now(),
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async getSession(sessionId) {
        if (!this.db) return [];
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readonly');
            const index = tx.objectStore(STORE_NAME).index('sessionId');
            const request = index.getAll(sessionId || this.currentSessionId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllSessions() {
        if (!this.db) return [];
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(SESSION_STORE, 'readonly');
            const request = tx.objectStore(SESSION_STORE).getAll();
            request.onsuccess = () => resolve(request.result.sort((a, b) => b.startTime - a.startTime));
            request.onerror = () => reject(request.error);
        });
    }

    async search(query) {
        if (!this.db) return [];
        const all = await this._getAll();
        const q = query.toLowerCase();
        return all.filter(t => t.text.toLowerCase().includes(q));
    }

    async _getAll() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clearOlderThan(hours) {
        if (!this.db) return;
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        const all = await this._getAll();
        const toDelete = all.filter(t => t.timestamp < cutoff);

        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        toDelete.forEach(t => store.delete(t.id));
    }

    async clearAll() {
        if (!this.db) return;
        const tx = this.db.transaction([STORE_NAME, SESSION_STORE], 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.objectStore(SESSION_STORE).clear();
    }

    // Export formats
    async exportTXT(sessionId) {
        const segments = await this.getSession(sessionId);
        return segments.map(s => {
            const speaker = s.speaker !== null ? `Speaker ${s.speaker + 1}` : '';
            const time = new Date(s.timestamp).toLocaleTimeString();
            return `[${time}] ${speaker}: ${s.text}`;
        }).join('\n');
    }

    async exportSRT(sessionId) {
        const segments = await this.getSession(sessionId);
        if (segments.length === 0) return '';

        const baseTime = segments[0].timestamp;
        return segments.map((s, i) => {
            const startMs = s.timestamp - baseTime;
            const endMs = startMs + Math.max(2000, s.text.length * 60); // Rough duration estimate
            return `${i + 1}\n${this._formatSRTTime(startMs)} --> ${this._formatSRTTime(endMs)}\n${s.text}\n`;
        }).join('\n');
    }

    async exportVTT(sessionId) {
        const segments = await this.getSession(sessionId);
        if (segments.length === 0) return 'WEBVTT\n\n';

        const baseTime = segments[0].timestamp;
        let vtt = 'WEBVTT\n\n';
        segments.forEach((s, i) => {
            const startMs = s.timestamp - baseTime;
            const endMs = startMs + Math.max(2000, s.text.length * 60);
            const speaker = s.speaker !== null ? `<v Speaker ${s.speaker + 1}>` : '';
            vtt += `${this._formatVTTTime(startMs)} --> ${this._formatVTTTime(endMs)}\n${speaker}${s.text}\n\n`;
        });
        return vtt;
    }

    _formatSRTTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const millis = ms % 1000;
        return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
    }

    _formatVTTTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const millis = ms % 1000;
        return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    }
}
