// Relay Caption Renderer
// Word-level rendering with speaker colors, confidence, filler words, keyword highlighting

const SPEAKER_COLORS = [
    '#4A90D9', // Blue
    '#50C878', // Green
    '#FFB347', // Orange
    '#DDA0DD', // Plum
    '#87CEEB', // Sky
    '#F0E68C', // Khaki
    '#E0B0FF', // Mauve
    '#98D8C8', // Seafoam
];

const FILLER_WORDS = new Set([
    'um', 'uh', 'uh-huh', 'uhh', 'umm', 'hmm', 'hm',
    'like', 'you know', 'so', 'actually', 'basically',
    'literally', 'right', 'i mean',
]);

const SPEAKER_NAMES = {};
let speakerCounter = 0;

function getSpeakerName(speakerId) {
    if (speakerId === undefined || speakerId === null) return null;
    if (!SPEAKER_NAMES[speakerId]) {
        speakerCounter++;
        SPEAKER_NAMES[speakerId] = `Speaker ${speakerCounter}`;
    }
    return SPEAKER_NAMES[speakerId];
}

function getSpeakerColor(speakerId) {
    if (speakerId === undefined || speakerId === null) return SPEAKER_COLORS[0];
    return SPEAKER_COLORS[speakerId % SPEAKER_COLORS.length];
}

export class CaptionRenderer {
    constructor(container, settings = {}) {
        this.container = container;
        this.settings = {
            captionFontSize: 24,
            captionFontWeight: 'medium',
            captionMaxLines: 3,
            showSpeakerNames: true,
            showConfidenceShading: true,
            showFillerWords: true,
            fillerWordOpacity: 50,
            customKeywords: [],
            showTimestamps: false,
            ...settings,
        };
        this.finalSegments = [];
        this.interimText = '';
        this.interimWords = [];
        this.maxSegments = 20;

        this.container.style.fontSize = `${this.settings.captionFontSize}px`;
        this.container.style.fontWeight = this.settings.captionFontWeight === 'bold' ? '700' :
            this.settings.captionFontWeight === 'medium' ? '500' : '400';
    }

    updateSettings(settings) {
        Object.assign(this.settings, settings);
        this.container.style.fontSize = `${this.settings.captionFontSize}px`;
        this.render();
    }

    addFinalSegment(result) {
        this.finalSegments.push({
            text: result.transcript,
            words: result.words || [],
            speaker: result.words?.[0]?.speaker ?? null,
            confidence: result.confidence || 0,
            timestamp: Date.now(),
        });

        // Limit stored segments
        if (this.finalSegments.length > this.maxSegments) {
            this.finalSegments.shift();
        }

        this.interimText = '';
        this.interimWords = [];
        this.render();

        // Dispatch event for combined mode
        window.dispatchEvent(new CustomEvent('caption-received', {
            detail: {
                text: result.transcript,
                speaker: result.words?.[0]?.speaker ?? null,
                timestamp: Date.now()
            }
        }));
    }

    setInterim(result) {
        this.interimText = result.transcript;
        this.interimWords = result.words || [];
        this.render();
    }

    clear() {
        this.finalSegments = [];
        this.interimText = '';
        this.interimWords = [];
        this.render();
    }

    getTranscripts() {
        return this.finalSegments.slice();
    }

