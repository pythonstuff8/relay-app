// Relay YAMNet Sound Detector
// Heuristic sound classification with temporal validation
// Requires sounds to persist across multiple frames to reduce false alarms

// Category mapping from AudioSet labels to Relay categories
const CATEGORY_MAP = {
    emergency: [
        'Smoke detector', 'Fire alarm', 'Siren', 'Civil defense siren',
        'Alarm', 'Alarm clock', 'Buzzer', 'Emergency vehicle',
        'Fire engine', 'Ambulance', 'Police car',
    ],
    attention: [
        'Doorbell', 'Ding-dong', 'Ding', 'Knock', 'Door',
        'Telephone bell ringing', 'Ringtone', 'Telephone',
        'Bell', 'Church bell', 'Chime', 'Wind chime',
    ],
    communication: [
        'Speech', 'Conversation', 'Narration', 'Whispering',
        'Shout', 'Yell', 'Laughter', 'Baby cry', 'Crying',
        'Screaming', 'Child speech',
    ],
    appliance: [
        'Microwave oven', 'Blender', 'Washing machine',
        'Vacuum cleaner', 'Hair dryer', 'Toothbrush',
        'Frying', 'Boiling', 'Dishes',
    ],
    environmental: [
        'Dog', 'Cat', 'Bird', 'Rain', 'Thunder', 'Wind',
        'Water', 'Engine', 'Car', 'Truck', 'Motorcycle',
        'Train', 'Aircraft', 'Helicopter', 'Honking',
        'Car horn', 'Bark', 'Meow',
    ],
    media: [
        'Music', 'Singing', 'Musical instrument', 'Guitar',
        'Piano', 'Drum', 'Applause', 'Cheering',
        'Television', 'Radio', 'Video game',
    ],
};

// Build reverse map for quick lookup
const LABEL_TO_CATEGORY = {};
for (const [category, labels] of Object.entries(CATEGORY_MAP)) {
    for (const label of labels) {
        LABEL_TO_CATEGORY[label.toLowerCase()] = category;
    }
}

export class YAMNetDetector {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.callbacks = [];
        this.isDetecting = false;
        this.lastTrigger = {};
        this.debounceMs = 5000;

        // Heuristic buffers
        this.buffer = new Float32Array(this.analyser.frequencyBinCount);

