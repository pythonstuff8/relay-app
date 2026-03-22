/**
 * Relay Combined Mode
 * Multi-sensory accessibility for deaf-blind users
 * Combines visual, audio, and haptic feedback
 */

export class CombinedMode {
    constructor(options = {}) {
        this.isActive = false;
        this.options = {
            hapticEnabled: true,
            visualEnabled: true,
            audioEnabled: true,
            brailleEnabled: false,
            vibrationIntensity: 1.0,
            flashNotifications: true,
            ...options
        };

        this.notificationQueue = [];
        this.isProcessingQueue = false;
        this.lastNotificationTime = 0;
        this.notificationCooldown = 500; // ms

        this.init();
    }

    init() {
        this.setupHapticPatterns();
        this.setupVisualAlerts();
        this.setupNotificationBridge();
    }

    // ============================================
    // HAPTIC FEEDBACK SYSTEM
    // ============================================

    setupHapticPatterns() {
        this.hapticPatterns = {
            // Emergency - strong rapid pulses
            emergency: {
                pattern: [200, 100, 200, 100, 200, 100, 400],
                intensity: 1.0,
                priority: 'high'
            },
            // Attention - medium pulses
            attention: {
                pattern: [300, 150, 300],
                intensity: 0.8,
                priority: 'medium'
            },
            // Communication - gentle pattern
            communication: {
                pattern: [150, 100, 150],
                intensity: 0.6,
                priority: 'medium'
            },
            // Environmental - subtle
            environmental: {
                pattern: [100, 200, 100],
                intensity: 0.4,
                priority: 'low'
            },
            // Appliance - short pulse
            appliance: {
                pattern: [200],
                intensity: 0.5,
                priority: 'low'
            },
            // Media - rhythmic
            media: {
                pattern: [100, 100, 100, 100, 100],
                intensity: 0.3,
                priority: 'low'
            },
            // Mode change
            modeChange: {
                pattern: [100, 50, 200],
                intensity: 0.7,
                priority: 'high'
            },
            // Success
            success: {
                pattern: [50, 50, 100],
                intensity: 0.5,
                priority: 'medium'
            },
            // Error
            error: {
                pattern: [400, 100, 400],
                intensity: 0.8,
                priority: 'high'
            }
        };
    }

    async triggerHaptic(patternName, customIntensity = null) {
        if (!this.options.hapticEnabled) return;

        const pattern = this.hapticPatterns[patternName];
        if (!pattern) return;

        const intensity = customIntensity !== null ? customIntensity : pattern.intensity;

        // Use Navigator.vibrate API if available
        if (navigator.vibrate) {
            // Scale pattern by intensity
            const scaledPattern = pattern.pattern.map(d => Math.round(d / intensity));
            navigator.vibrate(scaledPattern);
        }

        // Also try to use native haptic through Electron
        if (window.electronAPI?.triggerHaptic) {
            try {
                await window.electronAPI.triggerHaptic({
                    pattern: patternName,
                    intensity: intensity * this.options.vibrationIntensity
                });
            } catch (e) {
                // Fallback to vibrate already done above
            }
        }

        // Dispatch visual haptic indicator
        if (this.options.visualEnabled) {
            this.showHapticVisual(patternName, intensity);
        }
    }

