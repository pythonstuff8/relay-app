/**
 * Relay Blind Mode
 * Voice navigation, screen reading, and audio-based accessibility
 */

function normalizeCommandText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const COMMAND_ALIAS_MAP = new Map([
    ['halp', 'help'],
    ['hepl', 'help'],
    ['hlep', 'help'],
    ['reed', 'read'],
    ['reda', 'read'],
    ['captino', 'caption'],
    ['capiton', 'caption'],
    ['capshun', 'caption'],
    ['capton', 'caption'],
    ['nativage', 'navigate'],
    ['navagate', 'navigate'],
    ['naviagte', 'navigate'],
    ['navgiate', 'navigate'],
    ['naviate', 'navigate'],
    ['nagivite', 'navigate'],
    ['nagivate', 'navigate'],
    ['clik', 'click'],
    ['clic', 'click'],
    ['scrol', 'scroll'],
    ['skroll', 'scroll'],
    ['stpo', 'stop'],
    ['lisen', 'listen'],
    ['lisin', 'listen'],
    ['repat', 'repeat'],
    ['repeet', 'repeat'],
    ['explian', 'explain'],
    ['exlpain', 'explain'],
    ['meting', 'meeting'],
    ['meetin', 'meeting'],
    ['discribe', 'describe'],
    ['desribe', 'describe'],
    ['descrive', 'describe'],
    ['descirbe', 'describe'],
    ['summarise', 'summarize'],
    ['sumarize', 'summarize'],
    ['imgae', 'image'],
    ['img', 'image'],
    ['poto', 'photo'],
    ['capure', 'capture'],
    ['setings', 'settings'],
    ['seting', 'settings'],
    ['seetings', 'settings'],
    ['largar', 'larger'],
    ['largr', 'larger'],
    ['smaler', 'smaller'],
    ['smallar', 'smaller'],
    ['trascript', 'transcript'],
    ['transcipt', 'transcript'],
    ['transript', 'transcript'],
    ['trasncript', 'transcript'],
    ['transcipts', 'transcripts'],
    ['trascripts', 'transcripts'],
    ['captions', 'caption'],
    ['transcripts', 'transcript']
]);

function levenshteinDistance(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    const rows = left.length + 1;
    const cols = right.length + 1;

    const table = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
    for (let i = 0; i < rows; i += 1) table[i][0] = i;
    for (let j = 0; j < cols; j += 1) table[0][j] = j;

    for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            table[i][j] = Math.min(
                table[i - 1][j] + 1,
                table[i][j - 1] + 1,
                table[i - 1][j - 1] + cost
            );
        }
    }
    return table[rows - 1][cols - 1];
}

function autocorrectCommandWord(word, lexicon) {
    if (!lexicon || !(lexicon instanceof Set)) return word;
    if (!word || word.length < 4 || lexicon.has(word)) return word;

    let best = word;
    let bestDistance = Infinity;

    for (const candidate of lexicon) {
        if (!candidate) continue;
        if (Math.abs(candidate.length - word.length) > 2) continue;
        if (candidate.charAt(0) !== word.charAt(0)) continue;
        const distance = levenshteinDistance(word, candidate);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate;
            if (distance === 1) break;
        }
    }

    return bestDistance <= 2 ? best : word;
}

function normalizedEditScore(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (!left || !right) return 1;
    const distance = levenshteinDistance(left, right);
    return distance / Math.max(left.length, right.length, 1);
}

function canonicalizeCommandText(text, options = {}) {
    const normalized = normalizeCommandText(text);
    if (!normalized) return '';

    const lexicon = options.lexicon instanceof Set ? options.lexicon : null;
    const autocorrect = options.autocorrect === true;

    return normalized
        .split(' ')
        .filter(Boolean)
        .map((word) => {
            const aliased = COMMAND_ALIAS_MAP.get(word) || word;
            return autocorrect ? autocorrectCommandWord(aliased, lexicon) : aliased;
        })
        .join(' ');
}

export class BlindMode {
    constructor(options = {}) {
        this.isActive = false;
        this.speechSynthesis = window.speechSynthesis;
        this.currentUtterance = null;
        this.voiceCommands = new Map();
        this.normalizedVoiceCommands = new Map();
        this.commandLexicon = new Set();
        this.recognition = null;
        this.isListening = false;
        this.audioContext = null;
        this.spatialAudio = null;
        this.lastSpokenText = '';
        this.lastProcessedCommand = { key: '', normalized: '', timestamp: 0 };
        this.suppressSpeechUntil = 0;
        this.navigationIndex = -1;
        this.lastFocusedElement = null;
        this.describeImagesInFlight = false;
        this.lastDescribeImagesAt = 0;
        this.captureImageInFlight = false;
        this.lastCaptureImageAt = 0;
        this.options = {
            speechRate: 1.0,
            speechPitch: 1.0,
            voice: null,
            spatialAudioEnabled: true,
            earconsEnabled: true,
            ...options
        };

        this.init();
    }

