// Relay Settings UI Logic
// Populates form controls from persisted settings, writes changes via IPC

const api = window.electronAPI;

let currentSettings = {};

// ============================================
// TAB SWITCHING
// ============================================
const tabs = document.querySelectorAll('.sidebar-item');
const sections = document.querySelectorAll('.section');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'phone') refreshPhonePairing();
    });
});

// ============================================
// SETTINGS BINDING HELPERS
// ============================================

function bindToggle(id, settingsKey) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = !!currentSettings[settingsKey];
    el.addEventListener('change', () => {
        currentSettings[settingsKey] = el.checked;
        api.setSettings(settingsKey, el.checked);
    });
}

function bindSelect(id, settingsKey) {
    const el = document.getElementById(id);
    if (!el) return;
    if (currentSettings[settingsKey] !== undefined) {
        el.value = currentSettings[settingsKey];
    }
    el.addEventListener('change', () => {
        currentSettings[settingsKey] = el.value;
        api.setSettings(settingsKey, el.value);
    });
}

function bindRange(id, settingsKey, valueDisplayId) {
    const el = document.getElementById(id);
    if (!el) return;
    if (currentSettings[settingsKey] !== undefined) {
        el.value = currentSettings[settingsKey];
    }
    const display = valueDisplayId ? document.getElementById(valueDisplayId) : null;
    if (display) display.textContent = el.value;

    el.addEventListener('input', () => {
        if (display) display.textContent = el.value;
        currentSettings[settingsKey] = Number(el.value);
        api.setSettings(settingsKey, Number(el.value));
        updateCaptionPreview();
    });
}

function bindTextInput(id, settingsKey) {
    const el = document.getElementById(id);
    if (!el) return;
    if (currentSettings[settingsKey] !== undefined) {
        el.value = currentSettings[settingsKey];
    }
    el.addEventListener('change', () => {
        currentSettings[settingsKey] = el.value;
        api.setSettings(settingsKey, el.value);
    });
}

function bindTagInput(id, settingsKey) {
    const container = document.getElementById(id);
    if (!container) return;
    const input = container.querySelector('input');
    const tagsEl = container.querySelector('.tags-list');
    const items = currentSettings[settingsKey] || [];

    function renderTags() {
        tagsEl.innerHTML = '';
        items.forEach((item, idx) => {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.innerHTML = `${item} <span class="tag-remove" data-idx="${idx}">&times;</span>`;
            tagsEl.appendChild(tag);
        });
        tagsEl.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                items.splice(Number(btn.dataset.idx), 1);
                currentSettings[settingsKey] = [...items];
                api.setSettings(settingsKey, currentSettings[settingsKey]);
                renderTags();
            });
        });
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            items.push(input.value.trim());
            input.value = '';
            currentSettings[settingsKey] = [...items];
            api.setSettings(settingsKey, currentSettings[settingsKey]);
            renderTags();
        }
    });

    renderTags();
}

// ============================================
// ALERT CATEGORY TOGGLES
// ============================================
function bindAlertCategories() {
    const categories = ['emergency', 'attention', 'communication', 'appliance', 'environmental', 'media'];
    categories.forEach(cat => {
        const el = document.getElementById(`alert-${cat}`);
        if (!el) return;
        const cats = currentSettings.alertCategories || {};
        el.checked = cats[cat] !== false;
        el.addEventListener('change', () => {
            if (!currentSettings.alertCategories) currentSettings.alertCategories = {};
            currentSettings.alertCategories[cat] = el.checked;
            api.setSettings('alertCategories', currentSettings.alertCategories);
        });
    });
}

// ============================================
// CAPTION PREVIEW
// ============================================
function updateCaptionPreview() {
    const preview = document.getElementById('caption-preview');
    if (!preview) return;

    const size = currentSettings.captionFontSize || 24;
    const weight = currentSettings.captionFontWeight || 'medium';
    const font = currentSettings.captionFontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
    const textColor = currentSettings.captionTextColor || '#f5f5f7';
    const bgOpacity = (currentSettings.captionBackgroundOpacity ?? 85) / 100;
    const maxLines = currentSettings.captionMaxLines || 3;

    preview.style.fontFamily = font;
    preview.style.fontSize = `${size}px`;
    preview.style.fontWeight = weight === 'bold' ? '700' : weight === 'light' ? '300' : '500';
    preview.style.color = textColor;
    preview.style.background = `rgba(29, 29, 31, ${bgOpacity})`;
    preview.style.webkitLineClamp = maxLines;

    // Speaker colors
    const speakerSpans = preview.querySelectorAll('.preview-speaker');
    const showSpeakers = currentSettings.showSpeakerNames !== false;
    speakerSpans.forEach(s => s.style.display = showSpeakers ? 'inline' : 'none');

    // Filler words
    const fillerSpans = preview.querySelectorAll('.preview-filler');
    const fillerOpacity = currentSettings.showFillerWords !== false
        ? (currentSettings.fillerWordOpacity ?? 50) / 100
        : 1;
    fillerSpans.forEach(s => s.style.opacity = fillerOpacity);
}

// ============================================
// RESET BUTTON
// ============================================
function bindResetButton() {
    const btn = document.getElementById('reset-settings-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
            await api.resetSettings();
            currentSettings = await api.getAllSettings();
            populateAll();
        }
    });
}

