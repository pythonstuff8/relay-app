/**
 * Sound Feedback System
 * Provides audio cues for UI interactions
 * Integrates with BlindMode and works across all modes
 */

export class SoundFeedback {
    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.volume = options.volume || 0.3;
        this.audioContext = null;
        this.sounds = new Map();
        this.isInitialized = false;

        this.soundPresets = {
            // Success sounds
            'success': { type: 'sine', freq: 880, duration: 0.15, fade: true },
            'success-long': { type: 'sine', freq: [523, 659, 880], duration: 0.4, fade: true },

            // Error sounds
            'error': { type: 'sawtooth', freq: 220, duration: 0.3, fade: true },
            'error-soft': { type: 'sine', freq: 330, duration: 0.2, fade: true },

            // Interaction sounds
            'click': { type: 'sine', freq: 1200, duration: 0.05, fade: true },
            'hover': { type: 'sine', freq: 600, duration: 0.08, fade: true },
            'focus': { type: 'sine', freq: 800, duration: 0.1, fade: true },

            // Navigation sounds
            'navigate': { type: 'sine', freq: 440, duration: 0.1, fade: true },
            'back': { type: 'sine', freq: 350, duration: 0.1, fade: true },

            // State change sounds
            'toggle-on': { type: 'sine', freq: 880, duration: 0.1, fade: true },
            'toggle-off': { type: 'sine', freq: 440, duration: 0.1, fade: true },

            // Alert sounds
            'alert': { type: 'sine', freq: 880, duration: 0.3, fade: true },
            'alert-urgent': { type: 'sawtooth', freq: 440, duration: 0.5, fade: true },

            // Processing sounds
            'processing': { type: 'sine', freq: 660, duration: 0.3, fade: true },
            'complete': { type: 'sine', freq: [440, 554, 659], duration: 0.4, fade: true },

            // Caption-specific
            'caption-new': { type: 'sine', freq: 523, duration: 0.08, fade: true },
            'caption-update': { type: 'sine', freq: 440, duration: 0.05, fade: true },

            // Mode sounds
            'mode-deaf': { type: 'sine', freq: [440, 554], duration: 0.3, fade: true },
            'mode-blind': { type: 'sine', freq: [440, 330], duration: 0.3, fade: true }
        };

        this.init();
    }

    init() {
        if (this.isInitialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.setupGlobalListeners();
            this.isInitialized = true;
        } catch (error) {
            console.warn('[SoundFeedback] Audio context not available:', error);
        }
    }

    /**
     * Setup global event listeners for automatic sound feedback
     */
    setupGlobalListeners() {
        // Click sounds
        document.addEventListener('click', (e) => {
            if (this.enabled) {
                const target = e.target;
                if (target.matches('button, [role="button"], a, input[type="submit"]')) {
                    this.play('click');
                } else if (target.matches('input[type="checkbox"], input[type="radio"]')) {
                    this.play(target.checked ? 'toggle-on' : 'toggle-off');
                }
            }
        }, true);

        // Focus sounds
        document.addEventListener('focus', (e) => {
            if (this.enabled && e.target.matches('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')) {
                this.play('focus');
            }
        }, true);

        // Hover sounds (throttled)
        let lastHoverTime = 0;
        document.addEventListener('mouseover', (e) => {
            if (!this.enabled) return;
            const now = Date.now();
            if (now - lastHoverTime > 100) {
                lastHoverTime = now;
                if (e.target.matches('button, a, [role="button"], [role="link"]')) {
                    this.play('hover');
                }
            }
        }, true);
    }

    /**
     * Play a sound by name
     * @param {string} soundName
     * @param {object} options
     */
    play(soundName, options = {}) {
        if (!this.enabled || !this.audioContext) return;

        const preset = this.soundPresets[soundName];
        if (!preset) {
            console.warn(`[SoundFeedback] Unknown sound: ${soundName}`);
            return;
        }

        try {
            const frequencies = Array.isArray(preset.freq) ? preset.freq : [preset.freq];
            const duration = options.duration || preset.duration;
            const volume = options.volume || this.volume;

            frequencies.forEach((freq, index) => {
                setTimeout(() => {
                    this.createTone({
                        frequency: freq,
                        type: preset.type,
                        duration: duration,
                        volume: volume,
                        fade: preset.fade
                    });
                }, index * 50);
            });
        } catch (error) {
            console.error('[SoundFeedback] Error playing sound:', error);
        }
    }

    /**
     * Create a tone with given parameters
     * @param {object} params
     */
    createTone({ frequency, type = 'sine', duration, volume, fade = true }) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = type;
        oscillator.frequency.value = frequency;

        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);

        if (fade) {
            gainNode.gain.exponentialRampToValueAtTime(
                0.001,
                this.audioContext.currentTime + duration
            );
        }

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    /**
     * Play spatial sound (for directional feedback)
     * @param {string} soundName
     * @param {number} pan -1 to 1 (left to right)
     * @param {number} distance 0 to 1 (near to far)
     */
    playSpatial(soundName, pan = 0, distance = 0) {
        if (!this.enabled || !this.audioContext) return;

        const preset = this.soundPresets[soundName];
        if (!preset) return;

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            const panner = this.audioContext.createStereoPanner?.();

            oscillator.type = preset.type;
            oscillator.frequency.value = Array.isArray(preset.freq)
                ? preset.freq[0]
                : preset.freq;

            // Apply distance attenuation
            const attenuatedVolume = this.volume * (1 - (distance * 0.5));
            gainNode.gain.setValueAtTime(attenuatedVolume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
                0.001,
                this.audioContext.currentTime + preset.duration
            );

            // Connect with or without panner
            if (panner) {
                panner.pan.value = pan;
                oscillator.connect(panner);
                panner.connect(gainNode);
            } else {
                oscillator.connect(gainNode);
            }

            gainNode.connect(this.audioContext.destination);

            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + preset.duration);
        } catch (error) {
            console.error('[SoundFeedback] Spatial sound error:', error);
        }
    }

    /**
     * Enable/disable sound feedback
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (enabled && this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    /**
     * Set volume level
     * @param {number} volume 0 to 1
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Resume audio context (needed after user interaction)
     */
    resume() {
        if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    /**
     * Play success sound
     */
    success() {
        this.play('success');
    }

    /**
     * Play error sound
     */
    error() {
        this.play('error');
    }

    /**
     * Play processing sound
     */
    processing() {
        this.play('processing');
    }

    /**
     * Play complete sound
     */
    complete() {
        this.play('complete');
    }
}

export default SoundFeedback;
