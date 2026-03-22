let tasksVisionPromise = null;

function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function median(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeGestureName(name) {
    return String(name || '')
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function toLabel(name) {
    const normalized = String(name || '').trim().replace(/_/g, ' ');
    if (!normalized) return '';
    return normalized
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
        .join(' ');
}

function resolveBox(landmarks = []) {
    if (!Array.isArray(landmarks) || landmarks.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;

    landmarks.forEach((point) => {
        const x = Number(point?.x || 0);
        const y = Number(point?.y || 0);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    });

    return {
        x: Math.max(0, Math.min(1, minX)),
        y: Math.max(0, Math.min(1, minY)),
        width: Math.max(0, Math.min(1, maxX) - Math.max(0, Math.min(1, minX))),
        height: Math.max(0, Math.min(1, maxY) - Math.max(0, Math.min(1, minY)))
    };
}

async function loadTasksVision() {
    if (!tasksVisionPromise) {
        const moduleUrl = new URL('../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs', import.meta.url);
        tasksVisionPromise = import(moduleUrl.href);
    }
    return tasksVisionPromise;
}

export class MediaPipeGestureInput {
    constructor(options = {}) {
        this.options = {
            minConfidence: 0.7,
            numHands: 2,
            commandCandidateMinConfidence: 0.7,
            minBoxArea: 0.008,
            noHandGraceMs: 420,
            commandStabilityFrames: 2,
            modelAssetPath: '../assets/models/gesture_recognizer.task',
            wasmPath: '../node_modules/@mediapipe/tasks-vision/wasm',
            commandMap: {
                thumb_up: 'yes',
                thumbup: 'yes',
                thumb_down: 'no',
                thumbdown: 'no',
                open_palm: 'stop',
                openpalm: 'stop',
                pointing_up: 'click',
                pointingup: 'click',
                i_love_you: 'i love you',
                ilove_you: 'i love you',
                iloveyou: 'i love you',
                victory: 'victory',
                closed_fist: 'closed fist',
                closedfist: 'closed fist'
            },
            ...options
        };

        this.panelEl = document.getElementById('gesture-panel');
        this.videoEl = document.getElementById('gesture-input-video');
        this.canvasEl = document.getElementById('gesture-overlay-canvas');
        this.statusEl = document.getElementById('gesture-status');
        this.resultsEl = document.getElementById('gesture-results');

        this.stream = null;
        this.recognizer = null;
        this.running = false;
        this.rafId = null;
        this.lastVideoTime = -1;

        this.DrawingUtils = null;
        this.GestureRecognizer = null;
        this.drawingUtils = null;

        this.metrics = {
            frames: 0,
            windowStartTs: performance.now(),
            inferenceSamples: [],
            lastTelemetryTs: 0
        };

        this.lastStableHands = [];
        this.lastStableHandsTs = 0;
        this.commandStabilityState = {
            key: '',
            frames: 0
        };
        this.lastStatusText = '';
    }

    async ensureRecognizer() {
        if (this.recognizer) return;

        const tasksVision = await loadTasksVision();
        const { FilesetResolver, GestureRecognizer, DrawingUtils } = tasksVision;

        const wasmBase = new URL(this.options.wasmPath, import.meta.url).href.replace(/\/?$/, '/');
        const vision = await FilesetResolver.forVisionTasks(wasmBase);
        const modelAssetPath = new URL(this.options.modelAssetPath, import.meta.url).href;

        this.recognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath },
            runningMode: 'VIDEO',
            numHands: Math.max(1, Number(this.options.numHands || 2)),
            minHandDetectionConfidence: 0.35,
            minHandPresenceConfidence: 0.35,
            minTrackingConfidence: 0.35
        });

        this.DrawingUtils = DrawingUtils;
        this.GestureRecognizer = GestureRecognizer;
    }

    setStatus(text) {
        const nextText = String(text || '').trim();
        if (nextText === this.lastStatusText) return;
        this.lastStatusText = nextText;
        if (this.statusEl) {
            this.statusEl.textContent = nextText;
        }
    }

    ensureCanvasSize() {
        if (!this.canvasEl || !this.videoEl) return;

        const width = this.videoEl.videoWidth || 0;
        const height = this.videoEl.videoHeight || 0;
        if (!width || !height) return;

        if (this.canvasEl.width !== width || this.canvasEl.height !== height) {
            this.canvasEl.width = width;
            this.canvasEl.height = height;
        }
    }

    drawHands(hands = []) {
        if (!this.canvasEl) return;

        const ctx = this.canvasEl.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

        if (!this.DrawingUtils || !this.GestureRecognizer) return;
        if (!this.drawingUtils) {
            this.drawingUtils = new this.DrawingUtils(ctx);
        }

        hands.forEach((hand) => {
            const showLabel = hand.labelVisible;
            const stroke = showLabel ? '#33d17a' : '#f5f5f7';

            this.drawingUtils.drawConnectors(hand.landmarks, this.GestureRecognizer.HAND_CONNECTIONS, {
                color: stroke,
                lineWidth: 2
            });
            this.drawingUtils.drawLandmarks(hand.landmarks, {
                color: stroke,
                fillColor: '#0b0f16',
                radius: 3,
                lineWidth: 1
            });

            const x = Math.round(hand.bbox.x * this.canvasEl.width);
            const y = Math.round(hand.bbox.y * this.canvasEl.height);
            const width = Math.round(hand.bbox.width * this.canvasEl.width);
            const height = Math.round(hand.bbox.height * this.canvasEl.height);

            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);

            if (!showLabel) return;

            const text = `${hand.label} ${Math.round(hand.confidence * 100)}%`;
            ctx.font = '600 12px "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif';
            const textMetrics = ctx.measureText(text);
            const textWidth = Math.ceil(textMetrics.width + 12);
            const textHeight = 20;
            const textX = Math.max(4, x);
            const textY = Math.max(textHeight + 4, y);

            ctx.fillStyle = 'rgba(8, 11, 18, 0.82)';
            ctx.fillRect(textX, textY - textHeight, textWidth, textHeight);
            ctx.fillStyle = '#f5f5f7';
            ctx.fillText(text, textX + 6, textY - 6);
        });
    }

    updateResultList(hands = [], selectedCandidate = null) {
        if (!this.resultsEl) return;

        if (!Array.isArray(hands) || hands.length === 0) {
            this.resultsEl.innerHTML = '<div class="gesture-result-item">No hand detected</div>';
            return;
        }

        const lines = hands.map((hand, index) => {
            const confidencePct = Math.round(clamp01(hand.confidence) * 100);
            const descriptor = hand.labelVisible
                ? `${hand.label} (${confidencePct}%)`
                : `Low confidence (${confidencePct}%)`;
            const candidateBadge = selectedCandidate && selectedCandidate.handIndex === index
                ? ` <span class="gesture-route-badge">route: ${selectedCandidate.command}</span>`
                : '';

            return `<div class="gesture-result-item"><strong>${escapeHtml(hand.handedness)}</strong>: ${escapeHtml(descriptor)}${candidateBadge}</div>`;
        });

        this.resultsEl.innerHTML = lines.join('');
    }

    stabilizeCommandCandidate(candidate) {
        const requiredFrames = Math.max(1, Number(this.options.commandStabilityFrames || 2));
        if (!candidate) {
            this.commandStabilityState = { key: '', frames: 0 };
            return null;
        }

        const key = `${candidate.command}:${candidate.handedness}:${candidate.gesture}`;
        if (this.commandStabilityState.key === key) {
            this.commandStabilityState.frames += 1;
        } else {
            this.commandStabilityState = { key, frames: 1 };
        }

        if (this.commandStabilityState.frames < requiredFrames) {
            return null;
        }
        return candidate;
    }

    parseResult(result, timestampMs) {
        const nowTs = Number.isFinite(timestampMs) ? Math.round(timestampMs) : Date.now();
        const landmarksByHand = Array.isArray(result?.landmarks) ? result.landmarks : [];
        const handednessByHand = Array.isArray(result?.handedness) ? result.handedness : [];
        const gesturesByHand = Array.isArray(result?.gestures) ? result.gestures : [];

        const liveHands = landmarksByHand.map((landmarks, index) => {
            const handedness = handednessByHand[index]?.[0]?.categoryName || 'Unknown';
            const topGesture = gesturesByHand[index]?.[0] || null;
            const gestureName = String(topGesture?.categoryName || 'None').trim();
            const confidence = clamp01(topGesture?.score || 0);
            const normalizedGesture = normalizeGestureName(gestureName);
            const labelVisible = confidence >= this.options.minConfidence && normalizedGesture !== 'none';
            const bbox = resolveBox(landmarks);
            const bboxArea = Number((bbox.width * bbox.height).toFixed(5));

            return {
                index,
                handedness,
                gesture: gestureName,
                gestureId: normalizedGesture,
                label: toLabel(gestureName),
                confidence,
                labelVisible,
                bbox,
                bboxArea,
                landmarks: Array.isArray(landmarks) ? landmarks : []
            };
        }).filter((hand) => hand.bboxArea >= Number(this.options.minBoxArea || 0));

        if (liveHands.length > 0) {
            this.lastStableHands = liveHands.map((hand) => ({ ...hand }));
            this.lastStableHandsTs = nowTs;
        }

        let noHandDetected = liveHands.length === 0;
        let displayHands = liveHands;
        if (
            noHandDetected &&
            this.lastStableHands.length > 0 &&
            (nowTs - this.lastStableHandsTs) <= Math.max(0, Number(this.options.noHandGraceMs || 420))
        ) {
            displayHands = this.lastStableHands.map((hand, index) => ({ ...hand, index }));
            noHandDetected = false;
        }

        const liveCandidate = this.selectCommandCandidate(liveHands);
        const selectedCandidate = this.stabilizeCommandCandidate(liveCandidate);

        return {
            timestamp: nowTs,
            status: noHandDetected ? 'Show your hand to camera' : 'Hand detected',
            noHandDetected,
            hands: displayHands,
            selectedCommandCandidate: selectedCandidate
        };
    }

    selectCommandCandidate(hands = []) {
        const threshold = clamp01(this.options.commandCandidateMinConfidence);
        const scored = hands
            .map((hand) => {
                const command = this.options.commandMap[hand.gestureId] || null;
                if (!command || !hand.labelVisible || hand.confidence < threshold) {
                    return null;
                }
                return {
                    handIndex: hand.index,
                    handedness: hand.handedness,
                    gesture: hand.gesture,
                    confidence: hand.confidence,
                    command
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.confidence - a.confidence);

        return scored[0] || null;
    }

    emitGestureInput(detail) {
        window.dispatchEvent(new CustomEvent('gesture-input', { detail }));
    }

    emitTelemetry(force = false) {
        const now = performance.now();
        if (!force && (now - this.metrics.lastTelemetryTs) < 1000) return;
        this.metrics.lastTelemetryTs = now;

        const elapsedSec = Math.max(0.001, (now - this.metrics.windowStartTs) / 1000);
        const fps = this.metrics.frames / elapsedSec;
        const inferenceMedian = median(this.metrics.inferenceSamples);

        window.dispatchEvent(new CustomEvent('gesture-model-health', {
            detail: {
                fps: Number(fps.toFixed(2)),
                inference_ms_median: Number(inferenceMedian.toFixed(3)),
                frames: this.metrics.frames,
                timestamp: Date.now(),
                backend: 'mediapipe_gesture_recognizer_video'
            }
        }));

        if (force || this.metrics.frames > 360) {
            this.metrics.frames = 0;
            this.metrics.windowStartTs = now;
            this.metrics.inferenceSamples = [];
        }
    }

    processFrame = () => {
        if (!this.running || !this.videoEl || !this.recognizer) return;

        if (this.videoEl.readyState < 2) {
            this.rafId = requestAnimationFrame(this.processFrame);
            return;
        }

        const currentVideoTime = Number(this.videoEl.currentTime || 0);
        if (currentVideoTime === this.lastVideoTime) {
            this.rafId = requestAnimationFrame(this.processFrame);
            return;
        }
        this.lastVideoTime = currentVideoTime;

        this.ensureCanvasSize();

        const inferenceStart = performance.now();
        let detail;
        try {
            const result = this.recognizer.recognizeForVideo(this.videoEl, inferenceStart);
            detail = this.parseResult(result, Date.now());
        } catch (error) {
            this.setStatus(`Gesture recognition error: ${error?.message || 'unknown'}`);
            this.rafId = requestAnimationFrame(this.processFrame);
            return;
        }

        const inferenceMs = performance.now() - inferenceStart;
        this.metrics.frames += 1;
        this.metrics.inferenceSamples.push(inferenceMs);

        this.drawHands(detail.hands);
        this.setStatus(detail.status);
        this.updateResultList(detail.hands, detail.selectedCommandCandidate);
        this.emitGestureInput(detail);
        this.emitTelemetry(false);

        this.rafId = requestAnimationFrame(this.processFrame);
    };

    async start() {
        if (this.running) return true;

        if (!this.videoEl || !this.panelEl) {
            console.warn('[GestureInput] Missing panel/video elements.');
            return false;
        }

        this.panelEl.dataset.active = 'true';
        this.setStatus('Starting camera...');

        try {
            await this.ensureRecognizer();

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 960 },
                    height: { ideal: 540 },
                    frameRate: { ideal: 30, max: 60 }
                },
                audio: false
            });

            this.videoEl.srcObject = this.stream;
            this.videoEl.muted = true;
            this.videoEl.playsInline = true;

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('camera timeout')), 8000);
                this.videoEl.onloadedmetadata = () => {
                    clearTimeout(timer);
                    this.videoEl.play().then(resolve).catch(reject);
                };
                this.videoEl.onerror = () => {
                    clearTimeout(timer);
                    reject(new Error('camera stream failed'));
                };
            });

            this.running = true;
            this.lastVideoTime = -1;
        this.metrics = {
            frames: 0,
            windowStartTs: performance.now(),
            inferenceSamples: [],
            lastTelemetryTs: 0
        };
        this.lastStableHands = [];
        this.lastStableHandsTs = 0;
        this.commandStabilityState = { key: '', frames: 0 };
        this.lastStatusText = '';

        this.rafId = requestAnimationFrame(this.processFrame);
        return true;
        } catch (error) {
            console.warn('[GestureInput] Start error:', error?.message || error);
            this.stop(false);
            this.setStatus('Camera unavailable');
            this.updateResultList([], null);
            return false;
        }
    }

    stop(updateStatus = true) {
        this.running = false;

        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        if (this.videoEl) {
            try {
                this.videoEl.pause();
            } catch (error) {
                // Ignore pause errors.
            }
            this.videoEl.srcObject = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }

        if (this.canvasEl) {
            const ctx = this.canvasEl.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
        }

        if (this.panelEl) {
            this.panelEl.dataset.active = 'false';
        }

        this.lastVideoTime = -1;
        this.lastStableHands = [];
        this.lastStableHandsTs = 0;
        this.commandStabilityState = { key: '', frames: 0 };
        this.lastStatusText = '';

        if (updateStatus) {
            this.setStatus('Gesture panel stopped');
            this.updateResultList([], null);
        }

        this.emitTelemetry(true);
    }
}

export default MediaPipeGestureInput;
