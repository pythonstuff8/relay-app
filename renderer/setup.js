// Setup Wizard - Step-by-step permission and connection testing

// Elements - Progress
const progressSteps = document.querySelectorAll('.progress-step');
const steps = document.querySelectorAll('.step');

// Elements - Step 1
const btnStart = document.getElementById('btn-start');

// Elements - Step 2 (Permissions)
const micStatus = document.getElementById('mic-status');
const cameraStatus = document.getElementById('camera-status');
const screenStatus = document.getElementById('screen-status');
const accessibilityStatus = document.getElementById('accessibility-status');
const permMic = document.getElementById('perm-mic');
const permCamera = document.getElementById('perm-camera');
const permScreen = document.getElementById('perm-screen');
const permAccessibility = document.getElementById('perm-accessibility');
const btnTestPermissions = document.getElementById('btn-test-permissions');
const btnOpenSettings = document.getElementById('btn-open-settings');
const skipScreen = document.getElementById('skip-screen');
const permissionError = document.getElementById('permission-error');
const permissionErrorText = document.getElementById('permission-error-text');
const screenInstructions = document.getElementById('screen-instructions');
const visualizerCanvas = document.getElementById('setup-visualizer');
const visText = document.getElementById('vis-text');
const ctx = visualizerCanvas.getContext('2d');

// Elements - Step 3 (Connection)
const deepgramStatus = document.getElementById('deepgram-status');
const ttsStatus = document.getElementById('tts-status');
const permDeepgram = document.getElementById('perm-deepgram');
const permTts = document.getElementById('perm-tts');
const btnTestConnection = document.getElementById('btn-test-connection');
const skipConnection = document.getElementById('skip-connection');
const apiError = document.getElementById('api-error');
const apiErrorText = document.getElementById('api-error-text');
const offlineInfo = document.getElementById('offline-info');

// Elements - Step 4 (Ready)
const btnLaunch = document.getElementById('btn-launch');
const btnRunSetupAgain = document.getElementById('btn-run-setup-again');

// State
let currentStep = 1;
let audioContext;
let analyser;
let dataArray;
let source;
let mediaStream;
let micGranted = false;
let cameraGranted = false;
let screenGranted = false;
let deepgramConnected = false;
let ttsConnected = false;
let openSettingsTarget = 'screen-recording';

// ============================================
// STEP NAVIGATION
// ============================================

function goToStep(stepNum) {
    // Update progress bar
    progressSteps.forEach((step, i) => {
        step.classList.remove('active', 'done');
        if (i + 1 < stepNum) {
            step.classList.add('done');
        } else if (i + 1 === stepNum) {
            step.classList.add('active');
        }
    });

    // Update step visibility
    steps.forEach((step, i) => {
        step.classList.remove('active');
        if (i + 1 === stepNum) {
            step.classList.add('active');
        }
    });

    currentStep = stepNum;
    window.electronAPI.log(`Setup: Navigated to step ${stepNum}`);
}

// ============================================
// STEP 1: Welcome
// ============================================

btnStart.addEventListener('click', () => {
    goToStep(2);
});

// ============================================
// STEP 2: Permissions
// ============================================

function setStatus(element, statusEl, status) {
    element.classList.remove('testing', 'success', 'error');
    statusEl.classList.remove('testing', 'success', 'error', 'pending');

    if (status === 'testing') {
        element.classList.add('testing');
        statusEl.classList.add('testing');
        statusEl.innerHTML = '◌';
    } else if (status === 'success') {
        element.classList.add('success');
        statusEl.classList.add('success');
        statusEl.innerHTML = '✓';
    } else if (status === 'error') {
        element.classList.add('error');
        statusEl.classList.add('error');
        statusEl.innerHTML = '✕';
    } else {
        statusEl.classList.add('pending');
        statusEl.innerHTML = '○';
    }
}

