/**
 * Relay Mode Switcher - Simple Dropdown Version
 * Minimal mode selection that integrates with toolbar
 */

const MODES = {
    deaf: { name: 'Deaf', color: '#0071e3' },
    blind: { name: 'Blind', color: '#af52de' }
};

export class ModeSwitcher {
    constructor() {
        this.currentMode = 'deaf';
        this.dropdown = null;
        this.init();
        window.dispatchEvent(new CustomEvent('mode-switcher-ready'));
    }

    init() {
        // Load saved mode
        this.loadMode();
        this.hydrateModeFromSettings();

        // Listen for mode switch requests
        window.addEventListener('request-mode-switch', () => {
            this.showDropdown();
        });

        // Close dropdown when clicking outside (delayed to avoid closing on the same click that opened it)
        document.addEventListener('click', (e) => {
            if (this.dropdown && !this.dropdown.contains(e.target)) {
                const modeIndicator = document.getElementById('mode-indicator');
                if (modeIndicator && modeIndicator.contains(e.target)) return;
                this.hideDropdown();
            }
        });
    }

    async hydrateModeFromSettings() {
        try {
            const settingMode = String(await window.electronAPI?.getSettings?.('accessibilityMode') || '').toLowerCase();
            const normalized = MODES[settingMode] ? settingMode : 'deaf';
            if (settingMode && settingMode !== normalized) {
                window.electronAPI?.setSettings?.('accessibilityMode', normalized);
            }
            this.currentMode = normalized;
            this.saveMode(normalized);
            this.updateIndicator();
        } catch (error) {
            // Keep local fallback mode if settings bridge is unavailable.
        }
    }

    loadMode() {
        try {
            const saved = String(localStorage.getItem('accessibilityMode') || '').toLowerCase();
            if (saved && MODES[saved]) {
                this.currentMode = saved;
            } else if (saved === 'combined') {
                this.currentMode = 'deaf';
            }
        } catch (e) {}
    }

    saveMode(mode) {
        try {
            localStorage.setItem('accessibilityMode', mode);
        } catch (e) {}
    }

    showDropdown() {
        // Remove existing dropdown
        this.hideDropdown();

        // Get mode indicator position
        const indicator = document.getElementById('mode-indicator');
        const rect = indicator?.getBoundingClientRect();

        if (!rect) {
            console.error('[ModeSwitcher] Mode indicator not found');
            return;
        }

        // Ensure clicks are captured
        if (window.electronAPI?.setIgnoreMouseEvents) {
            window.electronAPI.setIgnoreMouseEvents(false);
        }

        // Create dropdown
        this.dropdown = document.createElement('div');
        this.dropdown.id = 'mode-dropdown';
        this.dropdown.style.cssText = `
            position: fixed;
            top: ${rect.bottom + 4}px;
            left: ${rect.left}px;
            background: rgba(40, 40, 42, 0.98);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 4px;
            z-index: 100000;
            min-width: 120px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(20px);
            pointer-events: auto;
            display: block;
        `;

        // Add options
        Object.entries(MODES).forEach(([modeId, mode]) => {
            const isActive = modeId === this.currentMode;
            const option = document.createElement('button');
            option.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                padding: 8px 12px;
                background: ${isActive ? 'rgba(255,255,255,0.1)' : 'transparent'};
                border: none;
                border-radius: 4px;
                color: ${isActive ? mode.color : 'white'};
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                text-align: left;
                transition: background 0.15s;
            `;
            option.innerHTML = `
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${mode.color};"></span>
                ${mode.name}
            `;

            option.onmouseenter = () => {
                option.style.background = 'rgba(255,255,255,0.15)';
            };
            option.onmouseleave = () => {
                option.style.background = isActive ? 'rgba(255,255,255,0.1)' : 'transparent';
            };

            option.onclick = () => {
                this.switchMode(modeId);
                this.hideDropdown();
            };

            this.dropdown.appendChild(option);
        });

        document.body.appendChild(this.dropdown);

        // Ensure click capture is enabled so we can interact
        if (window.electronAPI?.setIgnoreMouseEvents) {
            window.electronAPI.setIgnoreMouseEvents(false);
        }
    }

    hideDropdown() {
        if (this.dropdown) {
            this.dropdown.remove();
            this.dropdown = null;
        }
    }

    switchMode(modeId) {
        if (!MODES[modeId]) {
            modeId = 'deaf';
        }
        if (modeId === this.currentMode) return;

        const oldMode = this.currentMode;
        this.currentMode = modeId;
        this.saveMode(modeId);
        window.electronAPI?.setSettings?.('accessibilityMode', modeId);

        // Update UI
        this.updateIndicator();

        // Dispatch event
        window.dispatchEvent(new CustomEvent('mode-changed', {
            detail: { mode: modeId, previousMode: oldMode }
        }));
    }

    updateIndicator() {
        const indicator = document.getElementById('mode-indicator');
        if (indicator) {
            const mode = MODES[this.currentMode] || MODES.deaf;
            indicator.className = `mode-indicator ${this.currentMode}`;
            const textEl = indicator.querySelector('.mode-text');
            if (textEl) textEl.textContent = mode.name;
        }
    }
}

export default ModeSwitcher;
