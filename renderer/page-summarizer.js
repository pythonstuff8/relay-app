/**
 * Page Summarizer
 * Generates concise summaries of the current page for screen readers
 * Integrates with BlindMode without changing UI
 */

export class PageSummarizer {
    constructor(blindMode) {
        this.blindMode = blindMode;
        this.lastSummary = null;
        this.isProcessing = false;
    }

    /**
     * Analyze and summarize the current page
     * @returns {Promise<string>} Page summary
     */
    async summarizePage() {
        if (this.isProcessing) {
            return 'Already generating summary. Please wait.';
        }

        this.isProcessing = true;
        this.blindMode?.playEarcon('processing');

        try {
            // Capture current screen
            if (window.electronAPI?.captureScreen) {
                const result = await window.electronAPI.captureScreen({
                    mode: 'screen',
                    detail: 'high',
                    prompt: 'Provide a concise accessibility-focused summary of this screen.'
                });
                if (result?.description) {
                    this.lastSummary = this.formatSummary(result.description);
                    return this.lastSummary;
                }
            } else if (window.electronAPI?.explainScreen) {
                const result = await window.electronAPI.explainScreen();
                if (result?.explanation || result?.description) {
                    this.lastSummary = this.formatSummary(result.explanation || result.description);
                    return this.lastSummary;
                }
            }

            // Fallback: Analyze DOM structure
            const domSummary = this.analyzeDOM();
            this.lastSummary = domSummary;
            return domSummary;

        } catch (error) {
            console.error('[PageSummarizer] Error:', error);
            return 'Unable to summarize page. Please try again.';
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Analyze DOM structure for accessibility summary
     * @returns {string} Structured summary
     */
    analyzeDOM() {
        const elements = [];

        // Get page title
        const title = document.title || 'Untitled Page';
        elements.push(`Page: ${title}`);

        // Count interactive elements
        const buttons = document.querySelectorAll('button').length;
        const links = document.querySelectorAll('a').length;
        const inputs = document.querySelectorAll('input, textarea, select').length;

        if (buttons > 0) elements.push(`${buttons} button${buttons !== 1 ? 's' : ''}`);
        if (links > 0) elements.push(`${links} link${links !== 1 ? 's' : ''}`);
        if (inputs > 0) elements.push(`${inputs} input field${inputs !== 1 ? 's' : ''}`);

        // Check for main content areas
        const mainContent = document.querySelector('main, [role="main"], .main-content');
        if (mainContent) {
            const text = mainContent.innerText || '';
            const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
            elements.push(`Main content: approximately ${wordCount} words`);
        }

        // Check for alerts/notifications
        const alerts = document.querySelectorAll('[role="alert"], .alert, .notification');
        if (alerts.length > 0) {
            elements.push(`${alerts.length} notification${alerts.length !== 1 ? 's' : ''} present`);
        }

        // Check for captions/transcript
        const transcript = document.getElementById('transcript');
        if (transcript) {
            const captionText = transcript.innerText || '';
            if (captionText) {
                const preview = captionText.slice(-200); // Last 200 chars
                elements.push(`Recent captions: "${preview}"`);
            } else {
                elements.push('No captions currently available');
            }
        }

        return elements.join('. ');
    }

    /**
     * Format AI description into readable summary
     * @param {string} description
     * @returns {string}
     */
    formatSummary(description) {
        // Clean up and format the description
        return description
            .replace(/\s+/g, ' ')
            .replace(/\[|\]/g, '')
            .trim();
    }

    /**
     * Speak the page summary
     */
    async speakSummary() {
        const summary = await this.summarizePage();
        if (this.blindMode) {
            await this.blindMode.speak(`Page Summary: ${summary}`, 'high');
        }
        return summary;
    }

    /**
     * Get summary as text (for display or export)
     * @returns {Promise<string>}
     */
    async getTextSummary() {
        return await this.summarizePage();
    }

    /**
     * Summarize specific element by selector
     * @param {string} selector
     * @returns {string}
     */
    summarizeElement(selector) {
        const element = document.querySelector(selector);
        if (!element) return 'Element not found';

        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute('role') || '';
        const label = element.getAttribute('aria-label') ||
                     element.getAttribute('title') ||
                     element.innerText?.slice(0, 100) || '';

        const state = element.disabled ? 'disabled' :
                     element.checked ? 'checked' :
                     element.expanded ? 'expanded' : '';

        let description = `${tagName}`;
        if (role) description += `, ${role}`;
        if (label) description += `: ${label}`;
        if (state) description += `, ${state}`;

        return description;
    }
}

export default PageSummarizer;
