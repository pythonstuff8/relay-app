#!/usr/bin/env node

/**
 * Verifies BlindMode command recognition/execution one-by-one.
 * - Tests every command in the command library
 * - Tests capitalization + punctuation variants
 * - Tests typo aliases for the required command set
 * - Tests blind-mode transcript disable behavior
 * - Tests action dispatch wiring for key UI actions
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const blindModePath = path.resolve(__dirname, '../renderer/blind-mode.js');
const source = fs.readFileSync(blindModePath, 'utf8');

function fail(message) {
    throw new Error(message);
}

function parseCommandLibrary(fileText) {
    const match = fileText.match(/const commandLibrary = \[(.*?)\n\s*];/s);
    if (!match) fail('Unable to locate commandLibrary in blind-mode.js');

    const body = match[1];
    const entryPattern = /\[\s*'([^']+)'\s*,\s*\(\)\s*=>\s*this\.([A-Za-z0-9_]+)\(([^)]*)\)\s*]/g;
    const entries = [];
    let m;
    while ((m = entryPattern.exec(body)) !== null) {
        entries.push({
            phrase: m[1],
            method: m[2],
            rawArgs: m[3].trim()
        });
    }

    if (entries.length === 0) fail('Failed to parse any command entries from commandLibrary');
    return entries;
}

function buildBlindModeClass(fileText) {
    const transformed = fileText
        .replace('export class BlindMode', 'class BlindMode')
        .replace('export default BlindMode;', '');
    const wrapped = `${transformed}
module.exports = { BlindMode };
`;

    const emittedEvents = [];
    class FakeHTMLElement {
        constructor(id = '') {
            this.id = id;
            this.disabled = false;
            this.parentElement = null;
            this.style = {};
            this.attributes = {};
            this.classList = { contains: () => false };
            this.textContent = '';
        }
        hasAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this.attributes, name);
        }
        getAttribute(name) {
            return this.attributes[name] ?? null;
        }
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        }
        closest() {
            return null;
        }
        getBoundingClientRect() {
            return { width: 120, height: 28 };
        }
    }

    const windowStub = {
        speechSynthesis: {
            getVoices: () => [],
            cancel: () => {},
            speak: () => {},
            onvoiceschanged: null
        },
        AudioContext: undefined,
        webkitAudioContext: undefined,
        scrollBy: () => {},
        getComputedStyle: () => ({
            display: 'block',
            visibility: 'visible',
            pointerEvents: 'auto'
        }),
        dispatchEvent: (event) => {
            emittedEvents.push(event);
            return true;
        }
    };

    class SpeechSynthesisUtterance {
        constructor(text) {
            this.text = text;
            this.rate = 1;
            this.pitch = 1;
            this.voice = null;
            this.volume = 1;
            this.onend = null;
            this.onerror = null;
        }
    }

    class CustomEventShim {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    }

    const documentBody = new FakeHTMLElement('body');
    const documentStub = {
        body: documentBody,
        activeElement: null,
        addEventListener: () => {},
        querySelectorAll: () => [],
        getElementById: () => ({ innerText: '' })
    };

    const context = {
        module: { exports: {} },
        exports: {},
        require,
        console: {
            ...console,
            log: () => {}
        },
        setTimeout,
        clearTimeout,
        Date,
        window: windowStub,
        document: documentStub,
        HTMLElement: FakeHTMLElement,
        SpeechSynthesisUtterance,
        CustomEvent: CustomEventShim
    };
    vm.createContext(context);
    vm.runInContext(wrapped, context, { filename: blindModePath });
    const BlindMode = context.module.exports.BlindMode;
    if (!BlindMode) fail('Failed to load BlindMode class from blind-mode.js');

    return { BlindMode, emittedEvents, windowStub, documentStub, FakeHTMLElement };
}

function capitalizePhrase(phrase) {
    if (!phrase) return phrase;
    return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`;
}

function run() {
    const verbose = process.argv.includes('--verbose');
    const commandEntries = parseCommandLibrary(source);
    const { BlindMode, emittedEvents, documentStub, FakeHTMLElement } = buildBlindModeClass(source);

    const blind = new BlindMode({
        earconsEnabled: false,
        spatialAudioEnabled: false
    });
    blind.isActive = true;

    const commandResults = [];
    let totalChecks = 0;

    const uniquePhrases = Array.from(new Map(commandEntries.map((entry) => [entry.phrase, entry])).values());

    for (const entry of uniquePhrases) {
        const originalMethod = blind[entry.method];
        if (typeof originalMethod !== 'function') {
            fail(`Missing handler method "${entry.method}" for phrase "${entry.phrase}"`);
        }

        let calls = 0;
        let receivedArgs = [];
        blind[entry.method] = (...args) => {
            calls += 1;
            receivedArgs.push(args);
            return undefined;
        };

        const variants = [
            entry.phrase,
            `${capitalizePhrase(entry.phrase)}.`,
            `${entry.phrase}!`,
            `${capitalizePhrase(entry.phrase)}?`
        ];

        variants.forEach((variant) => {
            blind.lastProcessedCommand = { key: '', timestamp: 0 };
            const result = blind.processVoiceCommand(variant, { source: 'verify', emitEvent: false });
            totalChecks += 1;
            if (!result || result.handled !== true) {
                fail(`Command failed for variant "${variant}" (canonical phrase "${entry.phrase}")`);
            }
        });

        if (calls < variants.length) {
            fail(`Handler "${entry.method}" was not executed for every variant of "${entry.phrase}"`);
        }

        if (entry.rawArgs) {
            // Ensure argument-bearing handlers still receive their configured arg.
            const stripped = entry.rawArgs.replace(/['"]/g, '');
            const numeric = Number(stripped);
            const expectedArg = Number.isFinite(numeric) && stripped !== '' ? numeric : stripped;
            const seen = receivedArgs.some((args) => String(args[0]) === String(expectedArg));
            if (!seen) {
                fail(`Handler "${entry.method}" for "${entry.phrase}" did not receive expected arg "${expectedArg}"`);
            }
        }

        blind[entry.method] = originalMethod;
        commandResults.push({
            phrase: entry.phrase,
            method: entry.method,
            checks: variants.length
        });
    }

    // Typos and alias variants for required command set.
    const typoChecks = [
        'Halp.',
        'Reed.',
        'Captino.',
        'Navagate.',
        'Clik.',
        'Scrol.',
        'Stpo.',
        'Lisen.',
        'Repat.',
        'Explian.',
        'Meting.',
        'Transcipt.',
        'Setings.',
        'Largar.',
        'Smaler.'
    ];
    typoChecks.forEach((phrase) => {
        blind.lastProcessedCommand = { key: '', timestamp: 0 };
        const result = blind.processVoiceCommand(phrase, { source: 'verify', emitEvent: false });
        totalChecks += 1;
        if (!result || result.handled !== true) {
            fail(`Typo alias failed: "${phrase}"`);
        }
    });

    // Blind mode requirement: transcript commands disabled.
    ['Transcript.', 'Transcripts.', 'Transcipt.'].forEach((phrase) => {
        blind.lastProcessedCommand = { key: '', timestamp: 0 };
        const result = blind.processVoiceCommand(phrase, {
            source: 'verify',
            emitEvent: false,
            disabledCommands: ['transcript', 'transcripts']
        });
        totalChecks += 1;
        if (result && result.handled === true) {
            fail(`Transcript command should be disabled in blind mode for "${phrase}"`);
        }
    });

    // Action dispatch sanity checks for commands that must trigger app actions.
    emittedEvents.length = 0;
    blind.lastProcessedCommand = { key: '', timestamp: 0 };
    blind.processVoiceCommand('Stop.', { source: 'verify', emitEvent: false });
    blind.lastProcessedCommand = { key: '', timestamp: 0 };
    blind.processVoiceCommand('Larger.', { source: 'verify', emitEvent: false });
    blind.lastProcessedCommand = { key: '', timestamp: 0 };
    blind.processVoiceCommand('Smaller.', { source: 'verify', emitEvent: false });
    blind.lastProcessedCommand = { key: '', timestamp: 0 };
    blind.processVoiceCommand('Meeting.', { source: 'verify', emitEvent: false });

    const actionEvents = emittedEvents
        .filter((event) => event?.type === 'action-request')
        .map((event) => event?.detail?.action);

    ['stop-all', 'caption-larger', 'caption-smaller', 'meeting-toggle'].forEach((action) => {
        if (!actionEvents.includes(action)) {
            fail(`Expected action-request "${action}" was not dispatched`);
        }
    });

    // Deterministic navigate/click scenario test.
    const focusedSequence = [];
    const clickedSequence = [];
    const makeEl = (id, label) => {
        const el = new FakeHTMLElement(id);
        el.textContent = label;
        el.focus = () => {
            documentStub.activeElement = el;
            focusedSequence.push(id);
        };
        el.click = () => clickedSequence.push(id);
        el.closest = (selector) => {
            if (selector === '#caption-bar') {
                return ['tts-toggle', 'tts-input', 'nav-toggle', 'transcript-btn', 'mode-indicator', 'minimize-btn', 'close-btn'].includes(id)
                    ? el
                    : null;
            }
            if (selector === '#gesture-panel') return null;
            if (selector === '#transcript') return null;
            return null;
        };
        return el;
    };

    const toolbarTtsToggle = makeEl('tts-toggle', 'Type to Speak');
    toolbarTtsToggle.id = 'tts-toggle';
    const toolbarTtsInput = makeEl('tts-input', 'Type Input');
    toolbarTtsInput.id = 'tts-input';
    const toolbarNav = makeEl('nav-toggle', 'Guide');
    toolbarNav.id = 'nav-toggle';
    const pageButton = makeEl('page-action', 'Page Action');

    documentStub.querySelectorAll = () => [toolbarTtsToggle, toolbarTtsInput, toolbarNav, pageButton];
    documentStub.activeElement = documentStub.body;

    blind.lastProcessedCommand = { key: '', timestamp: 0 };
    const navOne = blind.processVoiceCommand('Navigate.', { source: 'verify', emitEvent: false });
    totalChecks += 1;
    if (!navOne || navOne.handled !== true || documentStub.activeElement !== toolbarTtsToggle) {
        fail('Navigate did not focus first deterministic overlay control');
    }

    blind.lastProcessedCommand = { key: '', timestamp: 0 };
    const navTwo = blind.processVoiceCommand('Navigate.', { source: 'verify', emitEvent: false });
    totalChecks += 1;
    if (!navTwo || navTwo.handled !== true || documentStub.activeElement !== toolbarTtsInput) {
        fail('Navigate did not advance to next deterministic control');
    }

    // Simulate focus loss and verify guarded click fallback.
    documentStub.activeElement = documentStub.body;
    blind.lastProcessedCommand = { key: '', timestamp: 0 };
    const clickResult = blind.processVoiceCommand('Click.', { source: 'verify', emitEvent: false });
    totalChecks += 1;
    if (!clickResult || clickResult.handled !== true) {
        fail('Click command failed during focused-element sanity check');
    }
    if (!clickedSequence.includes('tts-input')) {
        fail('Click did not use last navigated element fallback after focus loss');
    }

    console.log(`Verified ${commandResults.length} unique commands successfully.`);
    console.log(`Total checks passed: ${totalChecks}`);
    if (verbose) {
        commandResults
            .sort((a, b) => a.phrase.localeCompare(b.phrase))
            .forEach((item) => {
                console.log(`PASS ${item.phrase} -> ${item.method} (${item.checks} variants)`);
            });
    }
}

try {
    run();
} catch (error) {
    console.error(`[verify-voice-commands] ${error.message}`);
    process.exit(1);
}
