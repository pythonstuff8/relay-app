// Relay Screen Explanation AI
// GPT-4o vision-powered screen understanding

export class ScreenExplainer {
    constructor(container, options = {}) {
        this.container = container;
        this.isVisible = false;
        this.isLoading = false;
        this.lastExplanation = null;
        this.conversationHistory = [];
        this.panel = null;
        this._createPanel();
    }

    _createPanel() {
        this.panel = document.createElement('div');
        this.panel.id = 'screen-explainer-panel';
        this.panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.95);
            width: 480px;
            max-height: 500px;
            background: rgba(29, 29, 31, 0.95);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            color: #f5f5f7;
            z-index: 400;
            display: none;
            flex-direction: column;
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
            pointer-events: auto;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
        `;

        this.panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.08);">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:16px;">📍</span>
                    <span style="font-weight:600;font-size:15px;">Screen Overview</span>
                </div>
                <button id="se-close" style="background:rgba(255,255,255,0.1);border:none;color:white;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>
            <div id="se-content" style="flex:1;overflow-y:auto;padding:16px 20px;">
                <div id="se-loading" style="display:none;text-align:center;padding:40px 0;">
                    <div style="width:30px;height:30px;border:3px solid rgba(255,255,255,0.1);border-top:3px solid var(--color-accent, #0071e3);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>
                    <div style="font-size:13px;opacity:0.6;">Analyzing screen...</div>
                </div>
                <div id="se-result" style="display:none;"></div>
                <div id="se-error" style="display:none;text-align:center;padding:30px 0;">
                    <span style="font-size:24px;">⚠️</span>
                    <div id="se-error-msg" style="margin-top:8px;font-size:13px;opacity:0.7;"></div>
                    <button id="se-retry" style="margin-top:12px;background:var(--color-accent,#0071e3);color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;">Retry</button>
                </div>
            </div>
            <div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;">
                <input id="se-followup" type="text" placeholder="Ask a follow-up question..." style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);color:white;font-size:13px;outline:none;">
                <button id="se-ask" style="background:var(--color-accent,#0071e3);color:white;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;">Ask</button>
            </div>
        `;

        this.container.appendChild(this.panel);

        // Wire events
        this.panel.querySelector('#se-close').onclick = () => this.hide();
        this.panel.querySelector('#se-retry').onclick = () => this.explain();
        this.panel.querySelector('#se-ask').onclick = () => this._askFollowUp();
        this.panel.querySelector('#se-followup').onkeydown = (e) => {
            if (e.key === 'Enter') this._askFollowUp();
        };
    }

    async explain() {
        if (!window.electronAPI?.explainScreen) return;

        this.show();
        this._showLoading();

        try {
            const result = await window.electronAPI.explainScreen();
            if (result.success) {
                this.lastExplanation = result.explanation;
                this.conversationHistory = [{ role: 'assistant', content: result.explanation }];
                this._showResult(result.explanation);
            } else {
                this._showError(result.error || 'Failed to analyze screen');
            }
        } catch (err) {
            this._showError(err.message || 'Connection error');
        }
    }

    async _askFollowUp() {
        const input = this.panel.querySelector('#se-followup');
        const question = input.value.trim();
        if (!question || !window.electronAPI?.askFollowUp) return;

        input.value = '';
        this._appendUserMessage(question);
        this._showLoading();

        try {
            const result = await window.electronAPI.askFollowUp(question, this.conversationHistory);
            if (result.success) {
                this.conversationHistory.push({ role: 'user', content: question });
                this.conversationHistory.push({ role: 'assistant', content: result.answer });
                this._appendAssistantMessage(result.answer);
            } else {
                this._appendAssistantMessage('Sorry, I couldn\'t process that question.');
            }
        } catch (err) {
            this._appendAssistantMessage('Error: ' + err.message);
        }
    }

    _showLoading() {
        this.panel.querySelector('#se-loading').style.display = 'block';
        this.panel.querySelector('#se-error').style.display = 'none';
    }

    _showResult(text) {
        this.panel.querySelector('#se-loading').style.display = 'none';
        this.panel.querySelector('#se-error').style.display = 'none';
        const resultEl = this.panel.querySelector('#se-result');
        resultEl.style.display = 'block';
        resultEl.innerHTML = this._formatExplanation(text);
    }

    _showError(msg) {
        this.panel.querySelector('#se-loading').style.display = 'none';
        this.panel.querySelector('#se-result').style.display = 'none';
        this.panel.querySelector('#se-error').style.display = 'block';
        this.panel.querySelector('#se-error-msg').textContent = msg;
    }

    _appendUserMessage(text) {
        const resultEl = this.panel.querySelector('#se-result');
        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = 'margin-top:12px;padding:8px 12px;background:rgba(0,113,227,0.2);border-radius:8px;font-size:13px;';
        msgDiv.textContent = text;
        resultEl.appendChild(msgDiv);
        resultEl.scrollTop = resultEl.scrollHeight;
    }

    _appendAssistantMessage(text) {
        this.panel.querySelector('#se-loading').style.display = 'none';
        const resultEl = this.panel.querySelector('#se-result');
        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = 'margin-top:8px;font-size:13px;line-height:1.5;';
        msgDiv.innerHTML = this._formatExplanation(text);
        resultEl.appendChild(msgDiv);
        resultEl.scrollTop = resultEl.scrollHeight;
    }

    _formatExplanation(text) {
        // Convert markdown-like formatting to HTML
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^(\d+)\.\s/gm, '<br><strong>$1.</strong> ')
            .replace(/^[-•]\s/gm, '<br>• ')
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');
    }

    show() {
        this.panel.style.display = 'flex';
        this.isVisible = true;
        requestAnimationFrame(() => {
            this.panel.style.opacity = '1';
            this.panel.style.transform = 'translate(-50%, -50%) scale(1)';
        });
    }

    hide() {
        this.panel.style.opacity = '0';
        this.panel.style.transform = 'translate(-50%, -50%) scale(0.95)';
        this.isVisible = false;
        setTimeout(() => {
            this.panel.style.display = 'none';
        }, 300);
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.explain();
        }
    }
}