    init() {
        this.setupSpeechSynthesis();
        this.setupVoiceCommands();
        this.setupEarcons();
        this.setupKeyboardNavigation();
    }

    // ============================================
    // SPEECH SYNTHESIS
    // ============================================

    setupSpeechSynthesis() {
        // Load preferred voice
        const voices = this.speechSynthesis.getVoices();
        // Prefer enhanced voices
        this.options.voice = voices.find(v =>
            v.name.includes('Samantha') ||
            v.name.includes('Alex') ||
            v.name.includes('Enhanced')
        ) || voices[0];

        // Handle voices loaded asynchronously
        if (voices.length === 0) {
            this.speechSynthesis.onvoiceschanged = () => {
                const newVoices = this.speechSynthesis.getVoices();
                this.options.voice = newVoices.find(v =>
                    v.name.includes('Samantha') ||
                    v.name.includes('Alex')
                ) || newVoices[0];
            };
        }
    }

    speak(text, priority = 'normal') {
        if (Date.now() < this.suppressSpeechUntil && priority !== 'critical') return;
        if (!this.isActive && priority !== 'critical') return;

        // Track last spoken text for repeat functionality
        this.lastSpokenText = text;

        // Cancel current speech for critical messages
        if (priority === 'critical') {
            this.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.options.speechRate;
        utterance.pitch = this.options.speechPitch;
        utterance.voice = this.options.voice;
        utterance.volume = priority === 'critical' ? 1.0 : 0.9;

        this.currentUtterance = utterance;
        this.speechSynthesis.speak(utterance);

        return new Promise((resolve) => {
            utterance.onend = () => {
                if (this.currentUtterance === utterance) {
                    this.currentUtterance = null;
                }
                resolve();
            };
            utterance.onerror = () => {
                if (this.currentUtterance === utterance) {
                    this.currentUtterance = null;
                }
                resolve();
            };
        });
    }

    stopSpeaking() {
        this.speechSynthesis.cancel();
        this.currentUtterance = null;
    }

    stopCurrentAction() {
        // Block follow-up non-critical utterances for a short moment so "stop" feels immediate.
        this.suppressSpeechUntil = Date.now() + 1500;
        this.stopSpeaking();
        window.dispatchEvent(new CustomEvent('action-request', {
            detail: { action: 'stop-all', source: 'blind-mode' }
        }));
    }

    addVoiceCommandWithVariants(command, handler) {
        const phrase = String(command || '').trim();
        if (!phrase || typeof handler !== 'function') return;

        const first = phrase.charAt(0).toUpperCase();
        const capitalized = `${first}${phrase.slice(1)}`;
        const variants = new Set([
            phrase,
            capitalized,
            `${phrase}.`,
            `${capitalized}.`,
            `${phrase}!`,
            `${capitalized}!`,
            `${phrase}?`,
            `${capitalized}?`
        ]);

        variants.forEach((variant) => {
            this.voiceCommands.set(variant, handler);
        });
    }

    rebuildCommandIndex() {
        this.normalizedVoiceCommands.clear();
        this.commandLexicon.clear();

        for (const [command, handler] of this.voiceCommands.entries()) {
            const normalized = canonicalizeCommandText(command);
            if (!normalized || typeof handler !== 'function') continue;
            if (!this.normalizedVoiceCommands.has(normalized)) {
                this.normalizedVoiceCommands.set(normalized, handler);
            }
            normalized.split(/\s+/).forEach((word) => {
                if (word) this.commandLexicon.add(word);
            });
        }
    }

    // ============================================
    // VOICE COMMANDS
    // ============================================

    setupVoiceCommands() {
        // Define voice command patterns — full spec: help, read, caption, navigate, click, scroll, stop, listen, repeat, explain, meeting, transcript, settings, larger, smaller
        const commandLibrary = [
            ['help', () => this.provideHelp()],
            ['read', () => this.readCaptions()],
            ['read captions', () => this.readCaptions()],
            ['read caption', () => this.readCaptions()],
            ['caption', () => this.readCaptions()],
            ['captions', () => this.readCaptions()],
            ['navigate', () => this.navigatePage()],
            ['click', () => this.clickFocusedElement()],
            ['type to speak', () => this.focusTypeToSpeakInput()],
            ['focus type to speak', () => this.focusTypeToSpeakInput()],
            ['focus type text to convert to speech', () => this.focusTypeToSpeakInput()],
            ['open text box', () => this.focusTypeToSpeakInput()],
            ['scroll', () => this.scrollPage('down')],
            ['scroll up', () => this.scrollPage('up')],
            ['scroll down', () => this.scrollPage('down')],
            ['stop', () => this.stopCurrentAction()],
            ['stop reading', () => this.stopCurrentAction()],
            ['listen', () => this.startListening()],
            ['repeat', () => this.repeatLastMessage()],
            ['explain', () => this.explainScreen()],
            ['explain screen', () => this.explainScreen()],
            ['what is this', () => this.explainScreen()],
            ['meeting', () => this.toggleMeeting()],
            ['transcript', () => this.openTranscripts()],
            ['transcripts', () => this.openTranscripts()],
            ['settings', () => this.openSettings()],
            ['open settings', () => this.openSettings()],
            ['larger', () => this.adjustCaptionSize('larger')],
            ['larger captions', () => this.adjustCaptionSize('larger')],
            ['smaller', () => this.adjustCaptionSize('smaller')],
            ['smaller captions', () => this.adjustCaptionSize('smaller')],
            ['switch mode', () => this.requestModeSwitch()],
            ['increase speech speed', () => this.adjustSpeechRate(0.1)],
            ['decrease speech speed', () => this.adjustSpeechRate(-0.1)],
            ['summarize page', () => this.summarizePage()],
            ['describe page', () => this.summarizePage()],
            ['describe image', () => this.describeImages()],
            ['describe images', () => this.describeImages()],
            ['describe the image', () => this.describeImages()],
            ['describe the images', () => this.describeImages()],
            ['describe this image', () => this.describeImages()],
            ['describe this images', () => this.describeImages()],
            ['describe this screen', () => this.explainScreen()],
            ['capture image', () => this.captureImage()],
            ['take photo', () => this.captureImage()]
        ];

        commandLibrary.forEach(([command, handler]) => {
            this.addVoiceCommandWithVariants(command, handler);
        });
        this.rebuildCommandIndex();

        // Setup Web Speech API for command recognition
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                const transcript = event.results[event.results.length - 1][0].transcript;
                const routeCommand = window.__relayRouteCommandInput;
                if (typeof routeCommand === 'function') {
                    routeCommand(transcript, 'speech-recognition');
                } else {
                    this.processVoiceCommand(transcript, { source: 'speech-recognition', emitEvent: true });
                }
            };

            this.recognition.onerror = (event) => {
                console.log('[BlindMode] Speech recognition error:', event.error);
            };
        }
    }

    startVoiceCommands() {
        if (this.recognition && !this.isListening) {
            this.recognition.start();
            this.isListening = true;
            this.playEarcon('listening-start');
        }
    }

    stopVoiceCommands() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            this.playEarcon('listening-end');
        }
    }

    processVoiceCommand(transcript, options = {}) {
        const source = options.source || 'blind-mode';
        const emitEvent = options.emitEvent === true;
        const baseWordCount = normalizeCommandText(transcript).split(/\s+/).filter(Boolean).length;
        const allowAutocorrect = typeof options.autocorrect === 'boolean'
            ? options.autocorrect
            : (source === 'deepgram'
                ? baseWordCount > 0 && baseWordCount <= 1
                : baseWordCount > 0 && baseWordCount <= 2);
        const disabledCommands = new Set(
            Array.isArray(options.disabledCommands)
                ? options.disabledCommands.map((value) => canonicalizeCommandText(value, { lexicon: this.commandLexicon }))
                : []
        );

        // Normalize/canonicalize: case-insensitive and punctuation-insensitive matching.
        const normalized = canonicalizeCommandText(transcript, {
            lexicon: this.commandLexicon,
            autocorrect: allowAutocorrect
        });
        if (!normalized) {
            return { handled: false, command: null, normalized: '', source };
        }

        const markHandled = (commandKey) => {
            const now = Date.now();
            if (
                this.lastProcessedCommand.key === commandKey &&
                this.lastProcessedCommand.normalized === normalized &&
                (now - this.lastProcessedCommand.timestamp) < 1600
            ) {
                return { handled: false, duplicate: true, command: commandKey, normalized, source };
            }
            this.lastProcessedCommand = { key: commandKey, normalized, timestamp: now };
            this.playEarcon('command-recognized');
            if (emitEvent) {
                window.dispatchEvent(new CustomEvent('command-executed', {
                    detail: {
                        command: commandKey,
                        source,
                        normalized,
                        timestamp: now,
                        success: true
                    }
                }));
            }
            return { handled: true, command: commandKey, normalized, source };
        };

        console.log(`[BlindMode] Processing source=${source} normalized="${normalized}"`);
        const paddedTranscript = ` ${normalized} `;
        const transcriptWordCount = normalized.split(/\s+/).filter(Boolean).length;
        const commandEntries = this.normalizedVoiceCommands.size
            ? this.normalizedVoiceCommands.entries()
            : this.voiceCommands.entries();
        const commandList = [];

        for (const [command, handler] of commandEntries) {
            const normalizedCommand = canonicalizeCommandText(command, { lexicon: this.commandLexicon });
            if (!normalizedCommand) continue;
            if (disabledCommands.has(normalizedCommand)) continue;
            commandList.push([normalizedCommand, handler]);
        }

        // Parametrized target commands: navigate/click by named target.
        if (!disabledCommands.has('navigate') && normalized.startsWith('navigate to ')) {
            const targetPhrase = normalized.slice('navigate to '.length).trim();
            const externalSource = source === 'deepgram' || source === 'speech-recognition' || source === 'gesture-input';
            if (externalSource && this.isLikelyDesktopAppTarget(targetPhrase)) {
                console.log(`[BlindMode] navigate target prefers desktop fallback target="${targetPhrase}" source=${source}`);
                return { handled: false, command: 'navigate', normalized, source, reason: 'target_not_found', desktopPreferred: true };
            }
            const moved = this.navigateToTarget(targetPhrase, {
                announce: !(source === 'deepgram' || source === 'speech-recognition' || source === 'gesture-input')
            });
            if (moved) {
                console.log(`[BlindMode] navigate local target hit target="${targetPhrase}"`);
                return markHandled('navigate');
            }
            console.log(`[BlindMode] navigate target miss target="${targetPhrase}" source=${source}`);
            if (source === 'deepgram' || source === 'speech-recognition' || source === 'gesture-input') {
                return { handled: false, command: 'navigate', normalized, source, reason: 'target_not_found' };
            }
        }
        if (!disabledCommands.has('click') && (normalized.startsWith('click on ') || normalized.startsWith('click '))) {
            const targetPhrase = normalized.startsWith('click on ')
                ? normalized.slice('click on '.length).trim()
                : normalized.slice('click '.length).trim();
            if (targetPhrase) {
                const externalSource = source === 'deepgram' || source === 'speech-recognition' || source === 'gesture-input';
                if (externalSource && this.isLikelyDesktopAppTarget(targetPhrase)) {
                    console.log(`[BlindMode] click target prefers desktop fallback target="${targetPhrase}" source=${source}`);
                    return { handled: false, command: 'click', normalized, source, reason: 'target_not_found', desktopPreferred: true };
                }
                const clicked = this.clickTarget(targetPhrase, {
                    announce: !(source === 'deepgram' || source === 'speech-recognition' || source === 'gesture-input')
                });
                if (clicked) {
                    console.log(`[BlindMode] click local target hit target="${targetPhrase}"`);
                    return markHandled('click');
                }
                console.log(`[BlindMode] click target miss target="${targetPhrase}" source=${source}`);
                if (source === 'deepgram' || source === 'speech-recognition' || source === 'gesture-input') {
                    return { handled: false, command: 'click', normalized, source, reason: 'target_not_found' };
                }
            }
        }

        commandList.sort((a, b) => b[0].length - a[0].length);

        for (const [normalizedCommand, handler] of commandList) {
            // Direct match
            const direct = normalized === normalizedCommand;
            const commandPrefixMatch = normalized.startsWith(`${normalizedCommand} `);
            const phraseBoundaryMatch = paddedTranscript.includes(` ${normalizedCommand} `);
            const allowBoundary = source !== 'deepgram' && source !== 'speech-recognition';

            // For deepgram/speech-recognition, command must be direct or prefix.
            // For gesture-input, phrase-boundary matching remains allowed.
            if (direct || commandPrefixMatch || (allowBoundary && phraseBoundaryMatch)) {
                Promise.resolve(handler()).catch((error) => {
                    console.warn('[BlindMode] Command handler failed:', error?.message || error);
                });
                return markHandled(normalizedCommand);
            }
        }

        // Final fuzzy fallback for short command phrases (typo-tolerant).
        const fuzzyEligible = source !== 'deepgram' && source !== 'speech-recognition' &&
            transcriptWordCount > 0 && transcriptWordCount <= 3;
        if (fuzzyEligible && commandList.length > 0) {
            let best = null;
            for (const [candidateCommand, candidateHandler] of commandList) {
                const commandWordCount = candidateCommand.split(/\s+/).filter(Boolean).length;
                if (Math.abs(commandWordCount - transcriptWordCount) > 1) continue;

                const score = normalizedEditScore(normalized, candidateCommand);
                const maxAllowed = transcriptWordCount === 1 ? 0.34 : 0.28;
                if (score > maxAllowed) continue;

                if (!best || score < best.score) {
                    best = { command: candidateCommand, handler: candidateHandler, score };
                }
            }

            if (best) {
                Promise.resolve(best.handler()).catch((error) => {
                    console.warn('[BlindMode] Fuzzy command handler failed:', error?.message || error);
                });
                return { ...markHandled(best.command), fuzzy: true };
            }
        }

        // Unknown command
        if (this.isActive) {
            this.playEarcon('command-error');
        }
        return { handled: false, command: null, normalized, source };
    }

    // ============================================
    // SCREEN READING
    // ============================================

    async explainScreen() {
        this.playEarcon('processing');

        try {
            let analysis = null;
            if (window.electronAPI?.captureScreen) {
                analysis = await window.electronAPI.captureScreen({
                    mode: 'screen',
                    detail: 'high'
                });
            } else if (window.electronAPI?.explainScreen) {
                analysis = await window.electronAPI.explainScreen();
            }

            const description = analysis?.description || analysis?.explanation || '';
            if (analysis?.success && description) {
                await this.speak(description, 'high');
                return;
            }
            await this.speak('Unable to analyze screen. Please try again.', 'high');
        } catch (e) {
            await this.speak('Unable to analyze screen. Please try again.', 'high');
        }
    }

    async readCaptions() {
        const transcript = document.getElementById('transcript');
        if (transcript) {
            const text = transcript.innerText;
            if (text) {
                await this.speak('Reading captions: ' + text);
            } else {
                await this.speak('No captions available');
            }
        }
    }

    async provideHelp() {
        await this.provideEnhancedHelp();
    }

    // ============================================
    // SPATIAL AUDIO
    // ============================================

    setupSpatialAudio() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.spatialAudio = {
            context: this.audioContext,
            masterGain: this.audioContext.createGain(),
        };
        this.spatialAudio.masterGain.connect(this.audioContext.destination);
    }

    playSpatialSound(soundType, direction = 'center', distance = 1.0) {
        if (!this.options.spatialAudioEnabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const panner = this.audioContext.createStereoPanner();

        // Set direction
        const panValues = {
            'left': -1,
            'center-left': -0.5,
            'center': 0,
            'center-right': 0.5,
            'right': 1
        };
        panner.pan.value = panValues[direction] || 0;

        // Set sound characteristics based on type
        const soundConfigs = {
            'alert': { freq: 880, type: 'sine', duration: 0.3 },
            'notification': { freq: 660, type: 'sine', duration: 0.2 },
            'error': { freq: 220, type: 'sawtooth', duration: 0.4 },
            'success': { freq: 880, type: 'sine', duration: 0.15 },
            'direction': { freq: 440, type: 'sine', duration: 0.5 },
        };

        const config = soundConfigs[soundType] || soundConfigs['notification'];
        oscillator.frequency.value = config.freq;
        oscillator.type = config.type;

        // Apply distance attenuation
        const volume = Math.max(0.1, 1.0 - (distance * 0.3));
        gainNode.gain.setValueAtTime(volume * 0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + config.duration);

        // Connect nodes
        oscillator.connect(panner);
        panner.connect(gainNode);
        gainNode.connect(this.spatialAudio.masterGain);

        // Play
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + config.duration);
    }

    // ============================================
    // EARCONS (AUDIO ICONS)
    // ============================================

    setupEarcons() {
        this.earconSounds = {
            'listening-start': { freq: 440, duration: 0.1 },
            'listening-end': { freq: 330, duration: 0.1 },
            'command-recognized': { freq: 880, duration: 0.05 },
            'command-error': { freq: 220, duration: 0.2 },
            'processing': { freq: 660, duration: 0.3 },
            'mode-change': { freq: [440, 554, 659], duration: 0.4 },
            'alert': { freq: 880, duration: 0.3 },
            'notification': { freq: 523, duration: 0.2 },
        };
    }

    playEarcon(name) {
        if (!this.options.earconsEnabled || !this.audioContext) return;

        const earcon = this.earconSounds[name];
        if (!earcon) return;

        const frequencies = Array.isArray(earcon.freq) ? earcon.freq : [earcon.freq];

        frequencies.forEach((freq, index) => {
            setTimeout(() => {
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();

                oscillator.frequency.value = freq;
                oscillator.type = 'sine';

                gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + earcon.duration);

                oscillator.connect(gainNode);
                gainNode.connect(this.audioContext.destination);

                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + earcon.duration);
            }, index * 50);
        });
    }

    // ============================================
    // KEYBOARD NAVIGATION
    // ============================================

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            if (!this.isActive) return;

            // Alt + Arrow keys for spatial audio navigation
            if (e.altKey) {
                switch(e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        this.playSpatialSound('direction', 'left');
                        this.speak('Left');
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        this.playSpatialSound('direction', 'right');
                        this.speak('Right');
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        this.speak('Up');
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        this.speak('Down');
                        break;
                }
            }

            // Space to toggle voice commands
            if (e.code === 'Space' && e.ctrlKey) {
                e.preventDefault();
                if (this.isListening) {
                    this.stopVoiceCommands();
                    this.speak('Voice commands off');
                } else {
                    this.startVoiceCommands();
                    this.speak('Voice commands on. Say hey relay help for available commands.');
                }
            }

            // Alt + S for summarize page
            if (e.altKey && e.key === 's') {
                e.preventDefault();
                this.summarizePage();
            }

            // Alt + I for describe images
            if (e.altKey && e.key === 'i') {
                e.preventDefault();
                this.describeImages();
            }

            // Alt + C for capture image
            if (e.altKey && e.key === 'c') {
                e.preventDefault();
                this.captureImage();
            }
        });
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    adjustSpeechRate(delta) {
        this.options.speechRate = Math.max(0.5, Math.min(2.0, this.options.speechRate + delta));
        this.speak(`Speech speed ${Math.round(this.options.speechRate * 100)} percent`);
    }

    requestModeSwitch() {
        // Dispatch event for mode switcher
        window.dispatchEvent(new CustomEvent('request-mode-switch'));
        this.speak('Opening mode switcher');
    }

    openSettings() {
        if (window.electronAPI?.openSettings) {
            window.electronAPI.openSettings();
            this.speak('Opening settings');
        } else {
            this.speak('Settings not available');
        }
    }

    repeatLastMessage() {
        if (this.lastSpokenText) {
            this.speak(this.lastSpokenText);
        } else {
            this.speak('No previous message to repeat');
        }
    }

    /**
     * Navigate interactive elements on the page
     */
    isElementVisibleForNavigation(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return false;

        let node = element;
        while (node && node instanceof HTMLElement) {
            if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false;
            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
                return false;
            }
            if (node === document.body) break;
            node = node.parentElement;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    getInteractiveElementsForNavigation() {
        const selector = [
            'button',
            'a[href]',
            'input:not([type="hidden"])',
            'select',
            'textarea',
            '[role="button"]',
            '[tabindex]:not([tabindex="-1"])'
        ].join(', ');

        const candidates = Array.from(document.querySelectorAll(selector))
            .filter((element) => element instanceof HTMLElement)
            .filter((element) => !element.disabled)
            .filter((element) => this.isElementVisibleForNavigation(element))
            .filter((element) => !element.closest('#transcript'))
            .filter((element) => !element.classList.contains('sr-only'));

        const preferredOrder = new Map([
            ['tts-toggle', 1],
            ['tts-input', 2],
            ['tts-output-select', 2],
            ['nav-toggle', 3],
            ['transcript-btn', 4],
            ['mode-indicator', 50],
            ['minimize-btn', 60],
            ['close-btn', 61]
        ]);

        const overlaySet = new Set(
            candidates.filter((element) =>
                Boolean(element.closest('#caption-bar') || element.closest('#gesture-panel') || element.id === 'mode-indicator')
            )
        );
        const overlayCandidates = [...overlaySet];
        const pageCandidates = candidates.filter((element) => !overlaySet.has(element));

        const sortByPreference = (a, b) => {
            const aPriority = preferredOrder.get(a.id) ?? 30;
            const bPriority = preferredOrder.get(b.id) ?? 30;
            if (aPriority !== bPriority) return aPriority - bPriority;
            return 0;
        };
        overlayCandidates.sort(sortByPreference);
        pageCandidates.sort(sortByPreference);
        return [...overlayCandidates, ...pageCandidates];
    }

    describeInteractiveElement(element) {
        if (!(element instanceof HTMLElement)) return 'element';
        return (
            element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            element.getAttribute('placeholder') ||
            element.textContent?.trim() ||
            element.id ||
            element.tagName
        )
            .replace(/\s+/g, ' ')
            .trim() || 'element';
    }

    focusTypeToSpeakInput(options = {}) {
        const announce = options.announce !== false;
        const ttsContainer = document.getElementById('tts-container');
        const ttsToggle = document.getElementById('tts-toggle');
        const ttsInput = document.getElementById('tts-input');
        const containerHasClassList = Boolean(ttsContainer && ttsContainer.classList && typeof ttsContainer.classList.contains === 'function');

        if (!(ttsInput instanceof HTMLElement)) {
            if (announce) {
                this.speak('Type to speak input is not available');
            }
            return false;
        }

        if (containerHasClassList && !ttsContainer.classList.contains('active')) {
            if (ttsToggle instanceof HTMLElement && typeof ttsToggle.click === 'function') {
                ttsToggle.click();
            } else {
                ttsContainer.classList.add('active');
            }
        }

        try {
            ttsInput.focus({ preventScroll: true });
        } catch {
            ttsInput.focus();
        }

        const actionable = this.getInteractiveElementsForNavigation();
        this.navigationIndex = actionable.indexOf(ttsInput);
        this.lastFocusedElement = ttsInput;
        if (announce) {
            this.speak('Text box ready');
        }
        return true;
    }

    findNavigationTarget(targetPhrase) {
        const normalizedTarget = normalizeCommandText(targetPhrase);
        if (!normalizedTarget) return null;

        if (
            normalizedTarget.includes('text box') ||
            normalizedTarget.includes('textbox') ||
            normalizedTarget.includes('type to speak')
        ) {
            const ttsInput = document.getElementById('tts-input');
            if (ttsInput instanceof HTMLElement) return ttsInput;
        }

        const stopWords = new Set(['to', 'the', 'on', 'in', 'at', 'a', 'an', 'please']);
        const targetTokens = normalizedTarget.split(/\s+/).filter((token) => token && !stopWords.has(token));
        const elements = this.getInteractiveElementsForNavigation();

        let best = null;
        let bestScore = 0;
        for (const element of elements) {
            const label = normalizeCommandText(this.describeInteractiveElement(element));
            if (!label) continue;

            let score = label.includes(normalizedTarget) ? 3 : 0;
            targetTokens.forEach((token) => {
                if (label.includes(token)) score += 1;
            });
            if (score > bestScore) {
                bestScore = score;
                best = element;
            }
        }

        return bestScore > 0 ? best : null;
    }

    isLikelyDesktopAppTarget(targetPhrase) {
        const normalizedTarget = normalizeCommandText(targetPhrase);
        if (!normalizedTarget) return false;

        if (
            normalizedTarget.includes('text box') ||
            normalizedTarget.includes('textbox') ||
            normalizedTarget.includes('type to speak') ||
            normalizedTarget.includes('input')
        ) {
            return false;
        }

        const desktopAppHints = [
            'messages',
            'google chrome',
            'chrome',
            'safari',
            'finder',
            'terminal',
            'visual studio code',
            'vscode',
            'slack',
            'discord',
            'zoom',
            'facetime',
            'mail',
            'notes',
            'youtube',
            'spotify',
            'firefox'
        ];

        return desktopAppHints.some((hint) => normalizedTarget.includes(hint));
    }

    navigateToTarget(targetPhrase, options = {}) {
        const announce = options.announce !== false;
        const target = this.findNavigationTarget(targetPhrase);
        if (!(target instanceof HTMLElement)) {
            if (announce) {
                this.speak('Target not found');
            }
            return false;
        }

        if (target.id === 'tts-input') {
            return this.focusTypeToSpeakInput({ announce: true });
        }

        try {
            target.focus({ preventScroll: true });
        } catch {
            target.focus();
        }
        this.lastFocusedElement = target;
        const elements = this.getInteractiveElementsForNavigation();
        this.navigationIndex = elements.indexOf(target);
        if (announce) {
            this.speak('Control focused');
        }
        return true;
    }

    clickTarget(targetPhrase, options = {}) {
        const announce = options.announce !== false;
        const target = this.findNavigationTarget(targetPhrase);
        if (!(target instanceof HTMLElement)) {
            if (announce) {
                this.speak('Target not found');
            }
            return false;
        }

        if (target.id === 'tts-input') {
            this.focusTypeToSpeakInput({ announce: false });
        } else {
            try {
                target.focus({ preventScroll: true });
            } catch {
                target.focus();
            }
        }

        this.lastFocusedElement = target;
        if (typeof target.click === 'function') {
            target.click();
        }
        if (announce) {
            this.speak('Control activated');
        }
        return true;
    }

    navigatePage() {
        const elements = this.getInteractiveElementsForNavigation();
        if (elements.length === 0) {
            this.speak('No interactive elements found');
            return;
        }

        // Move focus to next actionable element in a stable cycle.
        const current = document.activeElement;
        const currentIndex = elements.indexOf(current);
        if (currentIndex >= 0) {
            this.navigationIndex = currentIndex;
        }
        const nextIndex = (this.navigationIndex + 1 + elements.length) % elements.length;
        this.navigationIndex = nextIndex;
        let target = elements[nextIndex];

        // First-step usability improvement: if Type-to-Speak toggle is focused,
        // open and move focus directly into the text input.
        if (target?.id === 'tts-toggle') {
            const ttsContainer = document.getElementById('tts-container');
            const ttsInput = document.getElementById('tts-input');
            const canToggleContainer = Boolean(ttsContainer && ttsContainer.classList && typeof ttsContainer.classList.contains === 'function');
            if (canToggleContainer && !ttsContainer.classList.contains('active')) {
                if (typeof target.click === 'function') target.click();
                ttsContainer.classList.add('active');
            }
            if (ttsInput instanceof HTMLElement && this.isElementVisibleForNavigation(ttsInput)) {
                target = ttsInput;
                this.navigationIndex = elements.indexOf(target);
            }
        }

        try {
            target.focus({ preventScroll: true });
        } catch {
            target.focus();
        }
        this.lastFocusedElement = target;

        if (typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }

        this.speak('Control focused');
    }

    /**
     * Click the currently focused element
     */
    clickFocusedElement() {
        const actionable = this.getInteractiveElementsForNavigation();
        if (actionable.length === 0) {
            this.speak('No interactive elements found');
            return;
        }

        let target = document.activeElement;
        if (!(target instanceof HTMLElement) || !actionable.includes(target)) {
            if (this.lastFocusedElement instanceof HTMLElement && actionable.includes(this.lastFocusedElement)) {
                target = this.lastFocusedElement;
            } else {
                const fallbackIndex = this.navigationIndex >= 0 ? this.navigationIndex % actionable.length : 0;
                target = actionable[fallbackIndex];
            }
            try {
                target.focus({ preventScroll: true });
            } catch {
                target.focus();
            }
        }
        this.lastFocusedElement = target;

        if (typeof target.click === 'function') {
            target.click();
        }

        this.speak('Control activated');
    }

    /**
     * Scroll the page
     */
    scrollPage(direction) {
        const amount = direction === 'up' ? -300 : 300;
        window.scrollBy({ top: amount, behavior: 'smooth' });
        this.speak(`Scrolling ${direction}`);
    }

    /**
     * Start listening for audio
     */
    startListening() {
        this.speak('Listening mode active. Captions will be read aloud.');
    }

    /**
     * Toggle meeting mode
     */
    toggleMeeting() {
        window.dispatchEvent(new CustomEvent('action-request', {
            detail: { action: 'meeting-toggle', source: 'blind-mode' }
        }));
        this.speak('Meeting mode toggled');
    }

    /**
     * Open transcript viewer
     */
    openTranscripts() {
        if (window.electronAPI?.openTranscriptViewer) {
            window.electronAPI.openTranscriptViewer();
            this.speak('Opening transcripts');
        } else {
            this.speak('Transcript viewer not available');
        }
    }

    /**
     * Adjust caption size
     */
    adjustCaptionSize(direction) {
        const action = direction === 'larger' ? 'caption-larger' : 'caption-smaller';
        window.dispatchEvent(new CustomEvent('action-request', {
            detail: { action, source: 'blind-mode' }
        }));
        this.speak(`Captions ${direction}`);
    }

    // ============================================
    // NEW ACCESSIBILITY FEATURES
    // ============================================

    /**
     * Summarize the current page
     */
    async summarizePage() {
        this.playEarcon('processing');
        try {
            // Import and use PageSummarizer
            const { PageSummarizer } = await import('./page-summarizer.js');
            const summarizer = new PageSummarizer(this);
            await summarizer.speakSummary();
        } catch (error) {
            console.error('[BlindMode] Summarize error:', error);
            this.speak('Unable to summarize page. Please try again.', 'high');
        }
    }

    /**
     * Describe images on the page
     */
    async describeImages() {
        const now = Date.now();
        if (this.describeImagesInFlight || (now - this.lastDescribeImagesAt) < 12000) {
            return;
        }
        this.describeImagesInFlight = true;
        this.lastDescribeImagesAt = now;
        this.playEarcon('processing');
        try {
            const { ImageDescriber } = await import('./image-describer.js');
            const describer = new ImageDescriber(this);
            await describer.describePageImages();
        } catch (error) {
            console.error('[BlindMode] Image describe error:', error);
            this.speak('Unable to describe images. Please try again.', 'high');
        } finally {
            this.describeImagesInFlight = false;
        }
    }

    /**
     * Capture and describe image from camera
     */
    async captureImage() {
        const now = Date.now();
        if (this.captureImageInFlight || (now - this.lastCaptureImageAt) < 12000) {
            return;
        }
        this.captureImageInFlight = true;
        this.lastCaptureImageAt = now;
        this.playEarcon('processing');
        this.speak('Capturing image...');
        try {
            const { ImageDescriber } = await import('./image-describer.js');
            const describer = new ImageDescriber(this);
            await describer.captureFromCamera();
        } catch (error) {
            console.error('[BlindMode] Camera capture error:', error);
            this.speak('Unable to capture image. Please check camera permissions.', 'high');
        } finally {
            this.captureImageInFlight = false;
        }
    }

    /**
     * Enhanced help with new features
     */
    async provideEnhancedHelp() {
        const helpText = `
            Relay Blind Mode. Available commands:
            Say "help" to hear this message again.
            Say "read" or "caption" to hear the current captions.
            Say "navigate" to move focus to interactive elements.
            Say "click" to click the focused element.
            Say "scroll" or "scroll up" to scroll the page.
            Say "stop" to stop speech.
            Say "listen" to start listening mode.
            Say "repeat" to hear the last message again.
            Say "explain" to hear what's on your screen.
            Say "meeting" to toggle meeting mode.
            Say "settings" to open preferences.
            Say "larger" or "smaller" to adjust caption size.
            Say "summarize page" to get a page summary.
            Say "describe images" to hear image descriptions.
            Say "capture image" to take a photo and describe it.
            Say "increase speech speed" or "decrease speech speed" to adjust rate.
            Say "switch mode" to change accessibility mode.
        `;
        await this.speak(helpText);
    }

    // ============================================
    // ACTIVATION / DEACTIVATION
    // ============================================

    activate() {
        this.isActive = true;
        this.navigationIndex = -1;
        this.lastFocusedElement = null;
        if (!this.audioContext) {
            this.setupSpatialAudio();
        }
        if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
        }
        this.startVoiceCommands();
        this.playEarcon('mode-change');

        // Announce activation
        setTimeout(() => {
            this.speak('Blind mode activated. Voice navigation enabled. Say hey relay help for commands.', 'critical');
        }, 500);

        // Add blind mode class to body
        document.body.classList.add('blind-mode-active');
    }

    deactivate() {
        this.isActive = false;
        this.navigationIndex = -1;
        this.lastFocusedElement = null;
        this.stopVoiceCommands();
        this.stopSpeaking();
        document.body.classList.remove('blind-mode-active');
    }

    // Handle mode changes
    onModeChange(mode) {
        if (mode === 'blind') {
            if (!this.isActive) this.activate();
        } else {
            if (this.isActive) this.deactivate();
        }
    }
}

// Export for use in other modules
export default BlindMode;