    showHapticVisual(patternName, intensity) {
        // Create visual representation of haptic feedback
        const indicator = document.createElement('div');
        indicator.className = 'haptic-visual-indicator';
        indicator.innerHTML = `
            <div class="haptic-ring"></div>
            <div class="haptic-icon"></div>
        `;

        // Position in corner
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            z-index: 10000;
            pointer-events: none;
        `;

        document.body.appendChild(indicator);

        // Animate
        const ring = indicator.querySelector('.haptic-ring');
        ring.style.cssText = `
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 3px solid rgba(0, 113, 227, ${intensity});
            animation: haptic-ring-pulse 0.6s ease-out forwards;
        `;

        // Add keyframes if not present
        if (!document.getElementById('haptic-animations')) {
            const style = document.createElement('style');
            style.id = 'haptic-animations';
            style.textContent = `
                @keyframes haptic-ring-pulse {
                    0% { transform: scale(0.5); opacity: 1; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        // Remove after animation
        setTimeout(() => indicator.remove(), 600);
    }

    // ============================================
    // VISUAL ALERT SYSTEM
    // ============================================

    setupVisualAlerts() {
        this.visualAlertContainer = document.createElement('div');
        this.visualAlertContainer.id = 'combined-mode-visual-alerts';
        this.visualAlertContainer.style.cssText = `
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 9999;
        `;
        document.body.appendChild(this.visualAlertContainer);
    }

    triggerVisualAlert(type, message = '') {
        if (!this.options.visualEnabled) return;

        const alertConfig = {
            emergency: { color: '#ff3b30', flashCount: 5, duration: 300 },
            attention: { color: '#ff9500', flashCount: 3, duration: 400 },
            communication: { color: '#0071e3', flashCount: 2, duration: 500 },
            environmental: { color: '#34c759', flashCount: 2, duration: 400 },
            appliance: { color: '#5ac8fa', flashCount: 1, duration: 600 },
            media: { color: '#af52de', flashCount: 2, duration: 400 }
        };

        const config = alertConfig[type] || alertConfig.attention;

        if (this.options.flashNotifications) {
            this.flashScreen(config.color, config.flashCount, config.duration);
        }

        // Show visual indicator
        this.showVisualIndicator(type, message, config.color);
    }

    flashScreen(color, count, duration) {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            inset: 0;
            background: ${color};
            opacity: 0;
            pointer-events: none;
            z-index: 99999;
            transition: opacity ${duration}ms ease;
        `;
        document.body.appendChild(flash);

        let flashes = 0;
        const doFlash = () => {
            flash.style.opacity = '0.3';
            setTimeout(() => {
                flash.style.opacity = '0';
                flashes++;
                if (flashes < count) {
                    setTimeout(doFlash, duration);
                } else {
                    setTimeout(() => flash.remove(), duration);
                }
            }, duration);
        };

        doFlash();
    }

    showVisualIndicator(type, message, color) {
        const indicator = document.createElement('div');
        indicator.className = 'combined-visual-indicator';
        indicator.innerHTML = `
            <div class="indicator-border" style="border-color: ${color}"></div>
            ${message ? `<div class="indicator-message" style="background: ${color}">${message}</div>` : ''}
        `;

        indicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10000;
            pointer-events: none;
        `;

        const border = indicator.querySelector('.indicator-border');
        border.style.cssText = `
            width: 200px;
            height: 200px;
            border-radius: 50%;
            border: 8px solid ${color};
            opacity: 0;
            animation: indicator-expand 1s ease-out forwards;
        `;

        if (message) {
            const msgEl = indicator.querySelector('.indicator-message');
            msgEl.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 12px 24px;
                border-radius: 12px;
                color: white;
                font-weight: 600;
                font-size: 18px;
                white-space: nowrap;
                opacity: 0;
                animation: indicator-fade-in 0.3s ease-out 0.2s forwards;
            `;
        }

        // Add animations
        if (!document.getElementById('combined-mode-animations')) {
            const style = document.createElement('style');
            style.id = 'combined-mode-animations';
            style.textContent = `
                @keyframes indicator-expand {
                    0% { transform: scale(0); opacity: 0.8; }
                    100% { transform: scale(2); opacity: 0; }
                }
                @keyframes indicator-fade-in {
                    to { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        this.visualAlertContainer.appendChild(indicator);
        setTimeout(() => indicator.remove(), 1500);
    }

    // ============================================
    // NOTIFICATION BRIDGE
    // ============================================

    setupNotificationBridge() {
        // Listen for notifications from other modes
        window.addEventListener('cv-notification', (e) => {
            if (this.isActive) {
                this.processNotification(e.detail);
            }
        });

        // Listen for sound detections
        window.addEventListener('sound-detected', (e) => {
            if (this.isActive) {
                this.handleSoundDetection(e.detail);
            }
        });

        // Listen for captions
        window.addEventListener('caption-received', (e) => {
            if (this.isActive) {
                this.handleCaption(e.detail);
            }
        });
    }

    processNotification(notification) {
        const now = Date.now();
        if (now - this.lastNotificationTime < this.notificationCooldown) {
            this.notificationQueue.push(notification);
            return;
        }

        this.executeNotification(notification);
    }

    executeNotification(notification) {
        this.lastNotificationTime = Date.now();

        // Trigger all sensory outputs
        if (notification.haptic) {
            this.triggerHaptic(notification.haptic);
        }

        if (notification.visual) {
            this.triggerVisualAlert(
                notification.visual.type,
                notification.visual.message
            );
        }

        if (notification.audio && this.options.audioEnabled) {
            this.playAudioCue(notification.audio);
        }

        // Process queue
        setTimeout(() => {
            if (this.notificationQueue.length > 0) {
                const next = this.notificationQueue.shift();
                this.executeNotification(next);
            }
        }, this.notificationCooldown);
    }

    handleSoundDetection(detection) {
        const { category, label, confidence, direction } = detection;

        // Haptic feedback based on category
        this.triggerHaptic(category);

        // Visual flash
        this.triggerVisualAlert(category, label);

        // Dispatch to audio if needed
        if (this.options.audioEnabled) {
            window.dispatchEvent(new CustomEvent('combined-audio-cue', {
                detail: { type: category, label, direction }
            }));
        }
    }

    handleCaption(caption) {
        // Gentle haptic for captions
        this.triggerHaptic('communication', 0.3);

        // Optional: flash a subtle indicator
        if (this.options.visualEnabled) {
            this.showCaptionIndicator();
        }
    }

    showCaptionIndicator() {
        const indicator = document.getElementById('combined-caption-indicator');
        if (!indicator) {
            const el = document.createElement('div');
            el.id = 'combined-caption-indicator';
            el.style.cssText = `
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%);
                width: 8px;
                height: 8px;
                background: #0071e3;
                border-radius: 50%;
                opacity: 0;
                transition: opacity 0.2s;
                z-index: 1000;
            `;
            document.body.appendChild(el);
        }

        const el = document.getElementById('combined-caption-indicator');
        el.style.opacity = '1';
        clearTimeout(this.captionIndicatorTimeout);
        this.captionIndicatorTimeout = setTimeout(() => {
            el.style.opacity = '0';
        }, 500);
    }

    playAudioCue(cue) {
        // Dispatch to blind mode or TTS system
        window.dispatchEvent(new CustomEvent('combined-audio-request', {
            detail: cue
        }));
    }

    // ============================================
    // ACTIVATION / DEACTIVATION
    // ============================================

    activate() {
        this.isActive = true;
        document.body.classList.add('combined-mode-active');

        // Welcome sequence
        this.triggerHaptic('modeChange');
        setTimeout(() => {
            this.triggerVisualAlert('communication', 'Combined Mode Active');
        }, 300);

        // Dispatch activation event
        window.dispatchEvent(new CustomEvent('combined-mode-activated'));
    }

    deactivate() {
        this.isActive = false;
        document.body.classList.remove('combined-mode-active');
        this.notificationQueue = [];
    }

    onModeChange(mode) {
        if (mode === 'combined') {
            if (!this.isActive) this.activate();
        } else {
            if (this.isActive) this.deactivate();
        }
    }
}

// Export for use in other modules
export default CombinedMode;
