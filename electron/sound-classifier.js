// ML-based sound classification using MediaPipe YAMNet runtime
// Runs in the main process, communicates with renderer via IPC.
// Downloads and caches models on first run.
//
// Enhanced features:
// - YAMNet-first on-device inference for consistent low-latency detection
// - Temporal smoothing with confidence history
// - Custom sound training with embedding storage
// - Directional audio analysis (stereo phase)
// - WebGL acceleration support
// - Background thread processing via Worker threads

const path = require('path');
const fs = require('fs');
const https = require('https');
const NodeModule = require('module');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// AudioSet label -> Relay category mapping.
const LABEL_CATEGORY = {};

function addLabels(category, labels) {
    for (const l of labels) LABEL_CATEGORY[l.toLowerCase()] = category;
}

addLabels('emergency', [
    'Smoke detector, smoke alarm', 'Fire alarm', 'Siren',
    'Civil defense siren', 'Alarm', 'Alarm clock', 'Buzzer',
    'Emergency vehicle', 'Fire engine, fire truck (siren)',
    'Ambulance (siren)', 'Police car (siren)',
    'Foghorn', 'Smoke alarm', 'Smoke detector',
]);

addLabels('attention', [
    'Doorbell', 'Ding-dong', 'Ding', 'Door', 'Knock',
    'Telephone bell ringing', 'Ringtone', 'Telephone',
    'Bell', 'Church bell', 'Chime', 'Wind chime',
    'Cowbell', 'Jingle bell', 'Tubular bells',
    'Ringing', 'Tap', 'Knocking',
]);

addLabels('communication', [
    'Baby cry, infant cry', 'Crying, sobbing', 'Screaming',
    'Shout', 'Yell', 'Laughter', 'Baby laughter',
    'Whimper', 'Wail, moan', 'Sigh', 'Groan',
]);

addLabels('appliance', [
    'Microwave oven', 'Blender', 'Washing machine',
    'Vacuum cleaner', 'Hair dryer', 'Toothbrush, electric toothbrush',
    'Frying (food)', 'Boiling', 'Dishes, pots, and pans',
    'Mechanical fan', 'Air conditioning',
    'Sewing machine', 'Printer',
]);

addLabels('environmental', [
    'Dog', 'Bark', 'Howl', 'Bow-wow', 'Growling',
    'Cat', 'Purr', 'Meow', 'Hiss',
    'Bird', 'Bird vocalization, bird call, bird song', 'Chirp, tweet',
    'Crow', 'Caw', 'Rooster, cock-a-doodle-doo',
    'Rain', 'Raindrop', 'Rain on surface',
    'Thunder', 'Thunderstorm',
    'Wind', 'Rustling leaves', 'Wind noise (microphone)',
    'Water', 'Stream', 'Waterfall', 'Ocean', 'Waves, surf',
    'Engine', 'Idling', 'Engine starting',
    'Car', 'Vehicle', 'Truck', 'Bus', 'Motorcycle',
    'Train', 'Railroad car, train wagon', 'Train horn',
    'Aircraft', 'Aircraft engine', 'Helicopter',
    'Car horn, honking', 'Bicycle bell',
    'Skateboard', 'Footsteps', 'Walk, footsteps',
    'Glass', 'Shatter', 'Breaking',
    'Crack', 'Thump, thud', 'Slam',
]);

addLabels('media', [
    'Music', 'Musical instrument', 'Singing',
    'Guitar', 'Electric guitar', 'Bass guitar', 'Acoustic guitar',
    'Piano', 'Keyboard (musical)', 'Organ',
    'Drum', 'Drum kit', 'Snare drum', 'Bass drum',
    'Cymbal', 'Hi-hat',
    'Violin, fiddle', 'Cello', 'Flute', 'Trumpet', 'Saxophone',
    'Applause', 'Cheering', 'Clapping',
    'Television', 'Radio', 'Video game music',
    'Theme music', 'Background music',
    'Pop music', 'Rock music', 'Hip hop music',
    'Jazz', 'Classical music', 'Electronic music',
]);

// Priority per category (higher = more important)
const CATEGORY_PRIORITY = {
    emergency: 100,
    attention: 80,
    communication: 60,
    appliance: 40,
    environmental: 30,
    media: 10,
};

// Category-specific confidence floors used by runtime filtering.
const CATEGORY_MIN_CONFIDENCE = {
    emergency: 0.2,
    attention: 0.22,
    communication: 0.24,
    appliance: 0.24,
    environmental: 0.24,
    media: 0.26,
};

