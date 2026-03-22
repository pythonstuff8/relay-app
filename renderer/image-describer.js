/**
 * Image Describer
 * Converts images to natural language descriptions using AI
 * Integrates with BlindMode for audio output
 */

export class ImageDescriber {
    constructor(blindMode) {
        this.blindMode = blindMode;
        this.isProcessing = false;
        this.supportedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    }

    /**
     * Process an image file and generate description
     * @param {File|Blob|string} imageSource - Image file, blob, or data URL
     * @returns {Promise<object>} Description result
     */
    async describeImage(imageSource) {
        if (this.isProcessing) {
            return { success: false, error: 'Already processing an image' };
        }

        this.isProcessing = true;
        this.blindMode?.playEarcon('processing');

        try {
            let imageData;

            if (typeof imageSource === 'string') {
                // Data URL or URL
                imageData = imageSource;
            } else if (imageSource instanceof File || imageSource instanceof Blob) {
                // Convert to data URL
                imageData = await this.fileToDataURL(imageSource);
            } else {
                throw new Error('Unsupported image source type');
            }

            // Use Electron API for AI vision analysis
            if (window.electronAPI?.analyzeImage) {
                const result = await window.electronAPI.analyzeImage(imageData, {
                    mode: 'image',
                    detail: 'brief',
                    prompt: 'Describe only the actual image content. Ignore Relay UI, overlays, captions, toolbars, chat panels, and app chrome.'
                });
                if (result.success) {
                    return {
                        success: true,
                        description: result.description,
                        objects: result.objects || [],
                        text: result.text || '',
                        confidence: result.confidence || 0.8
                    };
                }
            }

            // Fallback: Basic image info
            const basicInfo = await this.getBasicImageInfo(imageData);
            return {
                success: true,
                description: basicInfo,
                objects: [],
                text: '',
                confidence: 0.5
            };

        } catch (error) {
            console.error('[ImageDescriber] Error:', error);
            return {
                success: false,
                error: error.message || 'Failed to analyze image'
            };
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Convert File/Blob to data URL
     * @param {File|Blob} file
     * @returns {Promise<string>}
     */
    fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Get basic image information
     * @param {string} dataUrl
     * @returns {Promise<string>}
     */
    getBasicImageInfo(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const width = img.naturalWidth;
                const height = img.naturalHeight;
                const aspectRatio = width > height ? 'landscape' : width < height ? 'portrait' : 'square';
                resolve(`Image: ${width} by ${height} pixels, ${aspectRatio} orientation`);
            };
            img.onerror = () => resolve('Image file (unable to determine dimensions)');
            img.src = dataUrl;
        });
    }

    /**
     * Describe and speak image description
     * @param {File|Blob|string} imageSource
     */
    async describeAndSpeak(imageSource) {
        const result = await this.describeImage(imageSource);

        if (result.success) {
            let speechText = result.description;

            if (result.text) {
                speechText += `. Text in image: "${result.text}"`;
            }

            if (this.blindMode) {
                await this.blindMode.speak(`Image description: ${speechText}`, 'high');
            }

            return speechText;
        } else {
            const errorMsg = `Unable to describe image: ${result.error}`;
            if (this.blindMode) {
                await this.blindMode.speak(errorMsg, 'high');
            }
            return errorMsg;
        }
    }

    /**
     * Setup drag and drop for image files
     * @param {HTMLElement} targetElement
     */
    setupDragAndDrop(targetElement) {
        if (!targetElement) return;

        targetElement.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            targetElement.classList.add('drag-over');
        });

        targetElement.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            targetElement.classList.remove('drag-over');
        });

        targetElement.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            targetElement.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files);
            const imageFiles = files.filter(f =>
                this.supportedFormats.includes(f.type)
            );

            if (imageFiles.length > 0) {
                this.blindMode?.playEarcon('processing');
                for (const file of imageFiles) {
                    await this.describeAndSpeak(file);
                }
            }
        });
    }

    /**
     * Capture from camera and describe
     * @returns {Promise<object>}
     */
    async captureFromCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const video = document.createElement('video');
            video.srcObject = stream;

            await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    video.play();
                    resolve();
                };
            });

            // Capture frame
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            // Stop stream
            stream.getTracks().forEach(track => track.stop());

            // Get data URL and describe
            const dataUrl = canvas.toDataURL('image/jpeg');
            return await this.describeAndSpeak(dataUrl);

        } catch (error) {
            console.error('[ImageDescriber] Camera error:', error);
            const errorMsg = 'Unable to access camera. Please check permissions.';
            if (this.blindMode) {
                await this.blindMode.speak(errorMsg, 'high');
            }
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Describe all images on the current page
     */
    async describePageImages() {
        if (window.electronAPI?.captureScreen) {
            try {
                const vision = await window.electronAPI.captureScreen({
                    mode: 'image',
                    detail: 'brief',
                    prompt: 'Describe only the primary visible image content. Ignore Relay controls, captions, overlays, window chrome, and non-image UI.'
                });
                if (vision?.success && vision.description) {
                    if (this.blindMode) {
                        await this.blindMode.speak(`Image description: ${vision.description}`, 'high');
                    }
                    return vision.description;
                }
            } catch (error) {
                console.warn('[ImageDescriber] Screen vision path failed:', error?.message || error);
            }
        }

        const images = document.querySelectorAll('img');
        const imageCount = images.length;

        if (imageCount === 0) {
            const msg = 'No images found on this page';
            if (this.blindMode) {
                await this.blindMode.speak(msg);
            }
            return msg;
        }

        if (this.blindMode) {
            await this.blindMode.speak(`Found ${imageCount} image${imageCount !== 1 ? 's' : ''}. Describing...`);
        }

        const descriptions = [];
        for (let i = 0; i < Math.min(images.length, 3); i++) {
            const img = images[i];
            const altText = img.alt || img.getAttribute('aria-label') || '';

            if (altText) {
                descriptions.push(`Image ${i + 1}: ${altText}`);
            } else {
                descriptions.push(`Image ${i + 1}: No description available`);
            }
        }

        const fullDescription = descriptions.join('. ');
        if (this.blindMode) {
            await this.blindMode.speak(fullDescription);
        }

        return fullDescription;
    }
}

export default ImageDescriber;