    render() {
        const frag = document.createDocumentFragment();

        // Determine how many final segments to show based on max lines
        const maxLines = this.settings.captionMaxLines || 3;
        const visibleSegments = this.finalSegments.slice(-maxLines);

        visibleSegments.forEach((segment, idx) => {
            const segDiv = document.createElement('div');
            segDiv.className = 'caption-segment';

            // Opacity: older segments fade
            const opacity = 0.5 + (idx / visibleSegments.length) * 0.5;
            segDiv.style.opacity = opacity;
            segDiv.style.marginBottom = '2px';

            // Speaker label
            if (this.settings.showSpeakerNames && segment.speaker !== null) {
                const label = document.createElement('span');
                label.className = 'speaker-label';
                const color = getSpeakerColor(segment.speaker);
                label.style.color = color;
                label.style.fontWeight = '600';
                label.style.marginRight = '8px';

                // Colored dot
                const dot = document.createElement('span');
                dot.className = 'speaker-dot';
                dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px;vertical-align:middle;`;
                label.appendChild(dot);
                label.appendChild(document.createTextNode(getSpeakerName(segment.speaker)));
                segDiv.appendChild(label);
            }

            // Timestamp
            if (this.settings.showTimestamps) {
                const ts = document.createElement('span');
                ts.className = 'caption-timestamp';
                const d = new Date(segment.timestamp);
                ts.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                ts.style.cssText = 'font-size:0.7em;opacity:0.5;margin-right:8px;';
                segDiv.appendChild(ts);
            }

            // Words with enrichment
            if (segment.words && segment.words.length > 0) {
                segment.words.forEach(w => {
                    const span = this._renderWord(w, segment.speaker);
                    segDiv.appendChild(span);
                });
            } else {
                const textSpan = document.createElement('span');
                textSpan.textContent = segment.text;
                if (segment.speaker !== null) {
                    textSpan.style.color = getSpeakerColor(segment.speaker);
                }
                segDiv.appendChild(textSpan);
            }

            frag.appendChild(segDiv);
        });

        // Interim text
        if (this.interimText) {
            const interimDiv = document.createElement('div');
            interimDiv.className = 'caption-interim';
            interimDiv.style.cssText = 'opacity:0.5;font-style:italic;color:var(--color-accent);';

            if (this.interimWords && this.interimWords.length > 0) {
                this.interimWords.forEach(w => {
                    const span = this._renderWord(w, w.speaker, true);
                    interimDiv.appendChild(span);
                });
            } else {
                interimDiv.textContent = this.interimText;
            }
            frag.appendChild(interimDiv);
        }

        // Replace content
        this.container.innerHTML = '';
        if (frag.childNodes.length > 0) {
            this.container.appendChild(frag);
        } else {
            this.container.innerHTML = '<span style="opacity:0.5;">Waiting for speech...</span>';
        }

        // Auto-scroll
        this.container.scrollTop = this.container.scrollHeight;
    }

    _renderWord(wordData, segmentSpeaker, isInterim = false) {
        const span = document.createElement('span');
        span.className = 'caption-word';
        const displayText = wordData.punctuated_word || wordData.word;

        // Speaker color
        const speaker = wordData.speaker ?? segmentSpeaker;
        if (speaker !== null && speaker !== undefined) {
            span.style.color = getSpeakerColor(speaker);
        }

        // Confidence shading
        if (this.settings.showConfidenceShading && wordData.confidence !== undefined) {
            if (wordData.confidence < 0.7) {
                span.style.fontStyle = 'italic';
                span.style.opacity = (0.5 + wordData.confidence * 0.5).toFixed(2);
            }
        }

        // Filler word dimming
        const wordLower = (wordData.word || '').toLowerCase().trim();
        if (FILLER_WORDS.has(wordLower)) {
            if (!this.settings.showFillerWords) {
                // Hidden entirely
                span.style.display = 'none';
                span.textContent = displayText + ' ';
                return span;
            }
            span.style.opacity = (this.settings.fillerWordOpacity / 100).toFixed(2);
        }

        // Keyword highlighting
        if (this.settings.customKeywords && this.settings.customKeywords.length > 0) {
            const keywords = this.settings.customKeywords.map(k => k.toLowerCase());
            if (keywords.includes(wordLower)) {
                span.style.fontWeight = 'bold';
                span.style.textDecoration = 'underline';
                span.style.textDecorationColor = 'var(--color-accent)';
            }
        }

        // Name detection highlighting
        if (this._nameWords && this._nameWords.has(wordLower)) {
            span.style.fontWeight = 'bold';
            span.style.background = 'rgba(255, 159, 10, 0.3)';
            span.style.borderRadius = '3px';
            span.style.padding = '0 2px';
        }

        // Interim styling
        if (isInterim) {
            span.style.opacity = '0.5';
            span.style.fontStyle = 'italic';
        }

        span.textContent = displayText + ' ';
        return span;
    }

    setNameWords(names) {
        this._nameWords = new Set((names || []).map(n => n.toLowerCase().trim()));
    }

    checkNameMention(words) {
        if (!this._nameWords || this._nameWords.size === 0) return null;
        for (const w of words) {
            const word = (w.word || '').toLowerCase().trim();
            if (this._nameWords.has(word)) {
                return w.word;
            }
        }
        return null;
    }

    increaseFontSize(delta = 2) {
        this.settings.captionFontSize = Math.min(48, this.settings.captionFontSize + delta);
        this.container.style.fontSize = `${this.settings.captionFontSize}px`;
        return this.settings.captionFontSize;
    }

    decreaseFontSize(delta = 2) {
        this.settings.captionFontSize = Math.max(14, this.settings.captionFontSize - delta);
        this.container.style.fontSize = `${this.settings.captionFontSize}px`;
        return this.settings.captionFontSize;
    }
}

export { SPEAKER_COLORS, getSpeakerColor, getSpeakerName };