// YAMNet-focused critical-alert label rules.
const YAMNET_ALERT_RULES = [
    {
        id: 'smoke_alarm',
        category: 'emergency',
        displayLabel: 'Smoke Alarm',
        labels: ['smoke detector, smoke alarm', 'smoke alarm', 'smoke detector'],
        minConfidence: 0.26,
        priority: 130,
        boost: 1.35,
        critical: true,
    },
    {
        id: 'fire_alarm',
        category: 'emergency',
        displayLabel: 'Fire Alarm',
        labels: ['fire alarm'],
        minConfidence: 0.26,
        priority: 130,
        boost: 1.3,
        critical: true,
    },
    {
        id: 'siren',
        category: 'emergency',
        displayLabel: 'Siren',
        labels: [
            'siren',
            'civil defense siren',
            'emergency vehicle',
            'ambulance (siren)',
            'police car (siren)',
            'fire engine, fire truck (siren)',
        ],
        minConfidence: 0.24,
        priority: 124,
        boost: 1.25,
        critical: true,
    },
    {
        id: 'doorbell',
        category: 'attention',
        displayLabel: 'Doorbell',
        labels: ['doorbell', 'ding-dong', 'chime', 'bell'],
        minConfidence: 0.26,
        priority: 114,
        boost: 1.2,
        critical: true,
        temporalHitsRequired: 1,
    },
    {
        id: 'knock',
        category: 'attention',
        displayLabel: 'Knocking',
        labels: ['knock', 'knocking', 'tap', 'thump, thud', 'door'],
        minConfidence: 0.2,
        priority: 108,
        boost: 1.15,
        critical: true,
        temporalHitsRequired: 1,
    },
    {
        id: 'baby_cry',
        category: 'attention',
        displayLabel: 'Baby Crying',
        labels: ['baby cry, infant cry', 'crying, sobbing', 'wail, moan', 'whimper'],
        minConfidence: 0.24,
        priority: 110,
        boost: 1.2,
        critical: true,
    },
    {
        id: 'alarm_clock',
        category: 'attention',
        displayLabel: 'Alarm Clock',
        labels: ['alarm clock'],
        minConfidence: 0.26,
        priority: 96,
        boost: 1.12,
        critical: true,
        temporalHitsRequired: 1,
    },
    {
        id: 'alarm_generic',
        category: 'emergency',
        displayLabel: 'Alarm',
        labels: ['alarm', 'buzzer', 'beep, bleep'],
        exclude: ['alarm clock'],
        minConfidence: 0.24,
        priority: 112,
        boost: 1.18,
        critical: true,
        temporalHitsRequired: 1,
    },
];

const YAMNET_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';
const YAMNET_MODEL_URL_LATEST = 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/latest/yamnet.tflite';
const YAMNET_MODEL_FILENAME = 'yamnet.tflite';
const YAMNET_MODEL_MIN_BYTES = 300_000;
const YAMNET_TARGET_SAMPLE_RATE = 16_000;

// Public runtime config used by verification scripts.
const YAMNET_RUNTIME_CONFIG = {
    id: 'mediapipe-yamnet',
    modelUrl: YAMNET_MODEL_URL,
    weight: 1.0,
    maxResults: 64,
};

const AST_MODEL_CONFIGS = [
    {
        name: 'Xenova/ast-finetuned-audioset-10-10-0.4593',
        fallbackNames: ['Xenova/ast-finetuned-audioset-16-16-0.442'],
        type: 'ast',
        weight: 0.22,
        quantized: true,
        priority: 2,
    },
];

const ENSEMBLE_ROUTING_CONFIG = {
    astFallbackThreshold: 0.14,
};

const ALERT_RUNTIME_CONFIG = {
    criticalOnly: true,
};

/**
 * Calculate direction from stereo audio using phase analysis
 * @param {Float32Array} leftChannel - left channel samples
 * @param {Float32Array} rightChannel - right channel samples
 * @returns {Object} direction info { angle: number, confidence: number, label: string }
 */
function analyzeDirection(leftChannel, rightChannel) {
    if (!leftChannel || !rightChannel || leftChannel.length !== rightChannel.length) {
        return { angle: 0, confidence: 0, label: 'center' };
    }

    const n = leftChannel.length;

    // Calculate correlation between channels for phase delay estimation
    let sumLeft = 0, sumRight = 0;
    let sumLeftSq = 0, sumRightSq = 0;
    let crossCorr = 0;

    for (let i = 0; i < n; i++) {
        sumLeft += leftChannel[i];
        sumRight += rightChannel[i];
        sumLeftSq += leftChannel[i] * leftChannel[i];
        sumRightSq += rightChannel[i] * rightChannel[i];
    }

    const meanLeft = sumLeft / n;
    const meanRight = sumRight / n;

    // Calculate energy difference (intensity stereo)
    const leftEnergy = sumLeftSq / n;
    const rightEnergy = sumRightSq / n;
    const totalEnergy = leftEnergy + rightEnergy;

    if (totalEnergy < 0.0001) {
        return { angle: 0, confidence: 0, label: 'center' };
    }

    // Calculate normalized energy difference (-1 to 1)
    const energyDiff = (rightEnergy - leftEnergy) / totalEnergy;

    // Estimate direction angle (simplified - using intensity difference)
    // In a real implementation, you'd use cross-correlation for time delay estimation
    const angle = Math.asin(Math.max(-1, Math.min(1, energyDiff))) * (180 / Math.PI);

    // Determine direction label
    let label = 'center';
    if (angle > 15) label = 'right';
    else if (angle < -15) label = 'left';

    // Confidence based on how clear the direction is
    const confidence = Math.abs(energyDiff);

    return { angle, confidence, label };
}

