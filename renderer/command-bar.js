// Relay Command Bar
// Natural language command interface (Cmd+Shift+Space)

const QUICK_COMMANDS = [
    { label: 'Show captions', icon: '💬', action: 'toggle-captions' },
    { label: 'What\'s on screen?', icon: '📍', action: 'explain-screen' },
    { label: 'Bigger captions', icon: '🔤', action: 'caption-larger' },
    { label: 'Clear alerts', icon: '🔕', action: 'dismiss-alerts' },
    { label: 'Open settings', icon: '⚙️', action: 'open-settings' },
    { label: 'Meeting summary', icon: '📝', action: 'meeting-summary' },
];

export class CommandBar {
    constructor(container, options = {}) {
        this.container = container;
        this.isVisible = false;
        this.recentCommands = this._loadRecent();
        this.onAction = options.onAction || (() => {});
        this.panel = null;
        this._createPanel();
    }

    _createPanel() {
        this.panel = document.createElement('div');
        this.panel.id = 'command-bar-panel';
        this.panel.style.cssText = `
            position: fixed;
            top: 30%;
            left: 50%;
            transform: translateX(-50%) scale(0.95);
            width: 520px;
            background: rgba(29, 29, 31, 0.96);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
            color: #f5f5f7;
            z-index: 450;
            display: none;
            flex-direction: column;
            opacity: 0;
            transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
            pointer-events: auto;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
            overflow: hidden;
        `;

        this.panel.innerHTML = `
            <div style="display:flex;align-items:center;padding:14px 18px;gap:10px;border-bottom:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:16px;opacity:0.5;">🔍</span>
                <input id="cb-input" type="text" placeholder="What would you like to do?" style="flex:1;background:none;border:none;color:white;font-size:16px;outline:none;font-family:inherit;" autocomplete="off">
                <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-size:11px;opacity:0.4;">ESC</kbd>
            </div>
            <div id="cb-suggestions" style="padding:8px;max-height:300px;overflow-y:auto;"></div>
        `;

        this.container.appendChild(this.panel);

        const input = this.panel.querySelector('#cb-input');
        input.addEventListener('input', () => this._onInput(input.value));
        input.addEventListener('keydown', (e) => this._onKeyDown(e));
    }

    _onInput(value) {
        const suggestionsEl = this.panel.querySelector('#cb-suggestions');
        const query = value.trim().toLowerCase();

        if (!query) {
            this._showDefaultSuggestions(suggestionsEl);
            return;
        }

        // Filter quick commands
        const matches = QUICK_COMMANDS.filter(c =>
            c.label.toLowerCase().includes(query)
        );

        suggestionsEl.innerHTML = '';

        if (matches.length > 0) {
            matches.forEach(cmd => {
                suggestionsEl.appendChild(this._createSuggestionItem(cmd.icon, cmd.label, '', () => {
                    this._execute(cmd.action, cmd.label);
                }));
            });
        }

        // Always show "Ask AI" option
        suggestionsEl.appendChild(this._createSuggestionItem('🤖', `Ask AI: "${value}"`, 'Press Enter', () => {
            this._executeAI(value);
        }));

        this._selectedIndex = 0;
        this._updateSelection(suggestionsEl);
    }

    _onKeyDown(e) {
        const suggestionsEl = this.panel.querySelector('#cb-suggestions');
        const items = suggestionsEl.querySelectorAll('.cb-item');

        if (e.key === 'Escape') {
            this.hide();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._selectedIndex = Math.min((this._selectedIndex || 0) + 1, items.length - 1);
            this._updateSelection(suggestionsEl);
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._selectedIndex = Math.max((this._selectedIndex || 0) - 1, 0);
            this._updateSelection(suggestionsEl);
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            const selected = items[this._selectedIndex || 0];
            if (selected) selected.click();
            return;
        }
    }

    _updateSelection(container) {
        const items = container.querySelectorAll('.cb-item');
        items.forEach((item, i) => {
            item.style.background = i === (this._selectedIndex || 0)
                ? 'rgba(0, 113, 227, 0.25)'
                : 'transparent';
        });
    }

