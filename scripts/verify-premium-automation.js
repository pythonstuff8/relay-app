#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function expectContains(text, snippet, label) {
    if (!text.includes(snippet)) {
        throw new Error(`Missing ${label}: ${snippet}`);
    }
}

function run() {
    const mainJs = read('electron/main.js');
    const preloadJs = read('electron/preload.js');
    const settingsJs = read('electron/settings-manager.js');
    const appJs = read('renderer/app.js');

    expectContains(mainJs, "ipcMain.handle('desktop-automation-plan'", 'main IPC plan handler');
    expectContains(mainJs, "ipcMain.handle('desktop-automation-execute'", 'main IPC execute handler');
    expectContains(mainJs, "ipcMain.handle('desktop-automation-status'", 'main IPC status handler');
    expectContains(mainJs, 'AUTOMATION_PLAN_V1_SCHEMA', 'automation schema import');
    expectContains(mainJs, 'createDesktopAutomationPlan', 'planner function');
    expectContains(mainJs, 'executeDesktopAutomationPlan', 'executor function');

    expectContains(preloadJs, 'desktopAutomationPlan', 'preload planner API');
    expectContains(preloadJs, 'desktopAutomationExecute', 'preload execute API');
    expectContains(preloadJs, 'desktopAutomationStatus', 'preload status API');

    [
        'premiumAutomationEnabled',
        'automationContextTtlMs',
        'automationAdvancedControlUnlocked',
        'automationRequireHighRiskConfirmation',
        'automationVisionFallback',
        'automationModel'
    ].forEach((key) => {
        expectContains(settingsJs, `${key}:`, `settings default ${key}`);
    });

    expectContains(appJs, 'maybeRoutePremiumAutomation', 'renderer premium routing');
    expectContains(appJs, 'desktopAutomationPlan', 'renderer planner usage');
    expectContains(appJs, 'desktopAutomationExecute', 'renderer executor usage');
    expectContains(appJs, 'automation-executed', 'renderer automation event');

    console.log('Premium automation wiring verified.');
}

try {
    run();
} catch (error) {
    console.error(`[verify-premium-automation] ${error.message}`);
    process.exit(1);
}