/**
 * Temporal smoothing for confidence scores using exponential moving average
 */
class TemporalSmoother {
    constructor(options = {}) {
        this.alpha = options.alpha || 0.3; // EMA smoothing factor
        this.windowSize = options.windowSize || 5; // Moving average window
        this.confidenceThreshold = options.confidenceThreshold || 0.18;
        this.minConsecutiveHits = options.minConsecutiveHits || 2;

        // Per-category state
        this.emaScores = {};
        this.history = {}; // Array of recent scores
        this.consecutiveHits = {};
        this.lastDetectionTime = {};
    }

    /**
     * Apply temporal smoothing to classification results
     * @param {Array} results - raw classification results
     * @returns {Array|null} smoothed results or null if not confident enough
     */
    smooth(results) {
        if (!results || results.length === 0) {
            this._decayAll();
            return null;
        }

        const now = Date.now();
        const smoothedResults = [];
        const presentKeys = new Set();

        for (const result of results) {
            const stateKey = `${result.category}:${String(result.label || '').toLowerCase()}`;
            presentKeys.add(stateKey);

            const rawConfidence = result.confidence;
            const explicitRequiredHits = Number(result?.temporalHitsRequired);
            const requiredHits = Number.isFinite(explicitRequiredHits)
                ? Math.max(1, Math.floor(explicitRequiredHits))
                : (result.critical
                    ? Math.max(2, this.minConsecutiveHits)
                    : this.minConsecutiveHits);
            const acceptanceThreshold = Number.isFinite(Number(result.alertThreshold))
                ? Number(result.alertThreshold)
                : this.confidenceThreshold;

            // Initialize history for new label keys.
            if (!this.history[stateKey]) {
                this.history[stateKey] = [];
                this.emaScores[stateKey] = rawConfidence;
                this.consecutiveHits[stateKey] = 0;
            }

            // Update EMA
            this.emaScores[stateKey] =
                this.alpha * rawConfidence + (1 - this.alpha) * this.emaScores[stateKey];

            // Update history window
            this.history[stateKey].push(rawConfidence);
            if (this.history[stateKey].length > this.windowSize) {
                this.history[stateKey].shift();
            }

            // Calculate moving average
            const movingAvg = this.history[stateKey].reduce((a, b) => a + b, 0) /
                this.history[stateKey].length;

            // Combined score: weighted average of EMA and moving average
            const combinedScore = this.emaScores[stateKey] * 0.6 + movingAvg * 0.4;

            // Track consecutive hits
            if (combinedScore >= acceptanceThreshold) {
                this.consecutiveHits[stateKey]++;
            } else {
                this.consecutiveHits[stateKey] = Math.max(0, this.consecutiveHits[stateKey] - 1);
            }

            // Only include if we have enough consecutive hits
            if (this.consecutiveHits[stateKey] >= requiredHits &&
                combinedScore >= acceptanceThreshold) {
                smoothedResults.push({
                    ...result,
                    confidence: combinedScore,
                    rawConfidence: rawConfidence,
                    consecutiveHits: this.consecutiveHits[stateKey],
                    smoothingKey: stateKey,
                });
            }

            this.lastDetectionTime[stateKey] = now;
        }

        // Decay keys not present in this frame.
        for (const stateKey of Object.keys(this.history)) {
            if (!presentKeys.has(stateKey)) {
                this._decayStateKey(stateKey);
            }
        }

        return smoothedResults.length > 0 ? smoothedResults : null;
    }

    _decayStateKey(stateKey) {
        if (this.emaScores[stateKey]) {
            this.emaScores[stateKey] *= 0.9; // Decay EMA
        }
        this.consecutiveHits[stateKey] = Math.max(0, (this.consecutiveHits[stateKey] || 0) - 1);
    }

    _decayAll() {
        for (const stateKey of Object.keys(this.emaScores)) {
            this._decayStateKey(stateKey);
        }
    }

    reset() {
        this.emaScores = {};
        this.history = {};
        this.consecutiveHits = {};
        this.lastDetectionTime = {};
    }
}

/**
 * Custom Sound Trainer - manages user-trained custom sounds
 */
