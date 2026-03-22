// Relay Confusion Detector
// Monitors signals and offers contextual help

export class ConfusionDetector {
    constructor(options = {}) {
        this.onSuggestion = options.onSuggestion || (() => {});
        this.maxSuggestionsPerMinute = 3;
        this._suggestionTimes = [];
        this._nameLastMentioned = 0;
        this._nameResponseTimeout = null;
        this._meetingIdleTimeout = null;
        this._lastActivity = Date.now();
        this.isInMeeting = false;
        this.userNames = [];
    }

    setUserNames(names) {
        this.userNames = (names || []).map(n => n.toLowerCase().trim());
    }

    setMeetingActive(active) {
        this.isInMeeting = active;
        if (!active && this._meetingIdleTimeout) {
            clearTimeout(this._meetingIdleTimeout);
            this._meetingIdleTimeout = null;
        }
    }

    // Called when a name is detected in transcript
    onNameMentioned(name) {
        this._nameLastMentioned = Date.now();

        // Wait 10s - if no user activity, suggest help
        if (this._nameResponseTimeout) clearTimeout(this._nameResponseTimeout);
        this._nameResponseTimeout = setTimeout(() => {
            if (Date.now() - this._lastActivity > 8000) {
                this._suggest({
                    type: 'name-mention',
                    message: `Someone said "${name}". Need to respond?`,
                    action: 'explain-screen',
                    icon: '👤',
                });
            }
        }, 10000);
    }

    // Called on any user interaction
    recordActivity() {
        this._lastActivity = Date.now();

        // Reset meeting idle
        if (this._meetingIdleTimeout) {
            clearTimeout(this._meetingIdleTimeout);
            this._meetingIdleTimeout = null;
        }

        // Start new idle check if in meeting
        if (this.isInMeeting) {
            this._meetingIdleTimeout = setTimeout(() => {
                this._suggest({
                    type: 'meeting-idle',
                    message: 'Need help following the conversation?',
                    action: 'explain-screen',
                    icon: '💡',
                });
            }, 120000); // 2 minutes idle in meeting
        }
    }

    // Check transcript for user names
    checkTranscriptForNames(words) {
        if (!words || this.userNames.length === 0) return;

        for (const w of words) {
            const word = (w.word || '').toLowerCase().trim();
            if (this.userNames.includes(word)) {
                this.onNameMentioned(w.word);
                return w.word;
            }
        }
        return null;
    }

    _suggest(suggestion) {
        // Rate limit
        const now = Date.now();
        this._suggestionTimes = this._suggestionTimes.filter(t => now - t < 60000);
        if (this._suggestionTimes.length >= this.maxSuggestionsPerMinute) return;

        this._suggestionTimes.push(now);
        this.onSuggestion(suggestion);
    }

    destroy() {
        if (this._nameResponseTimeout) clearTimeout(this._nameResponseTimeout);
        if (this._meetingIdleTimeout) clearTimeout(this._meetingIdleTimeout);
    }
}