async function testMicrophone() {
    setStatus(permMic, micStatus, 'testing');

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Start visualizer
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        drawVisualizer();
        visText.style.display = 'none';

        setStatus(permMic, micStatus, 'success');
        micGranted = true;
        return true;
    } catch (e) {
        window.electronAPI.log("Microphone permission error: " + e);
        setStatus(permMic, micStatus, 'error');
        micGranted = false;
        return false;
    }
}

async function testCamera() {
    setStatus(permCamera, cameraStatus, 'testing');

    try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        cameraStream.getTracks().forEach((track) => track.stop());
        setStatus(permCamera, cameraStatus, 'success');
        cameraGranted = true;
        return true;
    } catch (e) {
        window.electronAPI.log("Camera permission error: " + e);
        setStatus(permCamera, cameraStatus, 'error');
        cameraGranted = false;
        openSettingsTarget = 'camera';
        btnOpenSettings.style.display = 'block';
        return false;
    }
}

async function testScreenRecording() {
    setStatus(permScreen, screenStatus, 'testing');

    try {
        const sources = await window.electronAPI.getSources();
        if (sources && sources.length > 0) {
            setStatus(permScreen, screenStatus, 'success');
            screenGranted = true;
            screenInstructions.style.display = 'none';
            return true;
        } else {
            throw new Error("No sources available");
        }
    } catch (e) {
        window.electronAPI.log("Screen recording permission error: " + e);
        setStatus(permScreen, screenStatus, 'error');
        screenGranted = false;
        screenInstructions.style.display = 'block';
        openSettingsTarget = 'screen-recording';
        btnOpenSettings.style.display = 'block';
        return false;
    }
}

async function testAccessibility() {
    setStatus(permAccessibility, accessibilityStatus, 'testing');

    try {
        // Test if active-win works (requires accessibility permission)
        const result = await window.electronAPI.testAccessibility();
        if (result.success) {
            setStatus(permAccessibility, accessibilityStatus, 'success');
            return true;
        } else {
            throw new Error(result.error || "Accessibility not granted");
        }
    } catch (e) {
        // Accessibility is optional, so just show as pending/skipped
        setStatus(permAccessibility, accessibilityStatus, 'pending');
        window.electronAPI.log("Accessibility permission not available (optional): " + e);
        return false;
    }
}

btnTestPermissions.addEventListener('click', async () => {
    btnTestPermissions.disabled = true;
    btnTestPermissions.innerText = 'Testing...';
    permissionError.classList.remove('visible');
    screenInstructions.style.display = 'none';
    btnOpenSettings.style.display = 'none';
    openSettingsTarget = 'screen-recording';

    const mic = await testMicrophone();
    const camera = await testCamera();
    const screen = await testScreenRecording();
    await testAccessibility();

    if (mic && camera) {
        btnTestPermissions.innerText = 'Continue';
        btnTestPermissions.disabled = false;

        // Change button to go to next step
        btnTestPermissions.onclick = () => {
            goToStep(3);
            // Auto-start connection test
            setTimeout(() => btnTestConnection.click(), 500);
        };

        if (!screen) {
            permissionError.classList.add('visible');
            permissionErrorText.innerText = 'Screen Recording permission is missing. You can still use microphone-only mode, or enable it in System Settings.';
        }
    } else if (!mic) {
        btnTestPermissions.innerText = 'Retry';
        btnTestPermissions.disabled = false;
        permissionError.classList.add('visible');
        permissionErrorText.innerText = 'Microphone access is required for Relay to work. Please allow microphone access when prompted.';
    } else {
        btnTestPermissions.innerText = 'Retry';
        btnTestPermissions.disabled = false;
        permissionError.classList.add('visible');
        permissionErrorText.innerText = 'Camera access is required for Relay gesture features. Please allow camera access when prompted.';
    }
});

btnOpenSettings.addEventListener('click', () => {
    window.electronAPI.openSystemSettings(openSettingsTarget);
});

skipScreen.addEventListener('click', () => {
    if (micGranted && cameraGranted) {
        goToStep(3);
        setTimeout(() => btnTestConnection.click(), 500);
    } else {
        permissionError.classList.add('visible');
        permissionErrorText.innerText = 'Please test microphone and camera permissions first.';
    }
});