class CustomSoundTrainer {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.customSoundsPath = path.join(userDataPath, 'custom-sounds.json');
        this.embeddings = {}; // category -> array of embeddings
        this.threshold = 0.75; // Similarity threshold for matching
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.customSoundsPath)) {
                const data = JSON.parse(fs.readFileSync(this.customSoundsPath, 'utf8'));
                this.embeddings = data.embeddings || {};
                console.log('[CustomSoundTrainer] Loaded', Object.keys(this.embeddings).length, 'custom sounds');
            }
        } catch (e) {
            console.error('[CustomSoundTrainer] Failed to load:', e.message);
        }
    }

    save() {
        try {
            const data = { embeddings: this.embeddings, updatedAt: Date.now() };
            fs.writeFileSync(this.customSoundsPath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('[CustomSoundTrainer] Failed to save:', e.message);
        }
    }

    /**
     * Add a new custom sound embedding
     * @param {string} name - display name for the sound
     * @param {string} category - category (e.g., 'custom_doorbell')
     * @param {Float32Array} embedding - feature embedding
     */
    addSound(name, category, embedding) {
        if (!this.embeddings[category]) {
            this.embeddings[category] = { name, samples: [] };
        }

        // Store up to 5 samples per custom sound for variety
        this.embeddings[category].samples.push(Array.from(embedding));
        if (this.embeddings[category].samples.length > 5) {
            this.embeddings[category].samples.shift();
        }

        this.save();
        console.log(`[CustomSoundTrainer] Added custom sound: ${name} (${category})`);
    }

    /**
     * Check if audio matches any custom sound
     * @param {Float32Array} embedding - query embedding
     * @returns {Object|null} matched sound info or null
     */
    match(embedding) {
        let bestMatch = null;
        let bestScore = 0;

        const embeddingArray = Array.from(embedding);

        for (const [category, data] of Object.entries(this.embeddings)) {
            for (const sample of data.samples) {
                const similarity = this._cosineSimilarity(embeddingArray, sample);
                if (similarity > this.threshold && similarity > bestScore) {
                    bestScore = similarity;
                    bestMatch = {
                        category: 'custom',
                        label: data.name,
                        className: category,
                        confidence: similarity,
                        priority: 90, // High priority for custom sounds
                    };
                }
            }
        }

        return bestMatch;
    }

    _cosineSimilarity(a, b) {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    getCustomSounds() {
        return Object.entries(this.embeddings).map(([category, data]) => ({
            category,
            name: data.name,
            sampleCount: data.samples.length,
        }));
    }

    deleteCustomSound(category) {
        delete this.embeddings[category];
        this.save();
    }
}

/**
 * Enhanced Sound Classifier with ensemble models, temporal smoothing,
 * directional analysis, and custom sound support
 */
class SoundClassifier {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.models = {}; // AST model map
        this.isReady = false;
        this.isLoading = false;
        this.modelConfigs = [...AST_MODEL_CONFIGS];
        this.modelName = 'yamnet-only';
        this.degraded = false;
        this.yamnet = {
            ready: false,
            source: null,
            modelPath: null,
            classifier: null,
            error: null,
        };

        // Temporal smoothing
        this.temporalSmoother = new TemporalSmoother({
            alpha: 0.3,
            windowSize: 5,
            confidenceThreshold: 0.18,
            minConsecutiveHits: 2,
        });

        // Custom sound training
        this.customTrainer = new CustomSoundTrainer(userDataPath);

        // Performance tracking
        this.inferenceTimes = [];
        this.maxInferenceHistory = 100;

        // WebGL support check
        this.webglAvailable = false;
    }

    async init() {
        if (this.isLoading || this.isReady) return;
        this.isLoading = true;

        try {
            // Note: WebGL in Electron main process requires special handling.
            this.webglAvailable = false;
            console.log('[SoundClassifier] Running inference on CPU (main process)');

            await this._initYamnetRuntime();
            this.models = {};
            const astReady = false;
            this.isReady = this.yamnet.ready;
            this.degraded = !this.yamnet.ready;

            if (this.isReady) {
                const modelParts = [];
                if (this.yamnet.ready) {
                    modelParts.push(`${YAMNET_RUNTIME_CONFIG.id}:${this.yamnet.source}`);
                }
                this.modelName = modelParts.join('+');
                console.log(
                    `[SoundClassifier] Ready mode=yamnet_only yamnetReady=${this.yamnet.ready} ` +
                    `astReady=${astReady} source=${this.yamnet.source || 'none'}`
                );
            } else {
                console.error('[SoundClassifier] All models failed to load');
            }
        } catch (e) {
            console.error('[SoundClassifier] Initialization failed:', e.message);
        } finally {
            this.isLoading = false;
        }
    }

    async _initAstModels(transformers) {
        for (const config of this.modelConfigs) {
            const candidates = [
                config.name,
                ...(Array.isArray(config.fallbackNames) ? config.fallbackNames : [])
            ].filter(Boolean);
            let lastError = null;
            let loaded = false;

            for (const modelId of candidates) {
                try {
                    console.log(`[SoundClassifier] Loading AST model: ${modelId}`);
                    const pipeline = await transformers.pipeline(
                        'audio-classification',
                        modelId,
                        {
                            quantized: config.quantized,
                            revision: 'main',
                        }
                    );
                    const resolvedConfig = { ...config, resolvedName: modelId };
                    this.models[config.name] = { pipeline, config: resolvedConfig };
                    if (modelId !== config.name) {
                        console.warn(
                            `[SoundClassifier] Model ${config.name} unavailable, using fallback ${modelId}`
                        );
                    } else {
                        console.log(`[SoundClassifier] Model loaded: ${modelId}`);
                    }
                    loaded = true;
                    break;
                } catch (e) {
                    lastError = e;
                    console.warn(`[SoundClassifier] Failed to load ${modelId}:`, e.message);
                }
            }

            if (!loaded) {
                console.warn(
                    `[SoundClassifier] Failed to load ${config.name} and fallbacks:`,
                    lastError?.message || 'unknown'
                );
            }
        }
    }

    _installMediapipeNodeShim() {
        if (globalThis.__relayMediapipeShimInstalled) return;

        globalThis.self = globalThis.self || globalThis;
        const scriptExportCache = new Map();
        globalThis.importScripts = (...urls) => {
            for (const urlOrPath of urls) {
                const sourcePath = String(urlOrPath || '').startsWith('file://')
                    ? new URL(urlOrPath).pathname
                    : String(urlOrPath || '');

                if (/^https?:\/\//i.test(sourcePath)) {
                    throw new Error(`Unsupported remote importScripts source in Node shim: ${sourcePath}`);
                }

                let exportedFactory = scriptExportCache.get(sourcePath);
                if (!exportedFactory) {
                    const code = fs.readFileSync(sourcePath, 'utf8');
                    const scriptModule = new NodeModule(sourcePath, module);
                    scriptModule.filename = sourcePath;
                    scriptModule.paths = NodeModule._nodeModulePaths(path.dirname(sourcePath));
                    scriptModule._compile(code, sourcePath);
                    exportedFactory = scriptModule.exports;
                    scriptExportCache.set(sourcePath, exportedFactory);
                }

                if (typeof exportedFactory === 'function') {
                    globalThis.ModuleFactory = exportedFactory;
                    globalThis.self.ModuleFactory = exportedFactory;
                    continue;
                }

                if (exportedFactory && typeof exportedFactory.default === 'function') {
                    globalThis.ModuleFactory = exportedFactory.default;
                    globalThis.self.ModuleFactory = exportedFactory.default;
                    continue;
                }

                if (typeof globalThis.ModuleFactory === 'function') {
                    globalThis.self.ModuleFactory = globalThis.ModuleFactory;
                    continue;
                }

                throw new Error(`Failed to resolve ModuleFactory from ${sourcePath}`);
            }
        };

        globalThis.__relayMediapipeShimInstalled = true;
    }

    _resolveYamnetBundledPath() {
        const candidates = [
            path.resolve(__dirname, '../assets/models/yamnet.tflite'),
            process.resourcesPath
                ? path.resolve(process.resourcesPath, 'assets/models/yamnet.tflite')
                : null,
            process.resourcesPath
                ? path.resolve(process.resourcesPath, 'app.asar.unpacked/assets/models/yamnet.tflite')
                : null,
        ].filter(Boolean);

        return candidates.find((candidate) => fs.existsSync(candidate)) || null;
    }

    _resolveTasksAudioWasmBasePath() {
        const candidates = [
            path.resolve(__dirname, '../node_modules/@mediapipe/tasks-audio/wasm'),
            process.resourcesPath
                ? path.resolve(process.resourcesPath, 'app.asar/node_modules/@mediapipe/tasks-audio/wasm')
                : null,
            process.resourcesPath
                ? path.resolve(process.resourcesPath, 'node_modules/@mediapipe/tasks-audio/wasm')
                : null,
            process.resourcesPath
                ? path.resolve(process.resourcesPath, 'app.asar.unpacked/node_modules/@mediapipe/tasks-audio/wasm')
                : null,
        ].filter(Boolean);

        return candidates.find((candidate) => fs.existsSync(candidate))
            || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio/wasm';
    }

    _isUsableFile(filePath, minBytes = YAMNET_MODEL_MIN_BYTES) {
        if (!filePath || !fs.existsSync(filePath)) return false;
        try {
            const stats = fs.statSync(filePath);
            return stats.isFile() && stats.size >= minBytes;
        } catch (_) {
            return false;
        }
    }

    async _downloadToFile(url, destinationPath, redirectCount = 0) {
        if (redirectCount > 5) {
            throw new Error(`Too many redirects while downloading ${url}`);
        }

        await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
        const tempPath = `${destinationPath}.download-${Date.now()}`;

        try {
            await new Promise((resolve, reject) => {
                const request = https.get(url, (response) => {
                    const statusCode = response.statusCode || 0;

                    if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
                        response.resume();
                        this._downloadToFile(response.headers.location, destinationPath, redirectCount + 1)
                            .then(resolve)
                            .catch(reject);
                        return;
                    }

                    if (statusCode < 200 || statusCode >= 300) {
                        response.resume();
                        reject(new Error(`Failed download ${url} (status ${statusCode})`));
                        return;
                    }

                    const writer = fs.createWriteStream(tempPath);
                    response.pipe(writer);
                    writer.on('finish', () => writer.close(resolve));
                    writer.on('error', (error) => reject(error));
                });

                request.on('error', reject);
            });

            if (!this._isUsableFile(tempPath)) {
                throw new Error(`Downloaded YAMNet file is invalid: ${tempPath}`);
            }
            await fs.promises.rename(tempPath, destinationPath);
        } catch (error) {
            try {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch (_) {}
            throw error;
        }
    }

    async _resolveYamnetModelPath() {
        const cacheDir = path.join(this.userDataPath, 'ml-models', 'yamnet');
        const cachePath = path.join(cacheDir, YAMNET_MODEL_FILENAME);
        await fs.promises.mkdir(cacheDir, { recursive: true });

        if (this._isUsableFile(cachePath)) {
            return { modelPath: cachePath, source: 'cache' };
        }

        const bundledPath = this._resolveYamnetBundledPath();
        if (this._isUsableFile(bundledPath)) {
            try {
                await fs.promises.copyFile(bundledPath, cachePath);
                if (this._isUsableFile(cachePath)) {
                    return { modelPath: cachePath, source: 'bundled' };
                }
            } catch (error) {
                console.warn('[SoundClassifier] Failed to copy bundled YAMNet to cache:', error.message);
            }
            return { modelPath: bundledPath, source: 'bundled' };
        }

        for (const remoteUrl of [YAMNET_MODEL_URL, YAMNET_MODEL_URL_LATEST]) {
            try {
                console.log(`[SoundClassifier] Downloading YAMNet model from ${remoteUrl}`);
                await this._downloadToFile(remoteUrl, cachePath);
                if (this._isUsableFile(cachePath)) {
                    return { modelPath: cachePath, source: 'remote' };
                }
            } catch (error) {
                console.warn('[SoundClassifier] YAMNet remote download failed:', error.message);
            }
        }

        throw new Error('YAMNet model resolution failed (bundle/cache/remote unavailable)');
    }

    async _initYamnetRuntime() {
        try {
            this._installMediapipeNodeShim();
            const { FilesetResolver, AudioClassifier } = require('@mediapipe/tasks-audio');
            const { modelPath, source } = await this._resolveYamnetModelPath();
            const wasmBasePath = this._resolveTasksAudioWasmBasePath();

            const wasmFileset = await FilesetResolver.forAudioTasks(wasmBasePath);
            const modelBuffer = fs.readFileSync(modelPath);
            const classifier = await AudioClassifier.createFromModelBuffer(
                wasmFileset,
                new Uint8Array(modelBuffer)
            );
            await classifier.setOptions({
                maxResults: YAMNET_RUNTIME_CONFIG.maxResults,
                scoreThreshold: 0,
            });

            this.yamnet = {
                ready: true,
                source,
                modelPath,
                classifier,
                error: null,
            };
            console.log(`[SoundClassifier] YAMNet ready source=${source} model=${modelPath}`);
        } catch (error) {
            this.yamnet = {
                ready: false,
                source: null,
                modelPath: null,
                classifier: null,
                error: error?.message || 'Unknown YAMNet init error',
            };
            console.error('[SoundClassifier] YAMNet init failed:', this.yamnet.error);
        }
    }

    _prepareYamnetAudio(audioData, sampleRate) {
        const input = audioData instanceof Float32Array
            ? audioData
            : Float32Array.from(audioData || []);
        const inputRate = Number(sampleRate) || YAMNET_TARGET_SAMPLE_RATE;

        if (!input.length) {
            return {
                samples: input,
                sampleRate: inputRate,
            };
        }

        if (inputRate === YAMNET_TARGET_SAMPLE_RATE) {
            for (let i = 0; i < input.length; i++) {
                if (input[i] > 1) input[i] = 1;
                else if (input[i] < -1) input[i] = -1;
            }
            return {
                samples: input,
                sampleRate: YAMNET_TARGET_SAMPLE_RATE,
            };
        }

        const targetLength = Math.max(
            1,
            Math.round(input.length * (YAMNET_TARGET_SAMPLE_RATE / inputRate))
        );
        const output = new Float32Array(targetLength);
        const ratio = (input.length - 1) / Math.max(1, targetLength - 1);

        for (let i = 0; i < targetLength; i++) {
            const position = i * ratio;
            const leftIndex = Math.floor(position);
            const rightIndex = Math.min(leftIndex + 1, input.length - 1);
            const frac = position - leftIndex;
            const sample = input[leftIndex] * (1 - frac) + input[rightIndex] * frac;
            output[i] = Math.max(-1, Math.min(1, sample));
        }

        return {
            samples: output,
            sampleRate: YAMNET_TARGET_SAMPLE_RATE,
        };
    }

    _collectYamnetPredictions(rawResults = []) {
        const scoreByLabel = new Map();

        for (const result of rawResults) {
            for (const head of result?.classifications || []) {
                for (const categoryEntry of head?.categories || []) {
                    const label = String(
                        categoryEntry?.categoryName || categoryEntry?.displayName || ''
                    ).trim();
                    if (!label) continue;
                    const score = Number(categoryEntry?.score);
                    if (!Number.isFinite(score) || score <= 0) continue;
                    const state = scoreByLabel.get(label) || { sum: 0, count: 0 };
                    state.sum += score;
                    state.count += 1;
                    scoreByLabel.set(label, state);
                }
            }
        }

        return [...scoreByLabel.entries()]
            .map(([label, state]) => [label, state.sum / Math.max(1, state.count)])
            .sort((a, b) => b[1] - a[1])
            .slice(0, YAMNET_RUNTIME_CONFIG.maxResults)
            .map(([label, score]) => {
                const category = this._getCategoryForLabel(label);
                if (!category) return null;
                return {
                    category,
                    label,
                    confidence: score * YAMNET_RUNTIME_CONFIG.weight,
                    priority: CATEGORY_PRIORITY[category] || 0,
                    model: YAMNET_RUNTIME_CONFIG.id,
                };
            })
            .filter(Boolean);
    }

    async _runAstEnsemble(audioData, sampleRate) {
        const predictions = [];
        for (const [modelName, { pipeline, config }] of Object.entries(this.models)) {
            try {
                const raw = await pipeline(audioData, {
                    topk: 20,
                    sampling_rate: sampleRate,
                });

                for (const pred of raw) {
                    const label = pred.label;
                    const confidence = pred.score * config.weight;
                    const category = this._getCategoryForLabel(label);
                    if (!category) continue;

                    predictions.push({
                        category,
                        label,
                        confidence,
                        priority: CATEGORY_PRIORITY[category] || 0,
                        model: modelName,
                    });
                }
            } catch (error) {
                console.warn(`[SoundClassifier] Model ${modelName} inference failed:`, error.message);
            }
        }
        return predictions;
    }

    /**
     * Classify audio with ensemble models and temporal smoothing
     * @param {Object} audioData - { left: Float32Array, right: Float32Array, mono: Float32Array }
     * @param {number} sampleRate - sample rate of the audio
     * @returns {Array|null} array of { category, label, confidence, priority, direction }
     */
    async classify(audioData, sampleRate = 16000) {
        if (!this.isReady || !this.yamnet.ready) {
            return null;
        }

        const startTime = performance.now();

        try {
            // Handle both object format {mono, left, right} and plain Float32Array
            let monoAudio;
            let direction = { angle: 0, confidence: 0, label: 'center' };

            if (audioData && typeof audioData === 'object' && audioData.left && audioData.right) {
                // Stereo format from new MLSoundDetector
                direction = analyzeDirection(audioData.left, audioData.right);
                monoAudio = audioData.mono || audioData.left;
            } else if (audioData && typeof audioData === 'object' && audioData.mono) {
                // Object with mono property
                monoAudio = audioData.mono;
            } else {
                // Plain Float32Array from IPC handler
                monoAudio = audioData;
            }

            // Run ensemble inference
            const ensembleResults = await this._runEnsemble(monoAudio, sampleRate);

            if (!ensembleResults || ensembleResults.length === 0) {
                return null;
            }

            // Check for custom sound matches (only if monoAudio is Float32Array)
            let customMatch = null;
            if (monoAudio instanceof Float32Array) {
                customMatch = this.customTrainer.match(monoAudio);
            }
            if (customMatch) {
                customMatch.direction = direction;
                ensembleResults.unshift(customMatch);
            }

            // Add direction info to all results
            const resultsWithDirection = ensembleResults.map(r => ({
                ...r,
                direction,
            }));

            // Apply temporal smoothing
            const smoothed = this.temporalSmoother.smooth(resultsWithDirection);

            // Track performance
            const inferenceTime = performance.now() - startTime;
            this._trackPerformance(inferenceTime);

            return smoothed;
        } catch (e) {
            console.error('[SoundClassifier] Inference error:', e.message);
            return null;
        }
    }

    /**
     * Run YAMNet inference pipeline.
     */
    async _runEnsemble(audioData, sampleRate) {
        const allPredictions = [];

        if (this.yamnet.ready && this.yamnet.classifier) {
            try {
                const prepared = this._prepareYamnetAudio(audioData, sampleRate);
                const rawYamnet = this.yamnet.classifier.classify(
                    prepared.samples,
                    prepared.sampleRate
                );
                const yamnetPredictions = this._collectYamnetPredictions(rawYamnet);
                allPredictions.push(...yamnetPredictions);
            } catch (error) {
                console.warn('[SoundClassifier] YAMNet inference failed:', error.message);
            }
        }

        if (allPredictions.length === 0) {
            return null;
        }

        // Combine predictions by category and label
        const combined = this._combinePredictions(allPredictions);
        const alertAdjusted = this._applyYamnetAlertRules(combined);
        const filteredAlerts = ALERT_RUNTIME_CONFIG.criticalOnly
            ? alertAdjusted.filter((item) => item.critical === true && item.alertType)
            : alertAdjusted;

        // Sort by priority then confidence
        filteredAlerts.sort((a, b) => b.priority - a.priority || b.confidence - a.confidence);

        return filteredAlerts.length > 0 ? filteredAlerts : null;
    }

    /**
     * Combine predictions from multiple models, aggregating by label
     */
    _combinePredictions(predictions) {
        const labelMap = {};

        for (const pred of predictions) {
            const key = pred.label.toLowerCase();
            if (!labelMap[key]) {
                labelMap[key] = {
                    category: pred.category,
                    label: pred.label,
                    confidence: 0,
                    priority: pred.priority,
                    models: [],
                };
            }
            labelMap[key].confidence += pred.confidence;
            labelMap[key].models.push(pred.model);
        }

        // Normalize confidence by number of models that detected it
        return Object.values(labelMap).map(p => ({
            category: p.category,
            label: p.label,
            confidence: p.confidence / Math.max(1, p.models.length),
            priority: p.priority,
            modelCount: p.models.length,
        }));
    }

    _applyYamnetAlertRules(predictions) {
        return predictions.map((prediction) => {
            const rule = this._matchYamnetAlertRule(prediction.label);
            const categoryFloor = CATEGORY_MIN_CONFIDENCE[prediction.category] || 0.12;

            if (!rule) {
                return {
                    ...prediction,
                    alertThreshold: categoryFloor,
                    displayLabel: prediction.label,
                    critical: false,
                    alertType: null,
                };
            }

            const boostedConfidence = Math.min(1, prediction.confidence * rule.boost);
            const boostedCategory = rule.category || prediction.category;
            return {
                ...prediction,
                category: boostedCategory,
                confidence: boostedConfidence,
                priority: Math.max(prediction.priority, rule.priority),
                alertThreshold: rule.minConfidence,
                displayLabel: rule.displayLabel || prediction.label,
                critical: rule.critical === true,
                alertType: rule.id,
                temporalHitsRequired: Number.isFinite(Number(rule.temporalHitsRequired))
                    ? Math.max(1, Math.floor(Number(rule.temporalHitsRequired)))
                    : undefined,
            };
        });
    }

    _matchYamnetAlertRule(label) {
        const normalize = (value) => String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s,-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const lowerLabel = normalize(label);
        if (!lowerLabel) return null;

        for (const rule of YAMNET_ALERT_RULES) {
            const matches = Array.isArray(rule.labels)
                ? rule.labels.some((candidate) => {
                    const normalized = normalize(candidate);
                    return normalized && (
                        lowerLabel === normalized ||
                        lowerLabel.includes(normalized)
                    );
                })
                : false;

            if (!matches) continue;

            const hasExcludedToken = Array.isArray(rule.exclude)
                ? rule.exclude.some((token) => {
                    const normalizedToken = normalize(token);
                    return normalizedToken && lowerLabel.includes(normalizedToken);
                })
                : false;
            if (hasExcludedToken) continue;

            return rule;
        }

        return null;
    }

    _getCategoryForLabel(label) {
        const lowerLabel = label.toLowerCase();
        for (const [key, cat] of Object.entries(LABEL_CATEGORY)) {
            if (lowerLabel.includes(key) || key.includes(lowerLabel)) {
                return cat;
            }
        }
        return null;
    }

    _trackPerformance(timeMs) {
        this.inferenceTimes.push(timeMs);
        if (this.inferenceTimes.length > this.maxInferenceHistory) {
            this.inferenceTimes.shift();
        }
    }

    getPerformanceStats() {
        if (this.inferenceTimes.length === 0) return null;
        const avg = this.inferenceTimes.reduce((a, b) => a + b, 0) / this.inferenceTimes.length;
        const min = Math.min(...this.inferenceTimes);
        const max = Math.max(...this.inferenceTimes);
        return { avg: avg.toFixed(2), min: min.toFixed(2), max: max.toFixed(2), count: this.inferenceTimes.length };
    }

    getStatus() {
        const astReady = false;
        return {
            ready: this.isReady,
            loading: this.isLoading,
            model: this.modelName,
            yamnetReady: this.yamnet.ready,
            yamnetSource: this.yamnet.source,
            astReady,
            degraded: !this.yamnet.ready,
        };
    }

    // Custom sound training API
    addCustomSound(name, category, embedding) {
        return this.customTrainer.addSound(name, category, embedding);
    }

    getCustomSounds() {
        return this.customTrainer.getCustomSounds();
    }

    deleteCustomSound(category) {
        return this.customTrainer.deleteCustomSound(category);
    }

    // Temporal smoothing configuration
    setTemporalSmoothing(options) {
        this.temporalSmoother = new TemporalSmoother(options);
    }

    resetTemporalSmoothing() {
        this.temporalSmoother.reset();
    }
}

module.exports = {
    SoundClassifier,
    LABEL_CATEGORY,
    CATEGORY_PRIORITY,
    CATEGORY_MIN_CONFIDENCE,
    YAMNET_ALERT_RULES,
    YAMNET_RUNTIME_CONFIG,
    AST_MODEL_CONFIGS,
    ENSEMBLE_ROUTING_CONFIG,
    analyzeDirection,
    TemporalSmoother,
    CustomSoundTrainer,
};
