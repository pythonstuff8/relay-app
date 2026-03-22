// =============================================================================
// RELAY AI GUIDE - Step-by-Step Assistant
// =============================================================================

class RelayGuide {
    constructor() {
        this.isOpen = false;
        this.currentSteps = [];
        this.currentStepIndex = 0;
        this.isFinished = false;

        // Dragging state
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.panelStart = { x: 0, y: 0 };
        this.panelMode = 'docked';
        this.floatingPosition = { x: 20, y: 80 };
        this.viewportPadding = 10;

        this.init();
    }

    init() {
        this.createUI();
        this.setupDragging();
        this.setupButtons();
        this.setupKeyboard();
        this.dockToLeft();
    }

    // =========================================================================
    // UI CREATION
    // =========================================================================

    createUI() {
        const container = document.createElement('div');
        container.id = 'cv-guide';
        container.innerHTML = `
            <div class="guide-panel docked" id="guide-panel">
                <div class="guide-header" id="guide-header">
                    <div class="guide-title">
                        <span class="guide-icon">🧭</span>
                        <span>AI Guide</span>
                    </div>
                    <button class="guide-close" id="guide-close">×</button>
                </div>

                <div class="guide-content">
                    <!-- ASK VIEW -->
                    <div class="guide-view active" id="view-ask">
                        <p class="guide-prompt">What do you need help with?</p>
                        <div class="guide-input-row">
                            <input type="text" id="guide-input" placeholder="e.g. How do I open Safari?">
                            <button id="guide-submit">Go</button>
                        </div>
                        <div class="guide-suggestions">
                            <button data-q="How do I open Safari?">Open Safari</button>
                            <button data-q="How do I take a screenshot?">Screenshot</button>
                            <button data-q="How do I open System Settings?">Settings</button>
                            <button data-q="How do I copy and paste?">Copy & Paste</button>
                        </div>
                    </div>

                    <!-- LOADING VIEW -->
                    <div class="guide-view" id="view-loading">
                        <div class="guide-spinner"></div>
                        <p>Creating your guide...</p>
                    </div>

                    <!-- STEPS VIEW -->
                    <div class="guide-view" id="view-steps">
                        <div class="guide-progress">
                            <button class="guide-back" id="guide-back">← Back</button>
                            <div class="guide-dots" id="guide-dots"></div>
                        </div>

                        <div class="guide-step-card" id="guide-step-card">
                            <div class="step-number" id="step-number">1</div>
                            <div class="step-content">
                                <div class="step-icon" id="step-icon">👆</div>
                                <div class="step-text" id="step-text">Loading...</div>
                                <div class="step-detail" id="step-detail"></div>
                            </div>
                        </div>

                        <div class="guide-nav">
                            <button class="nav-prev" id="nav-prev">←</button>
                            <button class="nav-next" id="nav-next">Next Step →</button>
                        </div>
                    </div>

                    <!-- ERROR VIEW -->
                    <div class="guide-view" id="view-error">
                        <div class="guide-error">
                            <span class="error-icon">⚠️</span>
                            <p id="error-msg">Something went wrong</p>
                            <button id="guide-retry">Try Again</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = this.getStyles();
        document.head.appendChild(style);
        document.body.appendChild(container);

        this.container = container;
        this.panel = document.getElementById('guide-panel');
    }

    getStyles() {
        return `
            #cv-guide {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 99999;
                pointer-events: none;
                display: none;
            }

