#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function fail(message) {
    throw new Error(message);
}

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function assertNotContains(fileText, needle, context) {
    if (fileText.includes(needle)) {
        fail(`${context} still contains "${needle}"`);
    }
}

function assertContains(fileText, needle, context) {
    if (!fileText.includes(needle)) {
        fail(`${context} is missing "${needle}"`);
    }
}

function ensureMissing(filePath) {
    if (fs.existsSync(filePath)) {
        fail(`Legacy path should be removed: ${filePath}`);
    }
}

function run() {
    const root = path.resolve(__dirname, '..');

    const appPath = path.join(root, 'renderer/app.js');
    const blindModePath = path.join(root, 'renderer/blind-mode.js');
    const overlayPath = path.join(root, 'renderer/overlay.html');
    const preloadPath = path.join(root, 'electron/preload.js');
    const mainPath = path.join(root, 'electron/main.js');
    const packagePath = path.join(root, 'package.json');
    const gestureModulePath = path.join(root, 'renderer/mediapipe-gesture-input.js');

    const appText = read(appPath);
    const blindModeText = read(blindModePath);
    const overlayText = read(overlayPath);
    const preloadText = read(preloadPath);
    const mainText = read(mainPath);
    const packageJson = JSON.parse(read(packagePath));

    if (!fs.existsSync(gestureModulePath)) {
        fail('Missing renderer/mediapipe-gesture-input.js');
    }

    // Legacy file removals
    ensureMissing(path.join(root, 'renderer/sign-language-input.js'));
    ensureMissing(path.join(root, 'renderer/sign-recognizer.js'));
    ensureMissing(path.join(root, 'renderer/sign-planner.js'));
    ensureMissing(path.join(root, 'renderer/sign-plan-types.js'));
    ensureMissing(path.join(root, 'electron/sign-plan-schema.js'));
    ensureMissing(path.join(root, 'python'));
    ensureMissing(path.join(root, 'renderer/asl-avatar-controller.js'));
    ensureMissing(path.join(root, 'renderer/asl-avatar-renderer.js'));
    ensureMissing(path.join(root, 'renderer/asl-action-library.js'));
    ensureMissing(path.join(root, 'electron/sign-translate-utils.js'));

    // App wiring
    assertContains(appText, "import { MediaPipeGestureInput } from './mediapipe-gesture-input.js';", 'renderer/app.js');
    assertContains(appText, "window.addEventListener('gesture-input'", 'renderer/app.js');
    assertContains(appText, "window.addEventListener('gesture-model-health'", 'renderer/app.js');
    assertContains(appText, 'gestureInput.start()', 'renderer/app.js');
    assertContains(appText, 'gestureInput.stop()', 'renderer/app.js');
    assertNotContains(appText, 'ASLAvatarController', 'renderer/app.js');
    assertNotContains(appText, 'sign-language-input', 'renderer/app.js');
    assertNotContains(appText, 'sign-model-health', 'renderer/app.js');
    assertContains(overlayText, 'id="gesture-panel"', 'renderer/overlay.html');
    assertNotContains(overlayText, 'id="asl-avatar-panel"', 'renderer/overlay.html');
    assertNotContains(blindModeText, 'sign-input', 'renderer/blind-mode.js');

    // Preload and main IPC removals
    assertNotContains(preloadText, 'signPlanText', 'electron/preload.js');
    assertNotContains(preloadText, 'signCloudFallback', 'electron/preload.js');
    assertNotContains(preloadText, 'signTranslateActions', 'electron/preload.js');
    assertNotContains(mainText, "ipcMain.handle('sign-plan-text'", 'electron/main.js');
    assertNotContains(mainText, "ipcMain.handle('sign-cloud-fallback'", 'electron/main.js');
    assertNotContains(mainText, "ipcMain.handle('sign-translate-actions'", 'electron/main.js');
    assertNotContains(mainText, 'aslAssistProcess', 'electron/main.js');

    // Package cleanup
    const scripts = packageJson.scripts || {};
    const scriptNames = Object.keys(scripts);
    if (scriptNames.some((name) => name.startsWith('sign:train'))) {
        fail('package.json still contains sign:train scripts');
    }
    if (scripts['verify:sign-target']) {
        fail('package.json still contains verify:sign-target');
    }

    const buildFiles = Array.isArray(packageJson?.build?.files) ? packageJson.build.files : [];
    if (buildFiles.includes('python/**/*')) {
        fail('package.json build.files still includes python/**/*');
    }

    console.log('Verified gesture migration: legacy sign/Python/avatar paths removed, MediaPipe gesture flow wired as active Deaf mode input.');
}

try {
    run();
} catch (error) {
    console.error(`[verify-gesture-migration] ${error.message}`);
    process.exit(1);
}
