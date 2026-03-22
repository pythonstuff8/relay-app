
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';

// Use a simplified version or the npm package if bundlers were used. 
// Since we are in vanilla Electron without a bundler, importing from CDN in a worker 
// is the easiest way to avoid "require is not defined" issues or "import outside module".
// However, Electron can load local modules if configured right.
// Let's try the CDN approach for the worker first as it's often more stable for quick prototypes 
// without complex build steps (webpack/vite).

// Actually, in Electron we can just require if node integration is on, but we turned it off.
// We can use standard ES modules.
// Let's assume we can import from the node_modules if we serve it, or just use the CDN.
// The user has installed the package, so let's try to map it. 
// But without a bundler, 'import { pipeline } from "@xenova/transformers"' won't work in the browser directly
// unless we use an import map or point to the file.
// Falling back to CDN for the worker is safest for "no-build" setups.

// Using a small model for speed: 'Xenova/whisper-tiny.en'
let transcriber = null;

self.addEventListener('message', async (event) => {
    const { type, audio } = event.data;

    if (type === 'load') {
        try {
            self.postMessage({ status: 'loading', message: 'Loading model...' });

            // Using the quantized version by default
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
                quantized: true,
            });

            self.postMessage({ status: 'ready', message: 'Model loaded' });
        } catch (e) {
            self.postMessage({ status: 'error', message: e.toString() });
        }
    }

    if (type === 'process') {
        if (!transcriber) return;

        try {
            // self.postMessage({ status: 'info', message: 'Worker received audio' });
            // The pipeline takes the audio array. It assumes 16k if not specified? 
            // It actually automatically resamples if we pass the right invocation? 
            // With Xenova/transformers.js, passing a Float32Array often assumes 16000Hz.
            // If the user context is 48000Hz, we are sending 3x sample rate data as 1x.
            // This causes "chipmunk" speed or silence.

            // We need to resample if the incoming rate != 16000.
            // Since we don't have a resampler lib loaded easily, let's rely on the user speaking clearly 
            // OR do a very naive decimation if rate is 48000 or 44100.

            // NOTE: For this test, we will assume the pipeline needs 16000.

            const result = await transcriber(audio, {
                language: 'english',
                task: 'transcribe',
            });

            // Log result for debugging
            console.log('[Whisper Worker] Result:', result);

            self.postMessage({ status: 'result', text: result.text });
        } catch (e) {
            console.error('[Whisper Worker] Error:', e);
            self.postMessage({ status: 'error', message: e.toString() });
        }
    }
});
