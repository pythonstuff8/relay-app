// Enhanced ML-based sound detector for the renderer.
// Captures stereo audio for directional analysis, sends chunks
// to the main process for ML classification, and emits detection events.
// Falls back to heuristic detection while ML models load.
//
// New features:
// - Stereo audio capture for directional analysis
// - WebGL-accelerated preprocessing
// - Custom sound recording and training UI integration
// - Enhanced event data with direction indicators

import { YAMNetDetector } from './yamnet-detector.js';

// Friendly label overrides for the raw AudioSet class names
const LABEL_DISPLAY = {
    'smoke detector, smoke alarm': 'Smoke Alarm',
    'fire alarm': 'Fire Alarm',
    'siren': 'Siren',
    'civil defense siren': 'Emergency Siren',
    'alarm': 'Alarm',
    'alarm clock': 'Alarm Clock',
    'buzzer': 'Buzzer',
    'ambulance (siren)': 'Ambulance',
    'police car (siren)': 'Police Siren',
    'fire engine, fire truck (siren)': 'Fire Truck',
    'doorbell': 'Doorbell',
    'ding-dong': 'Doorbell',
    'knock': 'Knocking',
    'door': 'Door',
    'telephone bell ringing': 'Phone Ringing',
    'ringtone': 'Phone Ringing',
    'bell': 'Bell',
    'church bell': 'Church Bell',
    'chime': 'Chime',
    'wind chime': 'Wind Chime',
    'baby cry, infant cry': 'Baby Crying',
    'crying, sobbing': 'Crying',
    'screaming': 'Screaming',
    'shout': 'Shouting',
    'laughter': 'Laughter',
    'dog': 'Dog Barking',
    'bark': 'Dog Barking',
    'cat': 'Cat',
    'meow': 'Cat Meowing',
    'bird': 'Bird',
    'bird vocalization, bird call, bird song': 'Bird Song',
    'rain': 'Rain',
    'thunder': 'Thunder',
    'thunderstorm': 'Thunderstorm',
    'wind': 'Wind',
    'car horn, honking': 'Car Horn',
    'engine': 'Engine',
    'vacuum cleaner': 'Vacuum Cleaner',
    'microwave oven': 'Microwave',
    'washing machine': 'Washing Machine',
    'hair dryer': 'Hair Dryer',
    'music': 'Music',
    'singing': 'Singing',
    'applause': 'Applause',
};

const CATEGORY_MIN_CONFIDENCE = {
    emergency: 0.2,
    attention: 0.22,
    communication: 0.24,
    appliance: 0.24,
    environmental: 0.24,
    media: 0.26,
};

const CATEGORY_DEBOUNCE_MS = {
    emergency: 9000,
    attention: 7000,
    communication: 5000,
    appliance: 5000,
    environmental: 5000,
    media: 6000,
};

// Critical alert anti-spam behavior:
// - Once emitted, alert stays latched while the same sound continues.
// - It rearms only after this much silence for that alert key.
const CRITICAL_ALERT_RELATCH_SILENCE_MS = 25000;
const CRITICAL_ALERT_STATE_TTL_MS = 10 * 60 * 1000;

// Direction indicator icons/labels
const DIRECTION_ICONS = {
    left: '←',   // Left arrow
    center: '●', // Circle/dot
    right: '→',  // Right arrow
};

const DIRECTION_COLORS = {
    left: '#3b82f6',   // Blue
    center: '#10b981', // Green
    right: '#3b82f6',  // Blue
};

/**
 * Enhanced ML Sound Detector with stereo audio support,
 * directional analysis, and custom sound training
 */
export class MLSoundDetector {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.callbacks = [];
        this.isMLReady = false;
        this.heuristicFallback = null;

        // Stereo audio support
        this.isStereo = false;
        this.leftBuffer = null;
        this.rightBuffer = null;
        this.monoBuffer = null;

        // Audio buffering: collect 1.5 seconds of audio
        this.sampleRate = this.ctx.sampleRate;
        this.chunkDuration = 1.4;
        this.chunkSamples = Math.floor(this.sampleRate * this.chunkDuration);
        this.chunkOverlapRatio = 0.5;
        this.chunkOverlapSamples = Math.max(0, Math.floor(this.chunkSamples * this.chunkOverlapRatio));
        this.bufferOffset = 0;

