// Relay Alert System
// Categorized alert display with priority queue, stacking rules, auto-dismiss

const ALERT_CONFIG = {
    emergency: {
        priority: 100,
        color: '#ff3b30',
        bgColor: 'rgba(255, 59, 48, 0.95)',
        icon: '🚨',
        duration: 0, // Persistent until dismissed
        hapticPattern: 'strong',
        maxOnScreen: 1,
    },
    attention: {
        priority: 80,
        color: '#ff9f0a',
        bgColor: 'rgba(255, 159, 10, 0.92)',
        icon: '🔔',
        duration: 10000,
        hapticPattern: 'medium',
        maxOnScreen: 2,
    },
    communication: {
        priority: 60,
        color: '#ffcc00',
        bgColor: 'rgba(255, 204, 0, 0.90)',
        icon: '💬',
        duration: 5000,
        hapticPattern: 'light',
        maxOnScreen: 2,
    },
    appliance: {
        priority: 40,
        color: '#8e8e93',
        bgColor: 'rgba(142, 142, 147, 0.90)',
        icon: '🏠',
        duration: 0,
        hapticPattern: null,
        maxOnScreen: 2,
    },
    environmental: {
        priority: 30,
        color: '#34c759',
        bgColor: 'rgba(52, 199, 89, 0.90)',
        icon: '🌿',
        duration: 8000,
        hapticPattern: 'light',
        maxOnScreen: 2,
    },
    media: {
        priority: 10,
        color: '#5856d6',
        bgColor: 'rgba(88, 86, 214, 0.85)',
        icon: '🎵',
        duration: 3000,
        hapticPattern: null,
        maxOnScreen: 1,
    },
    nameMention: {
        priority: 85,
        color: '#ff9f0a',
        bgColor: 'rgba(255, 159, 10, 0.95)',
        icon: '👤',
        duration: 10000,
        hapticPattern: 'medium',
        maxOnScreen: 1,
    },
};

export class AlertSystem {
    constructor(container, options = {}) {
        this.container = container;
        this.maxSimultaneous = options.maxSimultaneous || 2;
        this.activeAlerts = [];
        this.alertHistory = [];
        this.enabledCategories = options.enabledCategories || {
            emergency: true, attention: true, communication: true,
            appliance: true, environmental: true, media: false,
        };
        this.onHapticRequest = options.onHapticRequest || null;
        this._setupContainer();
    }

    _setupContainer() {
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 200;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: none;
            max-width: 400px;
        `;
    }

    setEnabledCategories(categories) {
        this.enabledCategories = categories;
    }

    show(alert) {
        const { category, label, detail, className } = alert;

        // Check if category is enabled
        if (!this.enabledCategories[category] && category !== 'nameMention') return;

        const config = ALERT_CONFIG[category];
        if (!config) return;

        // Log to history
        this.alertHistory.push({
            ...alert,
            timestamp: Date.now(),
        });

        // Trim history
        if (this.alertHistory.length > 100) {
            this.alertHistory = this.alertHistory.slice(-50);
        }

        // Emergency alerts dismiss non-emergency
        if (category === 'emergency') {
            this.activeAlerts.forEach(a => {
                if (a.category !== 'emergency') {
                    this._removeAlert(a);
                }
            });
        }

        // Enforce max simultaneous
        while (this.activeAlerts.length >= this.maxSimultaneous) {
            // Remove lowest priority
            const lowest = this.activeAlerts.reduce((min, a) =>
                (ALERT_CONFIG[a.category]?.priority || 0) < (ALERT_CONFIG[min.category]?.priority || 0) ? a : min
            );
            this._removeAlert(lowest);
        }

        // Create alert element
        const el = this._createAlertElement(category, label, detail, className, config);
        this.container.appendChild(el);

        const alertObj = { id: Date.now(), category, label, el, config };
        this.activeAlerts.push(alertObj);

        // Trigger haptic
        if (config.hapticPattern && this.onHapticRequest) {
            this.onHapticRequest(config.hapticPattern);
        }

        // Auto-dismiss
        if (config.duration > 0) {
            alertObj.timer = setTimeout(() => {
                this._removeAlert(alertObj);
            }, config.duration);
        }

        // Entrance animation
        requestAnimationFrame(() => {
            el.style.transform = 'translateX(0)';
            el.style.opacity = '1';
        });

        return alertObj.id;
    }

    _createAlertElement(category, label, detail, className, config) {
        const el = document.createElement('div');
        el.className = `cv-alert cv-alert-${category}`;
        el.style.cssText = `
            background: ${config.bgColor};
            color: white;
            padding: 12px 16px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            display: flex;
            align-items: flex-start;
            gap: 10px;
            pointer-events: auto;
            cursor: default;
            transform: translateX(100%);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
            min-width: 280px;
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.15);
        `;

        // Emergency gets special treatment
        if (category === 'emergency') {
            el.style.animation = 'alertPulse 1s infinite';
        }

        const icon = document.createElement('span');
        icon.style.cssText = 'font-size: 20px; flex-shrink: 0; margin-top: 1px;';
        icon.textContent = config.icon;

        const content = document.createElement('div');
        content.style.cssText = 'flex: 1; min-width: 0;';

        const title = document.createElement('div');
        title.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 2px;';
        title.textContent = label;

        content.appendChild(title);

        if (detail) {
            const detailEl = document.createElement('div');
            detailEl.style.cssText = 'font-size: 12px; opacity: 0.85;';
            detailEl.textContent = detail;
            content.appendChild(detailEl);
        }

        if (className) {
            const classEl = document.createElement('div');
            classEl.style.cssText = 'font-size: 11px; opacity: 0.65; margin-top: 2px;';
            classEl.textContent = className;
            content.appendChild(classEl);
        }

        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: background 0.2s;
        `;
        closeBtn.textContent = '✕';
        closeBtn.onmouseenter = () => { closeBtn.style.background = 'rgba(255,255,255,0.35)'; };
        closeBtn.onmouseleave = () => { closeBtn.style.background = 'rgba(255,255,255,0.2)'; };
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            const alert = this.activeAlerts.find(a => a.el === el);
            if (alert) this._removeAlert(alert);
        };

        el.appendChild(icon);
        el.appendChild(content);
        el.appendChild(closeBtn);

        return el;
    }

    _removeAlert(alertObj) {
        if (!alertObj || !alertObj.el) return;
        if (alertObj.timer) clearTimeout(alertObj.timer);

        alertObj.el.style.transform = 'translateX(100%)';
        alertObj.el.style.opacity = '0';

        setTimeout(() => {
            if (alertObj.el.parentNode) {
                alertObj.el.parentNode.removeChild(alertObj.el);
            }
        }, 300);

        this.activeAlerts = this.activeAlerts.filter(a => a !== alertObj);
    }

    dismissAll() {
        [...this.activeAlerts].forEach(a => this._removeAlert(a));
    }

    getHistory() {
        return this.alertHistory.slice();
    }

    clearHistory() {
        this.alertHistory = [];
    }
}

export { ALERT_CONFIG };
