// Relay Meeting Mode
// Auto-detects meetings, tracks duration, stores transcripts, generates summaries

const MEETING_APPS = {
    'zoom.us': { name: 'Zoom', icon: '📹' },
    'zoom': { name: 'Zoom', icon: '📹' },
    'microsoft teams': { name: 'Teams', icon: '👥' },
    'teams': { name: 'Teams', icon: '👥' },
    'google meet': { name: 'Google Meet', icon: '🟢' },
    'facetime': { name: 'FaceTime', icon: '📱' },
    'webex': { name: 'Webex', icon: '🌐' },
    'slack': { name: 'Slack', icon: '💬' },
    'discord': { name: 'Discord', icon: '🎮' },
    'skype': { name: 'Skype', icon: '📞' },
};

export class MeetingMode {
    constructor(options = {}) {
        this.isActive = false;
        this.meetingApp = null;
        this.startTime = null;
        this.transcripts = [];
        this.speakers = new Set();
        this.timerEl = null;
        this.badgeEl = null;
        this.timerInterval = null;
        this.onMeetingEnd = options.onMeetingEnd || null;
        this.onMeetingStart = options.onMeetingStart || null;

        // Grace period: don't end meeting if user briefly switches apps
        this._endTimeout = null;
        this._gracePeriod = 30000; // 30s
    }

    checkContext(appNameRaw) {
        const appName = (appNameRaw || '').toLowerCase();

        let match = null;
        for (const [key, data] of Object.entries(MEETING_APPS)) {
            if (appName.includes(key)) {
                match = data;
                break;
            }
        }

        if (match) {
            // Cancel pending end
            if (this._endTimeout) {
                clearTimeout(this._endTimeout);
                this._endTimeout = null;
            }

            if (!this.isActive) {
                this._startMeeting(match);
            }
        } else if (this.isActive) {
            // User left meeting app - start grace period
            if (!this._endTimeout) {
                this._endTimeout = setTimeout(() => {
                    this._endMeeting();
                }, this._gracePeriod);
            }
        }
    }

    _startMeeting(appInfo) {
        this.isActive = true;
        this.meetingApp = appInfo;
        this.startTime = Date.now();
        this.transcripts = [];
        this.speakers = new Set();

        this._startTimer();

        if (this.onMeetingStart) {
            this.onMeetingStart(appInfo);
        }

        console.log(`[Meeting] Started: ${appInfo.name}`);
    }

    _endMeeting() {
        if (!this.isActive) return;

        const duration = Date.now() - this.startTime;
        const summary = {
            app: this.meetingApp,
            startTime: this.startTime,
            duration,
            transcriptCount: this.transcripts.length,
            speakerCount: this.speakers.size,
            transcripts: this.transcripts.slice(),
        };

        this._stopTimer();
        this.isActive = false;

        if (this.onMeetingEnd) {
            this.onMeetingEnd(summary);
        }

        console.log(`[Meeting] Ended: ${this.meetingApp?.name}, duration: ${this._formatDuration(duration)}`);

        this.meetingApp = null;
        this.startTime = null;
        this._endTimeout = null;
    }

    /**
     * Manually toggle meeting tracking when auto-detection is unavailable.
     */
    toggleManualSession() {
        if (this.isActive) {
            this._endMeeting();
            this.updateBadge();
            return false;
        }
        this._startMeeting({ name: 'Manual Meeting', icon: '📹' });
        this.updateBadge();
        return true;
    }

    addTranscript(result) {
        if (!this.isActive) return;

        this.transcripts.push({
            text: result.transcript,
            words: result.words || [],
            speaker: result.words?.[0]?.speaker ?? null,
            confidence: result.confidence || 0,
            timestamp: Date.now(),
            isFinal: result.isFinal,
        });

        // Track speakers
        if (result.words) {
            result.words.forEach(w => {
                if (w.speaker !== undefined && w.speaker !== null) {
                    this.speakers.add(w.speaker);
                }
            });
        }
    }

    getFullTranscript() {
        return this.transcripts
            .filter(t => t.isFinal)
            .map(t => {
                const speaker = t.speaker !== null ? `Speaker ${t.speaker + 1}` : '';
                return `${speaker}: ${t.text}`;
            })
            .join('\n');
    }

    async generateSummary() {
        if (!window.electronAPI?.generateMeetingSummary) return null;

        const transcript = this.getFullTranscript();
        if (!transcript.trim()) return null;

        try {
            const result = await window.electronAPI.generateMeetingSummary({
                transcript,
                speakerCount: this.speakers.size,
                app: this.meetingApp?.name || 'Unknown',
                duration: this.startTime ? Date.now() - this.startTime : 0,
            });
            return result;
        } catch (err) {
            console.error('[Meeting] Summary generation error:', err);
            return null;
        }
    }

    // Timer UI
    _startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (this.timerEl && this.startTime) {
                this.timerEl.textContent = this._formatDuration(Date.now() - this.startTime);
            }
        }, 1000);
    }

    _stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    _formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const mm = String(minutes % 60).padStart(2, '0');
        const ss = String(seconds % 60).padStart(2, '0');
        if (hours > 0) {
            return `${hours}:${mm}:${ss}`;
        }
        return `${mm}:${ss}`;
    }

    // Bind to UI elements
    bindTimerElement(el) {
        this.timerEl = el;
    }

    bindBadgeElement(el) {
        this.badgeEl = el;
    }

    updateBadge() {
        if (!this.badgeEl) return;
        if (this.isActive) {
            this.badgeEl.style.display = 'flex';
            this.badgeEl.innerHTML = `
                <span style="font-size:12px;">${this.meetingApp?.icon || '📹'}</span>
                <span style="font-size:11px;font-weight:600;">${this.meetingApp?.name || 'Meeting'}</span>
                <span id="meeting-timer" style="font-size:11px;opacity:0.7;font-variant-numeric:tabular-nums;">00:00</span>
                <span style="font-size:11px;">• ${this.speakers.size} speakers</span>
            `;
            this.timerEl = this.badgeEl.querySelector('#meeting-timer');
        } else {
            this.badgeEl.style.display = 'none';
        }
    }
}
