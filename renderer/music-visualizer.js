// Relay Music Visualizer
// Shows when music is detected: waveform, genre, mood, BPM

export class MusicVisualizer {
    constructor(container) {
        this.container = container;
        this.isVisible = false;
        this.widget = null;
        this.hideTimeout = null;
        this.analyser = null;
        this.animFrame = null;
        this._createWidget();
    }

    _createWidget() {
        this.widget = document.createElement('div');
        this.widget.id = 'music-visualizer';
        this.widget.style.cssText = `
            position: fixed;
            bottom: 220px;
            right: 20px;
            width: 200px;
            background: rgba(29, 29, 31, 0.92);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 14px;
            padding: 14px;
            color: #f5f5f7;
            z-index: 150;
            display: none;
            opacity: 0;
            transform: translateY(10px);
            transition: all 0.3s ease;
            pointer-events: auto;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
        `;

        this.widget.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                <span style="font-size:14px;">🎵</span>
                <span style="font-size:12px;font-weight:600;">Music Playing</span>
            </div>
            <canvas id="mv-bars" width="172" height="40" style="border-radius:6px;"></canvas>
            <div id="mv-info" style="margin-top:8px;font-size:11px;opacity:0.7;"></div>
        `;

        this.container.appendChild(this.widget);
    }

    show(info = {}) {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        const infoEl = this.widget.querySelector('#mv-info');
        const parts = [];
        if (info.genre) parts.push(`Genre: ${info.genre}`);
        if (info.mood) parts.push(`Mood: ${info.mood}`);
        if (info.bpm) parts.push(`~${info.bpm} BPM`);
        infoEl.textContent = parts.join(' • ') || 'Analyzing...';

        if (!this.isVisible) {
            this.widget.style.display = 'block';
            this.isVisible = true;
            requestAnimationFrame(() => {
                this.widget.style.opacity = '1';
                this.widget.style.transform = 'translateY(0)';
            });
            this._startAnimation();
        }
    }

    hide() {
        // Delay hiding by 3 seconds
        if (this.hideTimeout) return;
        this.hideTimeout = setTimeout(() => {
            this.widget.style.opacity = '0';
            this.widget.style.transform = 'translateY(10px)';
            this.isVisible = false;
            this._stopAnimation();
            setTimeout(() => {
                this.widget.style.display = 'none';
            }, 300);
            this.hideTimeout = null;
        }, 3000);
    }

    connectAnalyser(analyser) {
        this.analyser = analyser;
    }

    _startAnimation() {
        if (this.animFrame) return;
        const canvas = this.widget.querySelector('#mv-bars');
        const ctx = canvas.getContext('2d');
        const barCount = 20;
        const barWidth = (canvas.width / barCount) - 2;
        let fakePhase = 0;

        const draw = () => {
            this.animFrame = requestAnimationFrame(draw);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (this.analyser) {
                const data = new Uint8Array(this.analyser.frequencyBinCount);
                this.analyser.getByteFrequencyData(data);
                const step = Math.floor(data.length / barCount);

                for (let i = 0; i < barCount; i++) {
                    const val = data[i * step] / 255;
                    const h = Math.max(2, val * canvas.height);
                    const hue = 220 + i * 3;
                    ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.6 + val * 0.4})`;
                    ctx.fillRect(i * (barWidth + 2), canvas.height - h, barWidth, h);
                }
            } else {
                // Fake animation when no analyser connected
                fakePhase += 0.05;
                for (let i = 0; i < barCount; i++) {
                    const val = 0.3 + 0.4 * Math.sin(fakePhase + i * 0.5) + 0.2 * Math.sin(fakePhase * 2 + i);
                    const h = Math.max(2, val * canvas.height);
                    const hue = 220 + i * 3;
                    ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.5 + val * 0.3})`;
                    ctx.fillRect(i * (barWidth + 2), canvas.height - h, barWidth, h);
                }
            }
        };
        draw();
    }

    _stopAnimation() {
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame);
            this.animFrame = null;
        }
    }

    destroy() {
        this._stopAnimation();
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
        if (this.widget?.parentNode) this.widget.parentNode.removeChild(this.widget);
    }
}