    _showDefaultSuggestions(container) {
        container.innerHTML = '';

        // Show recent commands
        if (this.recentCommands.length > 0) {
            const recentLabel = document.createElement('div');
            recentLabel.style.cssText = 'padding:6px 12px;font-size:11px;opacity:0.4;text-transform:uppercase;letter-spacing:0.5px;';
            recentLabel.textContent = 'Recent';
            container.appendChild(recentLabel);

            this.recentCommands.slice(0, 3).forEach(cmd => {
                container.appendChild(this._createSuggestionItem('🕐', cmd, '', () => {
                    this._executeAI(cmd);
                }));
            });
        }

        // Show quick actions
        const actionsLabel = document.createElement('div');
        actionsLabel.style.cssText = 'padding:6px 12px;font-size:11px;opacity:0.4;text-transform:uppercase;letter-spacing:0.5px;';
        actionsLabel.textContent = 'Quick Actions';
        container.appendChild(actionsLabel);

        QUICK_COMMANDS.forEach(cmd => {
            container.appendChild(this._createSuggestionItem(cmd.icon, cmd.label, '', () => {
                this._execute(cmd.action, cmd.label);
            }));
        });

        this._selectedIndex = 0;
        this._updateSelection(container);
    }

    _createSuggestionItem(icon, label, hint, onClick) {
        const item = document.createElement('div');
        item.className = 'cb-item';
        item.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.15s;
            font-size: 14px;
        `;
        item.innerHTML = `
            <span style="font-size:16px;width:24px;text-align:center;">${icon}</span>
            <span style="flex:1;">${label}</span>
            ${hint ? `<span style="font-size:11px;opacity:0.3;">${hint}</span>` : ''}
        `;
        item.onmouseenter = () => { item.style.background = 'rgba(255,255,255,0.06)'; };
        item.onmouseleave = () => {
            const idx = Array.from(item.parentNode.querySelectorAll('.cb-item')).indexOf(item);
            item.style.background = idx === (this._selectedIndex || 0) ? 'rgba(0, 113, 227, 0.25)' : 'transparent';
        };
        item.onclick = onClick;
        return item;
    }

    _execute(action, label) {
        this._addRecent(label);
        this.hide();
        this.onAction(action, label);
    }

    async _executeAI(query) {
        this._addRecent(query);

        if (!window.electronAPI?.executeCommand) {
            this.hide();
            this.onAction('ai-command', query);
            return;
        }

        // Show loading in the suggestion area
        const suggestionsEl = this.panel.querySelector('#cb-suggestions');
        suggestionsEl.innerHTML = `
            <div style="text-align:center;padding:20px;">
                <div style="width:24px;height:24px;border:2px solid rgba(255,255,255,0.1);border-top:2px solid #0071e3;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 8px;"></div>
                <div style="font-size:13px;opacity:0.5;">Processing...</div>
            </div>
        `;

        try {
            const result = await window.electronAPI.executeCommand(query);
            this.hide();
            if (result.success && result.action) {
                this.onAction(result.action, query);
            }
        } catch (err) {
            this.hide();
            console.error('Command execution error:', err);
        }
    }

    _addRecent(cmd) {
        this.recentCommands = [cmd, ...this.recentCommands.filter(c => c !== cmd)].slice(0, 10);
        try { localStorage.setItem('cv-recent-commands', JSON.stringify(this.recentCommands)); } catch (e) {}
    }

    _loadRecent() {
        try {
            return JSON.parse(localStorage.getItem('cv-recent-commands') || '[]');
        } catch (e) { return []; }
    }

    show() {
        this.panel.style.display = 'flex';
        this.isVisible = true;
        requestAnimationFrame(() => {
            this.panel.style.opacity = '1';
            this.panel.style.transform = 'translateX(-50%) scale(1)';
            const input = this.panel.querySelector('#cb-input');
            input.value = '';
            input.focus();
            this._showDefaultSuggestions(this.panel.querySelector('#cb-suggestions'));
        });
    }

    hide() {
        this.panel.style.opacity = '0';
        this.panel.style.transform = 'translateX(-50%) scale(0.95)';
        this.isVisible = false;
        setTimeout(() => {
            this.panel.style.display = 'none';
        }, 200);
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
}