function drawVisualizer() {
    if (!analyser) return;
    requestAnimationFrame(drawVisualizer);
    analyser.getByteFrequencyData(dataArray);

    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;

    ctx.fillStyle = '#f5f5f7';
    ctx.fillRect(0, 0, width, height);

    const barWidth = (width / dataArray.length) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        barHeight = dataArray[i] / 2;
        ctx.fillStyle = '#0071e3';
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}

// ============================================
// STEP 3: Connection Test
// ============================================

async function testDeepgram() {
    setStatus(permDeepgram, deepgramStatus, 'testing');

    try {
        const result = await window.electronAPI.testDeepgram();
        if (result.success) {
            setStatus(permDeepgram, deepgramStatus, 'success');
            deepgramConnected = true;
            return true;
        } else {
            throw new Error(result.error || "Connection failed");
        }
    } catch (e) {
        window.electronAPI.log("Deepgram connection error: " + e);
        setStatus(permDeepgram, deepgramStatus, 'error');
        deepgramConnected = false;
        return false;
    }
}

async function testTTS() {
    setStatus(permTts, ttsStatus, 'testing');

    try {
        const result = await window.electronAPI.testTTS();
        if (result.success) {
            setStatus(permTts, ttsStatus, 'success');
            ttsConnected = true;
            return true;
        } else {
            throw new Error(result.error || "TTS test failed");
        }
    } catch (e) {
        window.electronAPI.log("TTS connection error: " + e);
        setStatus(permTts, ttsStatus, 'error');
        ttsConnected = false;
        return false;
    }
}

btnTestConnection.addEventListener('click', async () => {
    btnTestConnection.disabled = true;
    btnTestConnection.innerText = 'Testing...';
    apiError.classList.remove('visible');
    offlineInfo.style.display = 'none';

    const dg = await testDeepgram();
    const tts = await testTTS();

    if (dg) {
        btnTestConnection.innerText = 'Continue';
        btnTestConnection.disabled = false;
        btnTestConnection.onclick = () => goToStep(4);

        if (!tts) {
            apiError.classList.add('visible');
            apiErrorText.innerText = 'Text-to-Speech connection failed. You can still use Relay with system TTS as fallback.';
        }
    } else {
        btnTestConnection.innerText = 'Retry';
        btnTestConnection.disabled = false;
        apiError.classList.add('visible');
        apiErrorText.innerText = 'Could not connect to Deepgram. Check your internet connection or API key. Offline mode is available as a fallback.';
        offlineInfo.style.display = 'block';
    }
});

skipConnection.addEventListener('click', () => {
    goToStep(4);
});

// ============================================
// STEP 4: Ready
// ============================================

btnLaunch.addEventListener('click', () => {
    // Cleanup audio resources
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
    }

    window.electronAPI.closeSetup();
});

btnRunSetupAgain.addEventListener('click', () => {
    // Reset state
    micGranted = false;
    cameraGranted = false;
    screenGranted = false;
    deepgramConnected = false;
    ttsConnected = false;

    // Reset UI
    setStatus(permMic, micStatus, 'pending');
    setStatus(permCamera, cameraStatus, 'pending');
    setStatus(permScreen, screenStatus, 'pending');
    setStatus(permAccessibility, accessibilityStatus, 'pending');
    setStatus(permDeepgram, deepgramStatus, 'pending');
    setStatus(permTts, ttsStatus, 'pending');

    btnTestPermissions.innerText = 'Test Permissions';
    btnTestPermissions.disabled = false;
    btnTestPermissions.onclick = null;

    btnTestConnection.innerText = 'Test Connection';
    btnTestConnection.disabled = false;
    btnTestConnection.onclick = null;

    permissionError.classList.remove('visible');
    apiError.classList.remove('visible');
    screenInstructions.style.display = 'none';
    offlineInfo.style.display = 'none';
    btnOpenSettings.style.display = 'none';
    visText.style.display = 'block';

    goToStep(1);
});

// ============================================
// INITIALIZATION
// ============================================

window.electronAPI.log("Setup wizard initialized");
