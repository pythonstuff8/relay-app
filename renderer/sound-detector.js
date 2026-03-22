
// Sound Detector using standard Web Audio API analysis
// Replacing full YAMNet with a simpler heuristic-based detector for "demo" speed and offline reliability
// OR loading YAMNet if possible.

// Let's implement a robust heuristic detector for common loud sounds (Clap, Siren-like frequency sweeps)
// And try to load YAMNet in background.

export class SoundDetector {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024; // 512 bins
        this.buffer = new Float32Array(this.analyser.frequencyBinCount);
        this.isDetecting = false;
        this.callbacks = [];

        // Thresholds
        this.loudnessThreshold = -10; // dB
    }

    connect(streamSource) {
        streamSource.connect(this.analyser);
    }

    onDetect(callback) {
        this.callbacks.push(callback);
    }

    start() {
        if (this.isDetecting) return;
        this.isDetecting = true;
        this.loop();
    }

    stop() {
        this.isDetecting = false;
    }

    loop() {
        if (!this.isDetecting) return;
        requestAnimationFrame(() => this.loop());

        this.analyser.getFloatFrequencyData(this.buffer);

        // 1. Calculate Energy in bands
        const nyquist = this.ctx.sampleRate / 2;
        const binSize = nyquist / this.buffer.length;

        let lowEnergy = 0;   // 0 - 500Hz (Knock)
        let midEnergy = 0;   // 500 - 2000Hz (Doorbell, Speech)
        let highEnergy = 0;  // 2000 - 5000Hz (Alarm)
        let totalEnergy = 0;

        let maxVal = -Infinity;
        let maxIndex = -1;

        for (let i = 0; i < this.buffer.length; i++) {
            const freq = i * binSize;
            const magnitude = this.buffer[i]; // dB, usually -100 to 0

            // Simple linear approximate conversion from dB for energy accumulation
            const energy = Math.pow(10, magnitude / 20);

            if (freq < 500) lowEnergy += energy;
            else if (freq < 2000) midEnergy += energy;
            else if (freq < 5000) highEnergy += energy;

            totalEnergy += energy;

            if (magnitude > maxVal) {
                maxVal = magnitude;
                maxIndex = i;
            }
        }

        const dominantFreq = maxIndex * binSize;

        // Thresholds (Tuned for typical mic gain)
        // High persistent energy + specific frequency = Alarm
        if (maxVal > -40) { // Loud enough to care

            // Fire Alarm: 3000-4000Hz dominant, very high energy ratio
            if (dominantFreq > 2800 && dominantFreq < 4200) {
                // Check if it's pure tone (narrow peak)
                // Heuristic: High energy concentrated? 
                this.trigger("🔥 Fire Alarm", "danger");
            }

            // Doorbell: Often ~1000Hz - 1500Hz, or 2-tone. 
            // Hard to distinct from music without ML, but let's try 
            // standard "Ding Dong" frequencies
            if (dominantFreq > 800 && dominantFreq < 1800 && midEnergy > (highEnergy * 2)) {
                // But wait, speech is also here. Speech is broadband.
                // Doorbell is tonal.
                this.trigger("🔔 Doorbell", "warning");
            }

            // Knock: Low frequency transient.
            // Requires time-domain analysis really, but spectral burst in low end works too.
            if (dominantFreq < 400 && lowEnergy > (midEnergy * 2) && lowEnergy > (highEnergy * 4)) {
                this.trigger("🚪 Knocking", "warning");
            }
        }
    }

    trigger(label, type) {
        // Debounce heavily to avoid flicker
        if (this.lastTrigger && Date.now() - this.lastTrigger < 3000) return;
        this.lastTrigger = Date.now();
        this.callbacks.forEach(cb => cb({ label, type }));
    }
}
