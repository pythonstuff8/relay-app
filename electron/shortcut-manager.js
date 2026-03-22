const { globalShortcut } = require('electron');

const DEFAULT_SHORTCUTS = {
    'toggle-captions': 'CommandOrControl+Shift+C',
    'explain-screen': 'CommandOrControl+Shift+E',
    'command-bar': 'CommandOrControl+Shift+Space',
    'request-guidance': 'CommandOrControl+Shift+H',
    'dismiss-alerts': 'CommandOrControl+Shift+D',
    'toggle-overlay': 'CommandOrControl+Shift+V',
    'quick-mute': 'CommandOrControl+Shift+M',
    'caption-larger': 'CommandOrControl+Shift+=',
    'caption-smaller': 'CommandOrControl+Shift+-',
    'open-settings': 'CommandOrControl+Shift+,',
};

let registeredShortcuts = [];

function registerShortcuts(overlayWindow, settingsCallback) {
    unregisterAll();

    for (const [action, accelerator] of Object.entries(DEFAULT_SHORTCUTS)) {
        try {
            const success = globalShortcut.register(accelerator, () => {
                // Settings shortcut handled in main process
                if (action === 'open-settings' && settingsCallback) {
                    settingsCallback();
                    return;
                }

                // Toggle overlay visibility
                if (action === 'toggle-overlay' && overlayWindow) {
                    if (overlayWindow.isVisible()) {
                        overlayWindow.hide();
                    } else {
                        overlayWindow.show();
                    }
                    return;
                }

                // Forward all other shortcuts to the overlay renderer
                if (overlayWindow && !overlayWindow.isDestroyed()) {
                    overlayWindow.webContents.send('shortcut', action);
                }
            });

            if (success) {
                registeredShortcuts.push(accelerator);
            } else {
                console.warn(`[Shortcuts] Failed to register: ${accelerator} for ${action}`);
            }
        } catch (err) {
            console.error(`[Shortcuts] Error registering ${accelerator}:`, err.message);
        }
    }

    console.log(`[Shortcuts] Registered ${registeredShortcuts.length}/${Object.keys(DEFAULT_SHORTCUTS).length} shortcuts`);
}

function unregisterAll() {
    registeredShortcuts.forEach(accel => {
        try {
            globalShortcut.unregister(accel);
        } catch (e) { /* ignore */ }
    });
    registeredShortcuts = [];
}

module.exports = { registerShortcuts, unregisterAll, DEFAULT_SHORTCUTS };