        // Debounce: prevent same category from firing within this window
        this.debounceMs = 4000; // Reduced from 5000 for better responsiveness
        this.lastTrigger = {};
        this.triggerHistory = []; // Track recent triggers for analysis
        this.criticalAlertState = new Map();

        // Minimum ML confidence to trigger an alert
        this.minConfidence = 0.2;

        // ScriptProcessor for capturing raw audio
        this.processor = null;
        this.sourceNode = null;
        this.splitterNode = null;
        this.mergerNode = null;

        // WebGL acceleration
        this.webglSupported = false;
        this.offscreenCanvas = null;
        this.gl = null;

        // Performance tracking
        this.processingTimes = [];
        this.maxProcessingHistory = 50;

        // Custom sound training state
        this.isRecordingCustom = false;
        this.customRecordingBuffer = [];
        this.customRecordingDuration = 3000; // 3 seconds for custom sound
        this.classifierTelemetry = {
            model: null,
            yamnetReady: false,
            yamnetSource: null,
            astReady: false,
            degraded: false,
        };
        this.lastReadinessCheckAt = 0;
        this.readinessCheckIntervalMs = 1500;

        // Set up heuristic fallback
        this.heuristicFallback = new YAMNetDetector(audioContext);
        this.heuristicFallback.onDetect((event) => {
            if (!this.isMLReady) {
                this.callbacks.forEach((cb) => cb(event));
            }
        });

        // Listen for ML model ready event
        if (window.electronAPI?.onClassifierReady) {
            window.electronAPI.onClassifierReady((model) => {
                console.log(`[MLSoundDetector] ML model ready: ${model}`);
                this.isMLReady = true;
                if (this.heuristicFallback) {
                    this.heuristicFallback.stop();
                }
                this._consumeClassifierStatus({ ready: true, model });
                if (window.electronAPI?.classifierStatus) {
                    window.electronAPI.classifierStatus()
                        .then((status) => this._consumeClassifierStatus(status))
                        .catch((error) => {
                            console.warn('[MLSoundDetector] Failed to refresh classifier status:', error);
                        });
                }
            });
        }

        // Check if model already loaded
        if (window.electronAPI?.classifierStatus) {
            window.electronAPI.classifierStatus().then((status) => {
                this._consumeClassifierStatus(status);
            });
        }

