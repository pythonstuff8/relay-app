/**
 * Tone Captioning
 * Enhances real-time captions with tone and emotion indicators
 * Integrates with existing caption system
 */

export class ToneCaptioning {
    constructor(captionRenderer) {
        this.captionRenderer = captionRenderer;
        this.toneIndicators = new Map();
        this.isActive = false;
        this.lastTone = null;

        // Tone patterns for detection
        this.tonePatterns = {
            excited: {
                keywords: ['wow', 'amazing', 'awesome', 'great', 'fantastic', 'incredible', 'yay', 'hurray'],
                punctuation: ['!!', '!!!'],
                volume: 'loud',
                indicator: '⚡',
                label: 'excited',
                color: '#ff9500'
            },
            question: {
                keywords: ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'can', 'could', 'would'],
                punctuation: ['?'],
                indicator: '❓',
                label: 'question',
                color: '#0071e3'
            },
            urgent: {
                keywords: ['urgent', 'emergency', 'hurry', 'quick', 'now', 'immediately', 'asap', 'alert'],
                punctuation: ['!!'],
                indicator: '⚠️',
                label: 'urgent',
                color: '#ff3b30'
            },
            happy: {
                keywords: ['happy', 'glad', 'pleased', 'delighted', 'joy', 'wonderful', 'love', 'like'],
                punctuation: ['!', ':)', ':-)'],
                indicator: '😊',
                label: 'happy',
                color: '#34c759'
            },
            sad: {
                keywords: ['sad', 'sorry', 'unfortunately', 'regret', 'disappointed', 'upset', 'miss'],
                punctuation: ['...', ':(', ':-('],
                indicator: '😔',
                label: 'sad',
                color: '#5856d6'
            },
            angry: {
                keywords: ['angry', 'mad', 'furious', 'annoyed', 'frustrated', 'hate', 'terrible', 'awful'],
                punctuation: ['!!!', '!!'],
                indicator: '😠',
                label: 'angry',
                color: '#ff3b30'
            },
            confused: {
                keywords: ['confused', 'unclear', 'what', 'huh', 'unsure', 'don\'t understand', 'lost'],
                punctuation: ['?', '??'],
                indicator: '🤔',
                label: 'confused',
                color: '#af52de'
            },
            warning: {
                keywords: ['warning', 'caution', 'careful', 'watch out', 'danger', 'stop', 'don\'t'],
                punctuation: ['!'],
                indicator: '⚠️',
                label: 'warning',
                color: '#ff9500'
            },
            whisper: {
                keywords: ['secret', 'quiet', 'whisper', 'private', 'confidential'],
                indicator: '🤫',
                label: 'whisper',
                color: '#8e8e93'
            },
            sarcasm: {
                keywords: ['yeah right', 'sure', 'obviously', 'clearly', 'totally'],
                indicator: '🙃',
                label: 'sarcastic',
                color: '#ff2d55'
            }
        };
    }

    /**
     * Analyze text for tone indicators
     * @param {string} text
     * @returns {object|null}
     */
    analyzeTone(text) {
        if (!text) return null;

        const lowerText = text.toLowerCase();
        const scores = {};

        // Score each tone pattern
        for (const [tone, pattern] of Object.entries(this.tonePatterns)) {
            let score = 0;

            // Check keywords
            if (pattern.keywords) {
                for (const keyword of pattern.keywords) {
                    if (lowerText.includes(keyword)) {
                        score += 2;
                    }
                }
            }

            // Check punctuation
            if (pattern.punctuation) {
                for (const punct of pattern.punctuation) {
                    if (text.includes(punct)) {
                        score += 1;
                    }
                }
            }

            // Check for ALL CAPS (shouting)
            if (tone === 'excited' || tone === 'angry') {
                const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
                if (capsRatio > 0.5) {
                    score += 2;
                }
            }

            // Check for repeated characters (elongation)
            if (/(.)\1{2,}/.test(text)) {
                score += 1;
            }

            scores[tone] = score;
        }

        // Find highest scoring tone
        let bestTone = null;
        let bestScore = 0;

        for (const [tone, score] of Object.entries(scores)) {
            if (score > bestScore && score >= 2) {
                bestScore = score;
                bestTone = tone;
            }
        }

        if (bestTone) {
            return {
                tone: bestTone,
                ...this.tonePatterns[bestTone],
                confidence: Math.min(bestScore / 5, 1)
            };
        }

        return null;
    }

    /**
     * Process caption with tone analysis
     * @param {object} captionData
     * @returns {object}
     */
    processCaption(captionData) {
        if (!captionData?.transcript) return captionData;

        const tone = this.analyzeTone(captionData.transcript);

        if (tone) {
            this.lastTone = tone;

            return {
                ...captionData,
                tone: tone.tone,
                toneIndicator: tone.indicator,
                toneLabel: tone.label,
                toneColor: tone.color
            };
        }

        return captionData;
    }

    /**
     * Create tone indicator element
     * @param {object} tone
     * @returns {HTMLElement}
     */
    createToneIndicator(tone) {
        const indicator = document.createElement('span');
        indicator.className = 'tone-indicator';
        indicator.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            background: ${tone.color}20;
            color: ${tone.color};
            margin-right: 6px;
            vertical-align: middle;
        `;
        indicator.innerHTML = `
            <span>${tone.indicator}</span>
            <span style="text-transform: lowercase;">[${tone.label}]</span>
        `;

        return indicator;
    }

    /**
     * Enhance caption element with tone
     * @param {HTMLElement} captionElement
     * @param {object} tone
     */
    enhanceCaptionElement(captionElement, tone) {
        if (!captionElement || !tone) return;

        // Add tone indicator at start
        const indicator = this.createToneIndicator(tone);
        captionElement.insertBefore(indicator, captionElement.firstChild);

        // Add subtle border color
        captionElement.style.borderLeft = `3px solid ${tone.color}`;
        captionElement.style.paddingLeft = '8px';

        // Add animation for urgent tones
        if (tone.tone === 'urgent' || tone.tone === 'warning') {
            captionElement.style.animation = 'tonePulse 2s ease-in-out infinite';
        }
    }

    /**
     * Start tone captioning
     */
    activate() {
        if (this.isActive) return;
        this.isActive = true;

        // Add CSS animation
        if (!document.getElementById('tone-caption-styles')) {
            const style = document.createElement('style');
            style.id = 'tone-caption-styles';
            style.textContent = `
                @keyframes tonePulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
                .tone-indicator {
                    animation: toneIn 0.3s ease-out;
                }
                @keyframes toneIn {
                    from { opacity: 0; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1); }
                }
            `;
            document.head.appendChild(style);
        }

        // Intercept caption updates
        this.interceptCaptions();
    }

    /**
     * Stop tone captioning
     */
    deactivate() {
        this.isActive = false;
    }

    /**
     * Intercept caption updates to add tone
     */
    interceptCaptions() {
        // Listen for caption events
        window.addEventListener('caption-received', (e) => {
            if (!this.isActive) return;

            const tone = this.analyzeTone(e.detail?.text);
            if (tone) {
                e.detail.tone = tone;
            }
        });
    }

    /**
     * Get tone summary for a transcript
     * @param {string} transcript
     * @returns {object}
     */
    getToneSummary(transcript) {
        const tone = this.analyzeTone(transcript);

        if (tone) {
            return {
                hasTone: true,
                tone: tone.tone,
                indicator: tone.indicator,
                label: tone.label,
                description: `Tone detected: ${tone.label}`
            };
        }

        return {
            hasTone: false,
            tone: null,
            description: 'Neutral tone'
        };
    }

    /**
     * Speak tone description (for blind users)
     * @param {string} transcript
     * @returns {string}
     */
    getToneDescription(transcript) {
        const summary = this.getToneSummary(transcript);

        if (summary.hasTone) {
            return `Spoken with ${summary.label} tone`;
        }

        return '';
    }
}

export default ToneCaptioning;
