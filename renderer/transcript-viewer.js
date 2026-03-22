// Relay Transcript Viewer
// Displays full transcript history with search, session grouping, and export

import { TranscriptStore } from './transcript-store.js';

const store = new TranscriptStore();
const searchInput = document.getElementById('search-input');
const sessionList = document.getElementById('session-list');
const transcriptContent = document.getElementById('transcript-content');
const exportTxtBtn = document.getElementById('export-txt');
const exportSrtBtn = document.getElementById('export-srt');
const exportVttBtn = document.getElementById('export-vtt');
const emptyState = document.getElementById('empty-state');

const SPEAKER_COLORS = [
    '#0071e3', '#34c759', '#ff9f0a', '#ff375f',
    '#af52de', '#5ac8fa', '#ff6482', '#ffd60a',
];

let allSessions = [];
let currentSessionId = null;
let currentTranscripts = [];

// ============================================
// SESSION LIST
// ============================================

async function loadSessions() {
    await store.init();
    const db = store.db;
    if (!db) return;

    return new Promise((resolve) => {
        const tx = db.transaction('sessions', 'readonly');
        const objStore = tx.objectStore('sessions');
        const req = objStore.getAll();
        req.onsuccess = () => {
            allSessions = (req.result || []).sort((a, b) => b.startTime - a.startTime);
            renderSessionList();
            resolve();
        };
        req.onerror = () => {
            allSessions = [];
            renderSessionList();
            resolve();
        };
    });
}

function renderSessionList(filter = '') {
    sessionList.innerHTML = '';

    const filtered = filter
        ? allSessions.filter(s =>
            (s.label || '').toLowerCase().includes(filter.toLowerCase()))
        : allSessions;

    if (filtered.length === 0) {
        sessionList.innerHTML = '<div class="session-empty">No sessions found</div>';
        return;
    }

    filtered.forEach(session => {
        const item = document.createElement('div');
        item.className = 'session-item' + (session.id === currentSessionId ? ' active' : '');

        const date = new Date(session.startTime);
        const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const label = session.label || 'Session';

        item.innerHTML = `
            <div class="session-label">${label}</div>
            <div class="session-meta">${dateStr} ${timeStr}</div>
        `;
        item.addEventListener('click', () => loadSession(session.id));
        sessionList.appendChild(item);
    });
}

// ============================================
// TRANSCRIPT DISPLAY
// ============================================

async function loadSession(sessionId) {
    currentSessionId = sessionId;
    renderSessionList();

    const transcripts = await store.getSession(sessionId);
    currentTranscripts = transcripts;
    renderTranscripts(transcripts);
}

function renderTranscripts(transcripts, highlight = '') {
    if (!transcripts || transcripts.length === 0) {
        transcriptContent.innerHTML = '<div class="transcript-empty">No transcripts in this session.</div>';
        emptyState.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    transcriptContent.innerHTML = '';

    let lastSpeaker = null;

    transcripts.forEach(t => {
        const row = document.createElement('div');
        row.className = 'transcript-row';

        const time = new Date(t.timestamp);
        const timeStr = time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const speakerNum = t.speaker ?? 0;
        const speakerColor = SPEAKER_COLORS[speakerNum % SPEAKER_COLORS.length];
        const showSpeakerLabel = t.speaker !== lastSpeaker;
        lastSpeaker = t.speaker;

        let text = t.text || '';
        if (highlight) {
            const regex = new RegExp(`(${escapeRegex(highlight)})`, 'gi');
            text = text.replace(regex, '<mark>$1</mark>');
        }

        row.innerHTML = `
            <span class="transcript-time">${timeStr}</span>
            ${showSpeakerLabel ? `<span class="transcript-speaker" style="color:${speakerColor}">Speaker ${speakerNum + 1}</span>` : '<span class="transcript-speaker-spacer"></span>'}
            <span class="transcript-text">${text}</span>
        `;
        transcriptContent.appendChild(row);
    });

    transcriptContent.scrollTop = transcriptContent.scrollHeight;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================
// SEARCH
// ============================================

let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const query = searchInput.value.trim();
        if (!query) {
            if (currentSessionId) {
                const transcripts = await store.getSession(currentSessionId);
                renderTranscripts(transcripts);
            }
            renderSessionList();
            return;
        }

        // Search across all transcripts
        const results = await store.search(query);
        currentTranscripts = results;
        renderTranscripts(results, query);

        // Filter sessions to those with matches
        const matchedSessions = new Set(results.map(r => r.sessionId));
        renderSessionList();
    }, 300);
});

// ============================================
// EXPORT
// ============================================

async function exportAs(format) {
    if (!currentTranscripts.length) return;

    let data;
    if (format === 'srt') {
        data = await store.exportSRT(currentTranscripts);
    } else if (format === 'vtt') {
        data = await store.exportVTT(currentTranscripts);
    } else {
        data = await store.exportTXT(currentTranscripts);
    }

    if (window.electronAPI?.exportTranscript) {
        await window.electronAPI.exportTranscript(format, data);
    }
}

exportTxtBtn?.addEventListener('click', () => exportAs('txt'));
exportSrtBtn?.addEventListener('click', () => exportAs('srt'));
exportVttBtn?.addEventListener('click', () => exportAs('vtt'));

// ============================================
// INIT
// ============================================

(async function init() {
    await loadSessions();

    if (allSessions.length > 0) {
        await loadSession(allSessions[0].id);
    } else {
        emptyState.style.display = 'flex';
    }
})();