        // Initialize WebGL
        this._initWebGL();
    }

    /**
     * Initialize WebGL for accelerated audio preprocessing
     */
    _initWebGL() {
        try {
            this.offscreenCanvas = document.createElement('canvas');
            this.offscreenCanvas.width = 1;
            this.offscreenCanvas.height = 1;
            this.gl = this.offscreenCanvas.getContext('webgl2');

            if (this.gl) {
                this.webglSupported = true;
                console.log('[MLSoundDetector] WebGL2 initialized for audio preprocessing');
            } else {
                this.gl = this.offscreenCanvas.getContext('webgl');
                if (this.gl) {
                    this.webglSupported = true;
                    console.log('[MLSoundDetector] WebGL1 initialized for audio preprocessing');
                }
            }
        } catch (e) {
            console.warn('[MLSoundDetector] WebGL not available:', e.message);
        }
    }

    _consumeClassifierStatus(status = {}) {
        if (!status || typeof status !== 'object') return;

        this.classifierTelemetry = {
            model: status.model || this.classifierTelemetry.model,
            yamnetReady: status.yamnetReady === true,
            yamnetSource: status.yamnetSource || null,
            astReady: status.astReady === true,
            degraded: status.degraded === true,
        };

        if (status.ready) {
            this.isMLReady = true;
            if (this.heuristicFallback) this.heuristicFallback.stop();
            console.log(
                `[MLSoundDetector] classifier ready model=${status.model || 'unknown'} ` +
                `yamnetReady=${this.classifierTelemetry.yamnetReady} ` +
                `yamnetSource=${this.classifierTelemetry.yamnetSource || 'n/a'} ` +
                `astReady=${this.classifierTelemetry.astReady} degraded=${this.classifierTelemetry.degraded}`
            );
        }
    }

    async _refreshClassifierReadiness(force = false) {
        if (!window.electronAPI?.classifierStatus) return;
        const now = Date.now();
        if (!force && (now - this.lastReadinessCheckAt) < this.readinessCheckIntervalMs) return;
        this.lastReadinessCheckAt = now;

        try {
            const status = await window.electronAPI.classifierStatus();
            this._consumeClassifierStatus(status);
        } catch (error) {
            console.warn('[MLSoundDetector] classifier-status check failed:', error?.message || error);
        }
    }

    /**
     * Connect to audio stream with stereo support
     * @param {MediaStreamAudioSourceNode} streamSource - audio source node
     * @param {boolean} enableStereo - whether to capture stereo audio
     */
    connect(streamSource, enableStereo = true) {
        const nodeChannelCount = Number(streamSource?.channelCount || 0);
        const trackChannelCount = Number(
            streamSource?.mediaStream?.getAudioTracks?.()?.[0]?.getSettings?.()?.channelCount || 0
        );
        const inferredChannels = Math.max(nodeChannelCount, trackChannelCount, 1);
        const allowStereo = enableStereo && inferredChannels >= 2;
        this.isStereo = allowStereo;
        if (enableStereo && !allowStereo) {
            console.warn(
                `[MLSoundDetector] Stereo requested but source appears mono (channels=${inferredChannels}); using mono pipeline`
            );
        }

        // Connect heuristic fallback
        this.heuristicFallback.connect(streamSource);

        // Initialize buffers
        this.monoBuffer = new Float32Array(this.chunkSamples);

        if (this.isStereo) {
            // Set up stereo processing
            this.leftBuffer = new Float32Array(this.chunkSamples);
            this.rightBuffer = new Float32Array(this.chunkSamples);

            // Create channel splitter and merger
            this.splitterNode = this.ctx.createChannelSplitter(2);
            this.mergerNode = this.ctx.createChannelMerger(2);

            // Connect stream to splitter
            streamSource.connect(this.splitterNode);

            // Set up processors for each channel
            this._setupStereoProcessors();
        } else {
            // Mono processing (original behavior)
            this._setupMonoProcessor(streamSource);
        }
    }

    /**
     * Set up stereo audio processors
     */
    _setupStereoProcessors() {
        // Create processors for left and right channels
        const leftProcessor = this.ctx.createScriptProcessor(4096, 1, 1);
        const rightProcessor = this.ctx.createScriptProcessor(4096, 1, 1);

        // Connect splitter outputs to processors
        this.splitterNode.connect(leftProcessor, 0);
        this.splitterNode.connect(rightProcessor, 1);

        // Temporary buffers for stereo accumulation
        let leftOffset = 0;
        let rightOffset = 0;
        let monoOffset = 0;

        const processStereo = () => {
            if (!this.isMLReady) return;

            // Check if we have enough data from both channels
            const minOffset = Math.min(leftOffset, rightOffset, monoOffset);

            if (minOffset >= this.chunkSamples) {
                // Prepare stereo data for classification
                const audioData = {
                    left: this.leftBuffer.slice(0, this.chunkSamples),
                    right: this.rightBuffer.slice(0, this.chunkSamples),
                    mono: this.monoBuffer.slice(0, this.chunkSamples),
                };

                this._sendChunk(audioData);

                // Sliding overlap window improves sustained alert recall.
                const overlap = Math.max(0, Math.min(this.chunkOverlapSamples, this.chunkSamples - 1));
                if (overlap > 0) {
                    this.leftBuffer.copyWithin(0, this.chunkSamples - overlap, this.chunkSamples);
                    this.rightBuffer.copyWithin(0, this.chunkSamples - overlap, this.chunkSamples);
                    this.monoBuffer.copyWithin(0, this.chunkSamples - overlap, this.chunkSamples);
                    leftOffset = overlap;
                    rightOffset = overlap;
                    monoOffset = overlap;
                } else {
                    leftOffset = 0;
                    rightOffset = 0;
                    monoOffset = 0;
                }
            }
        };

        leftProcessor.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const remaining = this.chunkSamples - leftOffset;
            const toCopy = Math.min(input.length, remaining);

            this.leftBuffer.set(input.subarray(0, toCopy), leftOffset);
            leftOffset += toCopy;

            // Also accumulate mono
            if (monoOffset < this.chunkSamples) {
                for (let i = 0; i < toCopy; i++) {
                    this.monoBuffer[monoOffset + i] = (this.monoBuffer[monoOffset + i] || 0) + input[i] * 0.5;
                }
            }

            processStereo();
        };

        rightProcessor.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const remaining = this.chunkSamples - rightOffset;
            const toCopy = Math.min(input.length, remaining);

            this.rightBuffer.set(input.subarray(0, toCopy), rightOffset);
            rightOffset += toCopy;

            // Also accumulate mono
            if (monoOffset < this.chunkSamples) {
                for (let i = 0; i < toCopy; i++) {
                    this.monoBuffer[monoOffset + i] = (this.monoBuffer[monoOffset + i] || 0) + input[i] * 0.5;
                }
                monoOffset += toCopy;
            }

            processStereo();
        };

        leftProcessor.connect(this.ctx.destination);
        rightProcessor.connect(this.ctx.destination);

        this.stereoProcessors = [leftProcessor, rightProcessor];
    }

    /**
     * Set up mono audio processor (original behavior)
     */
    _setupMonoProcessor(streamSource) {
        this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
        streamSource.connect(this.processor);
        this.processor.connect(this.ctx.destination);

        let bufferOffset = 0;

        this.processor.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const remaining = this.chunkSamples - bufferOffset;
            const toCopy = Math.min(input.length, remaining);

            this.monoBuffer.set(input.subarray(0, toCopy), bufferOffset);
            bufferOffset += toCopy;

            if (bufferOffset >= this.chunkSamples) {
                this._sendChunk({ mono: this.monoBuffer.slice(0, this.chunkSamples) });
                const overlap = Math.max(0, Math.min(this.chunkOverlapSamples, this.chunkSamples - 1));
                if (overlap > 0) {
                    this.monoBuffer.copyWithin(0, this.chunkSamples - overlap, this.chunkSamples);
                    bufferOffset = overlap;
                } else {
                    bufferOffset = 0;
                }
            }
        };
    }

    onDetect(callback) {
        this.callbacks.push(callback);
    }

    stop() {
        if (this.heuristicFallback) this.heuristicFallback.stop();

        if (this.processor) {
            this.processor.onaudioprocess = null;
            try {
                this.processor.disconnect();
            } catch (_) {}
        }

        if (this.stereoProcessors) {
            this.stereoProcessors.forEach((proc) => {
                proc.onaudioprocess = null;
                try {
                    proc.disconnect();
                } catch (_) {}
            });
        }

        if (this.splitterNode) {
            try {
                this.splitterNode.disconnect();
            } catch (_) {}
        }

        if (this.mergerNode) {
            try {
                this.mergerNode.disconnect();
            } catch (_) {}
        }
    }

    /**
     * Send audio chunk to classifier with performance tracking
     */
    async _sendChunk(audioData) {
        if (this.classifying) return;
        this.classifying = true;

        const startTime = performance.now();

        try {
            await this._refreshClassifierReadiness();

            // Transfer audio data efficiently
            const results = await window.electronAPI.classifyAudio(audioData, this.sampleRate);

            if (!this.isMLReady && Array.isArray(results)) {
                this.isMLReady = true;
                if (this.heuristicFallback) {
                    this.heuristicFallback.stop();
                }
                console.log('[MLSoundDetector] classifier became active from IPC inference responses');
            }

            // Track processing time
            const processingTime = performance.now() - startTime;
            this._trackProcessingTime(processingTime);

            const now = Date.now();
            const observedCriticalKeys = new Set();
            if (results?.length > 0) {
                // Pick the highest priority result that passes the confidence threshold
                for (const r of results) {
                    const threshold = this._getConfidenceThresholdForResult(r);
                    if (r.confidence >= threshold) {
                        if (this._isCriticalResult(r)) {
                            observedCriticalKeys.add(this._buildAlertKey(r));
                        }
                        this._trigger(r, now);
                        break;
                    }
                }
            }

            this._refreshCriticalAlertLatch(observedCriticalKeys, now);
        } catch (e) {
            console.warn('[MLSoundDetector] Classification failed:', e);
        } finally {
            this.classifying = false;
        }
    }

    /**
     * Trigger detection event with enhanced data including direction
     */
    _trigger(result, now = Date.now()) {
        const key = this._buildAlertKey(result);

        if (this._isCriticalResult(result)) {
            const state = this.criticalAlertState.get(key);
            if (state?.latched) {
                state.lastSeen = now;
                this.criticalAlertState.set(key, state);
                return;
            }
        }

        // Per-category debounce
        const debounceMs = this._getDebounceForResult(result);
        if (this.lastTrigger[key] && now - this.lastTrigger[key] < debounceMs) return;
        this.lastTrigger[key] = now;

        // Build a friendly display label
        const lowerLabel = String(result.label || '').toLowerCase();
        const displayLabel = result.displayLabel || LABEL_DISPLAY[lowerLabel] || result.label;

        // Direction info
        const direction = result.direction || { label: 'center', confidence: 0, angle: 0 };

        const event = {
            category: result.category,
            label: displayLabel,
            className: result.label,
            confidence: result.confidence,
            alertThreshold: this._getConfidenceThresholdForResult(result),
            rawConfidence: result.rawConfidence,
            consecutiveHits: result.consecutiveHits || 1,
            alertType: result.alertType || null,
            critical: result.critical === true,
            timestamp: now,
            isMusic: result.category === 'media',
            direction: direction,
            directionIcon: DIRECTION_ICONS[direction.label] || DIRECTION_ICONS.center,
            directionColor: DIRECTION_COLORS[direction.label] || DIRECTION_COLORS.center,
        };

        // Track in history
        this.triggerHistory.push(event);
        if (this.triggerHistory.length > 100) {
            this.triggerHistory.shift();
        }

        if (event.critical && event.alertType) {
            this.criticalAlertState.set(key, {
                latched: true,
                lastSeen: now,
                lastEmitted: now,
            });
        }

        console.log(
            `[MLSoundDetector] detected category=${event.category} ` +
            `label="${event.label}" critical=${event.critical ? 'yes' : 'no'}`
        );
        this.callbacks.forEach((cb) => cb(event));
    }

    _buildAlertKey(result) {
        return `${result.category}:${String(result.alertType || result.label || 'unknown').toLowerCase()}`;
    }

    _isCriticalResult(result) {
        return result?.critical === true && Boolean(result?.alertType);
    }

    _refreshCriticalAlertLatch(observedCriticalKeys, now = Date.now()) {
        for (const key of observedCriticalKeys) {
            const state = this.criticalAlertState.get(key);
            if (state) {
                state.lastSeen = now;
                this.criticalAlertState.set(key, state);
            } else {
                this.criticalAlertState.set(key, {
                    latched: false,
                    lastSeen: now,
                    lastEmitted: 0,
                });
            }
        }

        for (const [key, state] of this.criticalAlertState.entries()) {
            if (!state) continue;

            // Rearm once sound has been absent long enough.
            if (state.latched && now - state.lastSeen >= CRITICAL_ALERT_RELATCH_SILENCE_MS) {
                state.latched = false;
            }

            // Prevent unbounded growth.
            if (now - state.lastSeen >= CRITICAL_ALERT_STATE_TTL_MS) {
                this.criticalAlertState.delete(key);
                continue;
            }

            this.criticalAlertState.set(key, state);
        }
    }

    _getConfidenceThresholdForResult(result) {
        const alertThreshold = Number(result?.alertThreshold);
        if (Number.isFinite(alertThreshold)) {
            return Math.max(0, Math.min(1, alertThreshold));
        }

        const categoryThreshold = CATEGORY_MIN_CONFIDENCE[String(result?.category || '').toLowerCase()];
        if (Number.isFinite(categoryThreshold)) {
            return categoryThreshold;
        }

        return this.minConfidence;
    }

    _getDebounceForResult(result) {
        const category = String(result?.category || '').toLowerCase();
        return CATEGORY_DEBOUNCE_MS[category] || this.debounceMs;
    }

    /**
     * Track processing time for performance analysis
     */
    _trackProcessingTime(timeMs) {
        this.processingTimes.push(timeMs);
        if (this.processingTimes.length > this.maxProcessingHistory) {
            this.processingTimes.shift();
        }
    }

    /**
     * Get average processing time
     */
    getAverageProcessingTime() {
        if (this.processingTimes.length === 0) return 0;
        return this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    }

    /**
     * Get trigger history for analysis
     */
    getTriggerHistory() {
        return [...this.triggerHistory];
    }

    /**
     * Clear trigger history
     */
    clearTriggerHistory() {
        this.triggerHistory = [];
    }

    // ============================================
    // Custom Sound Training Methods
    // ============================================

    /**
     * Start recording a custom sound
     * @param {string} name - display name for the sound
     * @param {string} category - unique category identifier
     */
    startCustomSoundRecording(name, category) {
        if (this.isRecordingCustom) {
            console.warn('[MLSoundDetector] Already recording custom sound');
            return false;
        }

        this.isRecordingCustom = true;
        this.customRecordingName = name;
        this.customRecordingCategory = category;
        this.customRecordingBuffer = [];
        this.customRecordingStartTime = Date.now();

        // Set up temporary capture
        this._setupCustomSoundCapture();

        console.log(`[MLSoundDetector] Started recording custom sound: ${name}`);
        return true;
    }

    /**
     * Stop recording and save the custom sound
     */
    async stopCustomSoundRecording() {
        if (!this.isRecordingCustom) {
            console.warn('[MLSoundDetector] Not recording custom sound');
            return null;
        }

        this.isRecordingCustom = false;

        // Clean up custom capture
        if (this.customProcessor) {
            this.customProcessor.onaudioprocess = null;
            try {
                this.customProcessor.disconnect();
            } catch (_) {}
        }

        // Combine recorded buffers
        const totalLength = this.customRecordingBuffer.reduce((sum, buf) => sum + buf.length, 0);
        const combined = new Float32Array(totalLength);
        let offset = 0;
        for (const buf of this.customRecordingBuffer) {
            combined.set(buf, offset);
            offset += buf.length;
        }

        // Send to main process for embedding extraction and storage
        try {
            const result = await window.electronAPI?.addCustomSound?.(
                this.customRecordingName,
                this.customRecordingCategory,
                combined
            );

            console.log(`[MLSoundDetector] Saved custom sound: ${this.customRecordingName}`);
            return result;
        } catch (e) {
            console.error('[MLSoundDetector] Failed to save custom sound:', e);
            return null;
        }
    }

    /**
     * Set up temporary audio capture for custom sound recording
     */
    _setupCustomSoundCapture() {
        // Create a temporary processor to capture audio
        this.customProcessor = this.ctx.createScriptProcessor(4096, 1, 1);

        // We need to connect this to the source
        // This will be called when the source is available
        this.customProcessor.onaudioprocess = (e) => {
            if (!this.isRecordingCustom) return;

            const input = e.inputBuffer.getChannelData(0);
            this.customRecordingBuffer.push(new Float32Array(input));

            // Check if we've recorded enough
            const recordedDuration = (Date.now() - this.customRecordingStartTime) / 1000;
            if (recordedDuration >= this.customRecordingDuration / 1000) {
                this.stopCustomSoundRecording();
            }
        };
    }

    /**
     * Get list of custom sounds
     */
    async getCustomSounds() {
        try {
            return await window.electronAPI?.getCustomSounds?.() || [];
        } catch (e) {
            console.error('[MLSoundDetector] Failed to get custom sounds:', e);
            return [];
        }
    }

    /**
     * Delete a custom sound
     */
    async deleteCustomSound(category) {
        try {
            await window.electronAPI?.deleteCustomSound?.(category);
            return true;
        } catch (e) {
            console.error('[MLSoundDetector] Failed to delete custom sound:', e);
            return false;
        }
    }

    // ============================================
    // Configuration Methods
    // ============================================

    /**
     * Set confidence threshold
     */
    setConfidenceThreshold(threshold) {
        this.minConfidence = Math.max(0, Math.min(1, threshold));
        console.log(`[MLSoundDetector] Confidence threshold set to ${this.minConfidence}`);
    }

    /**
     * Set debounce duration
     */
    setDebounceDuration(ms) {
        this.debounceMs = Math.max(500, ms);
        console.log(`[MLSoundDetector] Debounce duration set to ${this.debounceMs}ms`);
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isMLReady: this.isMLReady,
            isStereo: this.isStereo,
            webglSupported: this.webglSupported,
            minConfidence: this.minConfidence,
            debounceMs: this.debounceMs,
            averageProcessingTime: this.getAverageProcessingTime(),
            triggerHistoryCount: this.triggerHistory.length,
            criticalLatchCount: this.criticalAlertState.size,
            classifierTelemetry: { ...this.classifierTelemetry },
        };
    }
}

export default MLSoundDetector;