            #cv-guide.open {
                display: block;
            }

            .guide-panel {
                position: fixed;
                top: 80px;
                left: 20px;
                width: 340px;
                background: rgba(28, 28, 30, 0.95);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
                pointer-events: auto;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                overflow: hidden;
                transform: scale(0.95) translateY(-10px);
                opacity: 0;
                transition: transform 0.2s ease, opacity 0.2s ease;
            }

            .guide-panel.docked {
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.42);
            }

            .guide-panel.floating {
                box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
            }

            #cv-guide.open .guide-panel {
                transform: scale(1) translateY(0);
                opacity: 1;
            }

            .guide-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 14px 16px;
                background: rgba(255, 255, 255, 0.03);
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                cursor: grab;
                user-select: none;
            }

            .guide-header:active {
                cursor: grabbing;
            }

            .guide-title {
                display: flex;
                align-items: center;
                gap: 8px;
                color: white;
                font-weight: 600;
                font-size: 14px;
            }

            .guide-icon {
                font-size: 16px;
            }

            .guide-close {
                width: 28px;
                height: 28px;
                border: none;
                background: transparent;
                color: rgba(255, 255, 255, 0.4);
                font-size: 20px;
                cursor: pointer;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s;
            }

            .guide-close:hover {
                background: #ff3b30;
                color: white;
            }

            .guide-content {
                padding: 20px;
            }

            .guide-view {
                display: none;
            }

            .guide-view.active {
                display: block;
            }

            /* ASK VIEW */
            .guide-prompt {
                color: white;
                font-size: 16px;
                font-weight: 600;
                text-align: center;
                margin: 0 0 16px;
            }

            .guide-input-row {
                display: flex;
                gap: 10px;
                margin-bottom: 16px;
            }

            #guide-input {
                flex: 1;
                padding: 12px 14px;
                font-size: 14px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 10px;
                color: white;
                outline: none;
            }

            #guide-input:focus {
                border-color: #0a84ff;
            }

            #guide-input::placeholder {
                color: rgba(255, 255, 255, 0.35);
            }

            #guide-submit {
                padding: 12px 20px;
                font-size: 14px;
                font-weight: 600;
                background: #0a84ff;
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                transition: background 0.15s;
            }

            #guide-submit:hover {
                background: #0070e0;
            }

            .guide-suggestions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }

            .guide-suggestions button {
                padding: 12px;
                font-size: 13px;
                text-align: center;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 10px;
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                transition: all 0.15s;
            }

            .guide-suggestions button:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.15);
            }

            /* LOADING VIEW */
            #view-loading {
                text-align: center;
                padding: 40px 20px;
            }

            .guide-spinner {
                width: 40px;
                height: 40px;
                margin: 0 auto 16px;
                border: 3px solid rgba(255, 255, 255, 0.1);
                border-top-color: #0a84ff;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            #view-loading p {
                color: rgba(255, 255, 255, 0.6);
                margin: 0;
            }

            /* STEPS VIEW */
            .guide-progress {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }

            .guide-back {
                background: none;
                border: none;
                color: #0a84ff;
                font-size: 13px;
                cursor: pointer;
                padding: 4px 0;
            }

            .guide-back:hover {
                text-decoration: underline;
            }

            .guide-dots {
                display: flex;
                gap: 6px;
            }

            .guide-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.15);
                transition: all 0.2s;
            }

            .guide-dot.done {
                background: #30d158;
            }

            .guide-dot.current {
                background: #0a84ff;
                transform: scale(1.2);
            }

            .guide-step-card {
                display: flex;
                gap: 14px;
                background: linear-gradient(135deg, #0a84ff, #5e5ce6);
                border-radius: 14px;
                padding: 18px;
                margin-bottom: 14px;
            }

            .guide-step-card.complete {
                background: linear-gradient(135deg, #30d158, #34c759);
            }

            .step-number {
                width: 36px;
                height: 36px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                color: white;
                font-size: 16px;
                flex-shrink: 0;
            }

            .step-content {
                flex: 1;
            }

            .step-icon {
                font-size: 24px;
                margin-bottom: 8px;
            }

            .step-text {
                color: white;
                font-size: 16px;
                font-weight: 600;
                line-height: 1.4;
                margin-bottom: 6px;
            }

            .step-detail {
                color: rgba(255, 255, 255, 0.85);
                font-size: 13px;
                line-height: 1.4;
            }

            .guide-nav {
                display: flex;
                gap: 10px;
            }

            .nav-prev {
                width: 48px;
                padding: 14px;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                border-radius: 10px;
                color: white;
                font-size: 16px;
                cursor: pointer;
                transition: background 0.15s;
            }

            .nav-prev:hover:not(:disabled) {
                background: rgba(255, 255, 255, 0.15);
            }

            .nav-prev:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }

            .nav-next {
                flex: 1;
                padding: 14px 20px;
                background: #30d158;
                border: none;
                border-radius: 10px;
                color: white;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s;
            }

            .nav-next:hover {
                background: #2ac84e;
            }

            /* ERROR VIEW */
            .guide-error {
                text-align: center;
                padding: 30px 20px;
            }

            .error-icon {
                font-size: 48px;
                display: block;
                margin-bottom: 12px;
            }

            .guide-error p {
                color: rgba(255, 255, 255, 0.6);
                margin: 0 0 20px;
            }

            #guide-retry {
                padding: 12px 28px;
                background: #0a84ff;
                border: none;
                border-radius: 10px;
                color: white;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            }

            #guide-retry:hover {
                background: #0070e0;
            }
        `;
    }

    getPanelSize() {
        if (!this.panel) return { width: 340, height: 420 };
        const rect = this.panel.getBoundingClientRect();
        return {
            width: rect.width || this.panel.offsetWidth || 340,
            height: rect.height || this.panel.offsetHeight || 420
        };
    }

    clampToViewport(x, y) {
        const { width, height } = this.getPanelSize();
        const pad = this.viewportPadding;
        const maxX = Math.max(pad, window.innerWidth - width - pad);
        const maxY = Math.max(pad, window.innerHeight - height - pad);
        return {
            x: Math.max(pad, Math.min(maxX, Number(x) || pad)),
            y: Math.max(pad, Math.min(maxY, Number(y) || pad))
        };
    }

    resolveDockPosition() {
        const { width, height } = this.getPanelSize();
        const pad = this.viewportPadding;
        const gap = 16;
        const captionBar = document.getElementById('caption-bar');
        const shell = document.getElementById('accessibility-shell');
        const anchor = captionBar?.getBoundingClientRect() || shell?.getBoundingClientRect();

        if (!anchor) {
            return this.clampToViewport(20, Math.max(20, window.innerHeight - height - 20));
        }

        const preferredLeft = anchor.left - width - gap;
        const preferredTop = anchor.bottom - height;
        return this.clampToViewport(preferredLeft, preferredTop);
    }

    applyFloatingPosition(x, y) {
        if (!this.panel) return;
        const clamped = this.clampToViewport(x, y);
        this.panelMode = 'floating';
        this.floatingPosition = { ...clamped };
        this.panel.classList.remove('docked');
        this.panel.classList.add('floating');
        this.panel.style.left = `${clamped.x}px`;
        this.panel.style.top = `${clamped.y}px`;
    }

    dockToLeft() {
        if (!this.panel) return;
        const dock = this.resolveDockPosition();
        this.panelMode = 'docked';
        this.panel.classList.remove('floating');
        this.panel.classList.add('docked');
        this.panel.style.left = `${dock.x}px`;
        this.panel.style.top = `${dock.y}px`;
    }

    repositionDocked() {
        if (!this.panel) return;
        if (this.panelMode === 'docked') {
            this.dockToLeft();
            return;
        }
        this.applyFloatingPosition(this.floatingPosition.x, this.floatingPosition.y);
    }

    // =========================================================================
    // DRAGGING
    // =========================================================================

    setupDragging() {
        const header = document.getElementById('guide-header');

        // Enable mouse events when hovering over panel
        this.panel.addEventListener('mouseenter', () => {
            window.electronAPI?.setIgnoreMouseEvents(false);
        });

        // Disable mouse events (click-through) when leaving panel
        this.panel.addEventListener('mouseleave', () => {
            if (!this.isDragging) {
                window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
            }
        });

        header.addEventListener('dblclick', () => {
            this.dockToLeft();
        });

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            if (e.button !== 0) return;
            const activeDragOwner = String(window.__relayActiveDragOwner || '');
            if (activeDragOwner && activeDragOwner !== 'guide') return;
            window.__relayActiveDragOwner = 'guide';
            e.preventDefault();

            if (this.panelMode !== 'floating') {
                const rect = this.panel.getBoundingClientRect();
                this.applyFloatingPosition(rect.left, rect.top);
            }

            const rect = this.panel.getBoundingClientRect();

            this.isDragging = true;
            this.dragStart = { x: e.clientX, y: e.clientY };
            this.panelStart = {
                x: rect.left,
                y: rect.top
            };

            document.body.style.userSelect = 'none';
            // Keep mouse events enabled during drag
            window.electronAPI?.setIgnoreMouseEvents(false);
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const dx = e.clientX - this.dragStart.x;
            const dy = e.clientY - this.dragStart.y;

            let newX = this.panelStart.x + dx;
            let newY = this.panelStart.y + dy;

            this.applyFloatingPosition(newX, newY);
        });

        document.addEventListener('mouseup', (event) => {
            if (this.isDragging) {
                this.isDragging = false;
                document.body.style.userSelect = '';
                if (String(window.__relayActiveDragOwner || '') === 'guide') {
                    window.__relayActiveDragOwner = '';
                }
                if (typeof event?.clientX === 'number' && typeof event?.clientY === 'number') {
                    const target = document.elementFromPoint(event.clientX, event.clientY);
                    const overInteractive = Boolean(
                        target?.closest?.(
                            '#caption-bar, #gesture-panel, #layer-3-guidance, #layer-4-emergency, #confusion-help, #audio-guide-modal, #meeting-summary-modal, .modal-overlay, #mode-dropdown'
                        )
                    );
                    if (overInteractive) {
                        window.electronAPI?.setIgnoreMouseEvents(false);
                    } else {
                        window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
                    }
                }
            }
        });

        window.addEventListener('blur', () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            document.body.style.userSelect = '';
            if (String(window.__relayActiveDragOwner || '') === 'guide') {
                window.__relayActiveDragOwner = '';
            }
        });

        window.addEventListener('resize', () => {
            this.repositionDocked();
        });

        window.addEventListener('mode-changed', () => {
            this.repositionDocked();
        });
    }

    // =========================================================================
    // BUTTONS
    // =========================================================================

    setupButtons() {
        // Close button
        document.getElementById('guide-close').addEventListener('click', () => {
            this.close();
        });

        // Submit query
        document.getElementById('guide-submit').addEventListener('click', () => {
            this.submitQuery();
        });

        document.getElementById('guide-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.submitQuery();
        });

        // Suggestions
        document.querySelectorAll('.guide-suggestions button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('guide-input').value = btn.dataset.q;
                this.submitQuery();
            });
        });

        // Back to ask
        document.getElementById('guide-back').addEventListener('click', () => {
            this.reset();
        });

        // Retry on error
        document.getElementById('guide-retry').addEventListener('click', () => {
            this.reset();
        });

        // Navigation
        document.getElementById('nav-prev').addEventListener('click', () => {
            this.prevStep();
        });

        document.getElementById('nav-next').addEventListener('click', () => {
            this.nextStep();
        });
    }

    // =========================================================================
    // KEYBOARD
    // =========================================================================

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + / to toggle
            if ((e.metaKey || e.ctrlKey) && e.key === '/') {
                e.preventDefault();
                this.toggle();
            }

            // Escape to close
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    // =========================================================================
    // OPEN / CLOSE
    // =========================================================================

    open() {
        this.isOpen = true;
        this.container.classList.add('open');
        window.electronAPI?.expandOverlay();
        if (this.panelMode === 'docked') {
            this.dockToLeft();
        } else {
            this.applyFloatingPosition(this.floatingPosition.x, this.floatingPosition.y);
        }

        setTimeout(() => {
            document.getElementById('guide-input')?.focus();
            this.repositionDocked();
        }, 200);
    }

    close() {
        this.isOpen = false;
        this.container.classList.remove('open');
        const mode = String(document.body?.dataset?.accessibilityMode || '').toLowerCase();
        const adaptiveHeightFn = window.__relayGetOverlayHeightForMode;
        const restoreHeight = typeof adaptiveHeightFn === 'function'
            ? adaptiveHeightFn(mode === 'blind' ? 'blind' : 'deaf')
            : (mode === 'blind' ? 220 : 680);
        if (window.electronAPI?.setOverlayHeight) {
            window.electronAPI.setOverlayHeight(restoreHeight);
        } else {
            window.electronAPI?.collapseOverlay();
        }

        // Reset to ask view after animation
        setTimeout(() => {
            this.showView('ask');
        }, 200);
    }

    hide() {
        this.close();
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    reset() {
        this.currentSteps = [];
        this.currentStepIndex = 0;
        this.isFinished = false;
        this.showView('ask');
        document.getElementById('guide-input').value = '';
        document.getElementById('guide-input').focus();
    }

    // =========================================================================
    // VIEWS
    // =========================================================================

    showView(viewName) {
        document.querySelectorAll('.guide-view').forEach(v => {
            v.classList.remove('active');
        });
        document.getElementById(`view-${viewName}`).classList.add('active');
    }

    // =========================================================================
    // QUERY
    // =========================================================================

    submitQuery() {
        const input = document.getElementById('guide-input');
        const query = input.value.trim();
        if (!query) return;

        this.generateGuide(query);
    }

    async generateGuide(query) {
        this.showView('loading');

        try {
            const result = await window.electronAPI.aiGenerateGuide(query);

            if (result.success && result.guide?.steps?.length) {
                this.startGuide(result.guide.steps);
            } else {
                throw new Error(result.error || 'Failed to generate guide');
            }
        } catch (err) {
            document.getElementById('error-msg').textContent = err.message;
            this.showView('error');
        }
    }

    // =========================================================================
    // GUIDE STEPS
    // =========================================================================

    startGuide(steps) {
        this.currentSteps = steps;
        this.currentStepIndex = 0;
        this.isFinished = false;

        // Create dots
        const dotsContainer = document.getElementById('guide-dots');
        dotsContainer.innerHTML = steps.map((_, i) =>
            `<div class="guide-dot" data-index="${i}"></div>`
        ).join('');

        this.showStep();
        this.showView('steps');
    }

    showStep() {
        const step = this.currentSteps[this.currentStepIndex];
        const isLast = this.currentStepIndex === this.currentSteps.length - 1;

        // Update card
        const card = document.getElementById('guide-step-card');
        card.classList.remove('complete');

        document.getElementById('step-number').textContent = this.currentStepIndex + 1;
        document.getElementById('step-icon').textContent = step.icon || '👆';
        document.getElementById('step-text').textContent = step.instruction;
        document.getElementById('step-detail').textContent = step.detail || '';

        // Update dots
        document.querySelectorAll('.guide-dot').forEach((dot, i) => {
            dot.classList.remove('done', 'current');
            if (i < this.currentStepIndex) {
                dot.classList.add('done');
            } else if (i === this.currentStepIndex) {
                dot.classList.add('current');
            }
        });

        // Update nav buttons
        document.getElementById('nav-prev').disabled = this.currentStepIndex === 0;
        document.getElementById('nav-next').textContent = isLast ? 'Finish ✓' : 'Next Step →';
    }

    prevStep() {
        if (this.currentStepIndex > 0) {
            this.currentStepIndex--;
            this.showStep();
        }
    }

    nextStep() {
        // If already finished, close the guide
        if (this.isFinished) {
            this.close();
            return;
        }

        // Mark current as complete briefly
        document.getElementById('guide-step-card').classList.add('complete');

        setTimeout(() => {
            if (this.currentStepIndex < this.currentSteps.length - 1) {
                this.currentStepIndex++;
                this.showStep();
            } else {
                this.finishGuide();
            }
        }, 300);
    }

    finishGuide() {
        this.isFinished = true;

        const card = document.getElementById('guide-step-card');
        card.classList.add('complete');

        document.getElementById('step-icon').textContent = '🎉';
        document.getElementById('step-text').textContent = 'All Done!';
        document.getElementById('step-detail').textContent = 'You completed all the steps.';

        // Mark all dots as done
        document.querySelectorAll('.guide-dot').forEach(dot => {
            dot.classList.remove('current');
            dot.classList.add('done');
        });

        document.getElementById('nav-next').textContent = 'Close';
    }
}

// Initialize
window.cvNavigator = new RelayGuide();
export { RelayGuide };