        // Temporal validation: track candidate detections across frames.
        // A sound must be detected consistently over several frames before
        // we emit an alert. This prevents single-frame noise from triggering.
        this.candidates = {};
        // Minimum consecutive frames a detection must appear in before triggering.
        // At ~60fps this equals roughly 200ms.
        this.requiredFrames = 12;
        // Frames allowed to be missed within a window before the candidate resets.
        this.maxGapFrames = 6;
        // Minimum confidence average across accumulated frames to trigger.
        this.minConfidenceToTrigger = 0.40;
    }

    connect(streamSource) {
        streamSource.connect(this.analyser);
        this.start();
    }

    onDetect(callback) {
        this.callbacks.push(callback);
    }

    start() {
        if (this.isDetecting) return;
        this.isDetecting = true;
        this._loop();
    }

    stop() {
        this.isDetecting = false;
    }

    _loop() {
        if (!this.isDetecting) return;
        requestAnimationFrame(() => this._loop());
        this._heuristicDetect();
    }

    _heuristicDetect() {
        this.analyser.getFloatFrequencyData(this.buffer);

        const nyquist = this.ctx.sampleRate / 2;
        const binSize = nyquist / this.buffer.length;

        let lowEnergy = 0;    // 0-500Hz
        let midEnergy = 0;    // 500-2000Hz
        let highEnergy = 0;   // 2000-5000Hz
        let vhighEnergy = 0;  // 5000Hz+
        let totalEnergy = 0;

        let maxVal = -Infinity;
        let maxIndex = -1;

        for (let i = 0; i < this.buffer.length; i++) {
            const freq = i * binSize;
            const magnitude = this.buffer[i];
            const energy = Math.pow(10, magnitude / 20);

            if (freq < 500) lowEnergy += energy;
            else if (freq < 2000) midEnergy += energy;
            else if (freq < 5000) highEnergy += energy;
            else vhighEnergy += energy;

            totalEnergy += energy;

            if (magnitude > maxVal) {
                maxVal = magnitude;
                maxIndex = i;
            }
        }

        const dominantFreq = maxIndex * binSize;

        // Silence gate — ignore quiet ambient noise
        if (maxVal < -38) return;

        // Collect which categories matched this frame
        const frameDetections = {};

        // ── Fire Alarm / Siren ──
        // 2800-4200 Hz range. Requires high-band purity.
        if (dominantFreq > 2800 && dominantFreq < 4200 && highEnergy > (midEnergy * 2)) {
            const purity = highEnergy / (totalEnergy || 1);
            if (purity > 0.35 && maxVal > -25) {
                frameDetections.emergency = {
                    label: 'Fire Alarm / Siren',
                    className: 'Smoke detector or fire alarm',
                    category: 'emergency',
                    confidence: Math.min(0.9, purity * 1.5),
                };
            }
        }

        // ── Doorbell / Chime ──
        // 800-1800 Hz tonal. Requires mid band dominance over other bands.
        if (dominantFreq > 800 && dominantFreq < 1800
            && midEnergy > (highEnergy * 2)
            && midEnergy > (lowEnergy * 2)
            && maxVal > -25) {
            const purity = midEnergy / (totalEnergy || 1);
            if (purity > 0.35) {
                frameDetections.attention = {
                    label: 'Doorbell',
                    className: 'Doorbell or chime',
                    category: 'attention',
                    confidence: Math.min(0.8, purity * 1.5),
                };
            }
        }

        // ── Knock ──
        // Transient low-frequency impact. Knocks are short so we use fewer
        // required frames for temporal validation.
        if (!frameDetections.attention
            && dominantFreq < 350
            && lowEnergy > (midEnergy * 3)
            && lowEnergy > (highEnergy * 4)
            && maxVal > -20) {
            frameDetections.attention = {
                label: 'Knocking',
                className: 'Knock or impact',
                category: 'attention',
                confidence: 0.55,
                _knockTransient: true,
            };
        }

        // ── Baby Cry ──
        // 300-650 Hz fundamental with harmonics in high band.
        // Excludes if high energy dominates (speech sibilance).
        if (dominantFreq > 300 && dominantFreq < 650
            && midEnergy > lowEnergy
            && highEnergy > lowEnergy * 0.3
            && highEnergy < midEnergy * 1.5
            && maxVal > -25) {
            const ratio = midEnergy / (lowEnergy || 1);
            if (ratio > 1.8 && ratio < 5) {
                frameDetections.communication = {
                    label: 'Baby Crying',
                    className: 'Baby cry or infant',
                    category: 'communication',
                    confidence: 0.5,
                };
            }
        }

        // ── Dog Bark ──
        // 250-900 Hz dominant, strong low+mid burst.
        if (dominantFreq > 250 && dominantFreq < 900 && maxVal > -20) {
            const burstRatio = (lowEnergy + midEnergy) / (totalEnergy || 1);
            if (burstRatio > 0.7 && highEnergy < midEnergy * 0.4) {
                frameDetections.environmental = {
                    label: 'Dog Barking',
                    className: 'Dog bark',
                    category: 'environmental',
                    confidence: 0.45,
                };
            }
        }

        // ── Music ──
        // Requires even energy spread across all bands and reasonable volume.
        if (totalEnergy > 0.8 && maxVal > -25) {
            const minBand = Math.min(lowEnergy, midEnergy, highEnergy);
            const maxBand = Math.max(lowEnergy, midEnergy, highEnergy);
            const spread = minBand / (maxBand || 1);
            if (spread > 0.25) {
                frameDetections.media = {
                    label: 'Music',
                    className: 'Music playing',
                    category: 'media',
                    confidence: Math.min(0.7, spread * 1.5),
                    isMusic: true,
                };
            }
        }

        // ── Temporal validation ──
        // For each category: accumulate evidence across frames. Only fire
        // when enough consecutive frames agree on the same detection.
        const now = Date.now();

        for (const [cat, detection] of Object.entries(frameDetections)) {
            if (!this.candidates[cat]) {
                this.candidates[cat] = { count: 0, totalConf: 0, gapFrames: 0, detection };
            }
            const c = this.candidates[cat];
            c.count++;
            c.totalConf += detection.confidence;
            c.gapFrames = 0;
            c.detection = detection;

            // Knocks are transient — require fewer frames (~100ms)
            const needed = detection._knockTransient ? 6 : this.requiredFrames;
            const avgConf = c.totalConf / c.count;

            if (c.count >= needed && avgConf >= this.minConfidenceToTrigger) {
                const event = { ...detection, confidence: avgConf };
                delete event._knockTransient;
                this._trigger(event);
                // Reset candidate after trigger
                delete this.candidates[cat];
            }
        }

        // Age out candidates that weren't seen this frame
        for (const cat of Object.keys(this.candidates)) {
            if (!frameDetections[cat]) {
                this.candidates[cat].gapFrames++;
                if (this.candidates[cat].gapFrames > this.maxGapFrames) {
                    delete this.candidates[cat];
                }
            }
        }
    }

    _trigger(event) {
        const key = event.category;
        const now = Date.now();

        // Per-category debounce
        if (this.lastTrigger[key] && now - this.lastTrigger[key] < this.debounceMs) return;
        this.lastTrigger[key] = now;

        event.timestamp = now;
        this.callbacks.forEach(cb => cb(event));
    }
}