// ============================================
// POPULATE ALL CONTROLS
// ============================================
function populateAll() {
    // General
    bindToggle('setting-launch-login', 'launchAtLogin');
    bindToggle('setting-menu-bar', 'showInMenuBar');
    bindSelect('setting-language', 'language');

    // Captions
    bindSelect('setting-caption-font', 'captionFontFamily');
    bindRange('setting-caption-size', 'captionFontSize', 'caption-size-value');
    bindSelect('setting-caption-weight', 'captionFontWeight');
    bindSelect('setting-caption-position', 'captionPosition');
    bindRange('setting-caption-max-lines', 'captionMaxLines', 'caption-lines-value');
    bindRange('setting-caption-bg-opacity', 'captionBackgroundOpacity', 'caption-opacity-value');
    bindRange('setting-autohide-delay', 'autoHideDelay', 'autohide-value');
    bindToggle('setting-speaker-names', 'showSpeakerNames');
    bindToggle('setting-emotions', 'showEmotions');
    bindToggle('setting-timestamps', 'showTimestamps');
    bindToggle('setting-confidence', 'showConfidenceShading');
    bindToggle('setting-filler-words', 'showFillerWords');
    bindRange('setting-filler-opacity', 'fillerWordOpacity', 'filler-opacity-value');
    bindTagInput('keywords-input', 'customKeywords');

    // Sound Alerts
    bindToggle('setting-sound-alerts', 'soundAlertsEnabled');
    bindAlertCategories();

    // AI
    bindSelect('setting-ai-proactivity', 'aiProactivityLevel');
    bindSelect('setting-ai-detail', 'aiExplanationDetail');
    bindToggle('setting-guide-mode', 'guideModeEnabled');

    // Meeting
    bindToggle('setting-meeting-detect', 'meetingAutoDetect');
    bindToggle('setting-meeting-summary', 'meetingAutoSummary');

    // Privacy
    bindToggle('setting-offline-mode', 'forceOfflineTranscription');
    bindToggle('setting-store-transcripts', 'storeTranscripts');
    bindRange('setting-retention', 'transcriptRetentionHours', 'retention-value');

    // Name Detection
    bindTagInput('names-input', 'userNames');

    // Advanced
    bindToggle('setting-debug', 'debugLogging');
    bindToggle('setting-performance', 'performanceMode');

    bindResetButton();
    updateCaptionPreview();
}

// ============================================
// PHONE PAIRING
// ============================================

function renderPhoneStatus(status) {
    const statusEl = document.getElementById('pair-status');
    if (!statusEl || !status) return;
    if (!status.running) {
        statusEl.textContent = status.error
            ? `Phone connection is unavailable: ${status.error}`
            : 'Phone connection is starting...';
        return;
    }
    const count = Number(status.connectedCount || 0);
    let text = count === 0
        ? 'No phones connected.'
        : `${count} phone${count === 1 ? '' : 's'} connected: ${(status.devices || []).join(', ')}.`;
    if (status.remoteMicActive) {
        text += ` Remote Mic active from ${status.remoteMicDevice || 'phone'}.`;
    }
    statusEl.textContent = text;
}

async function refreshPhonePairing() {
    if (!api.getMobilePairingInfo) return;
    let info;
    try {
        info = await api.getMobilePairingInfo();
    } catch (e) {
        info = { running: false, error: e.message };
    }
    renderPairingInfo(info);
}

function renderPairingInfo(info) {
    const qr = document.getElementById('pair-qr');
    const qrEmpty = document.getElementById('pair-qr-empty');
    const nameEl = document.getElementById('pair-name');
    const addressEl = document.getElementById('pair-address');
    const codeEl = document.getElementById('pair-code');
    if (!qr || !info) return;

    nameEl.textContent = info.name || '-';
    addressEl.textContent = info.host && info.port ? `${info.host}:${info.port}` : 'No network connection';
    codeEl.textContent = info.code || '-';

    if (info.qrDataUrl) {
        qr.src = info.qrDataUrl;
        qr.hidden = false;
        qrEmpty.hidden = true;
    } else {
        qr.hidden = true;
        qrEmpty.hidden = false;
        qrEmpty.textContent = info.running
            ? 'Connect this computer to Wi-Fi to pair a phone.'
            : 'Phone connection is unavailable.';
    }
    renderPhoneStatus(info);
}

function bindPhonePairing() {
    const regenerate = document.getElementById('pair-regenerate-btn');
    if (regenerate && api.regenerateMobilePairing) {
        regenerate.addEventListener('click', async () => {
            if (!confirm('Regenerate the pairing code? Paired phones will be disconnected.')) return;
            renderPairingInfo(await api.regenerateMobilePairing());
        });
    }
    if (api.onMobileBridgeStatus) {
        api.onMobileBridgeStatus((status) => {
            renderPhoneStatus(status);
            if (document.getElementById('phone')?.classList.contains('active')) refreshPhonePairing();
        });
    }
    refreshPhonePairing();
}

// ============================================
// INIT
// ============================================
(async function init() {
    try {
        currentSettings = await api.getAllSettings();
    } catch (e) {
        console.warn('Could not load settings:', e);
        currentSettings = {};
    }
    populateAll();
    bindPhonePairing();

    // Listen for external settings changes
    if (api.onSettingsChanged) {
        api.onSettingsChanged(async (key, value) => {
            if (key === null) {
                currentSettings = await api.getAllSettings();
                populateAll();
            } else {
                currentSettings[key] = value;
            }
        });
    }
})();
