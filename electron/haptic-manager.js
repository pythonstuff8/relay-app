// Relay Haptic Feedback Manager (macOS)
// Triggers trackpad haptics via NSHapticFeedbackManager

const { exec } = require('child_process');
const os = require('os');

const isMac = os.platform() === 'darwin';

// Haptic patterns using AppleScript to trigger NSHapticFeedbackPerformer
const PATTERNS = {
    strong: 3,   // Triple pulse for critical alerts
    medium: 2,   // Double pulse for high priority
    light: 1,    // Single pulse for medium priority
    tap: 1,      // Quick tap for confirmation
};

function triggerHaptic(pattern) {
    if (!isMac) return;

    const count = PATTERNS[pattern] || 1;

    // Use osascript to trigger haptic feedback through AppleScript
    // This uses NSHapticFeedbackManager via ObjC bridge
    const script = `
        use framework "AppKit"
        set performer to current application's NSHapticFeedbackManager's defaultPerformer()
        repeat ${count} times
            performer's performFeedbackPattern:(current application's NSHapticFeedbackPatternAlignment) performanceTime:(current application's NSHapticFeedbackPerformanceTimeNow)
            delay 0.12
        end repeat
    `;

    exec(`osascript -l AppleScript -e '${script.replace(/'/g, "'\\''")}'`, (err) => {
        if (err) {
            // Silently fail - haptics are non-critical
            // console.warn('[Haptics] Failed:', err.message);
        }
    });
}

function triggerForAlert(category) {
    const categoryPatterns = {
        emergency: 'strong',
        attention: 'medium',
        communication: 'light',
        nameMention: 'medium',
    };

    const pattern = categoryPatterns[category];
    if (pattern) {
        triggerHaptic(pattern);
    }
}

module.exports = { triggerHaptic, triggerForAlert };
