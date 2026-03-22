// Relay Directional Audio Indicator
// Stereo channel analysis to estimate sound direction

export class DirectionalAudio {
    constructor() {
        this.leftAnalyser = null;
        this.rightAnalyser = null;
        this.splitter = null;
        this.isConnected = false;
    }

    connect(audioContext, source) {
        try {
            // Create stereo splitter
            this.splitter = audioContext.createChannelSplitter(2);
            this.leftAnalyser = audioContext.createAnalyser();
            this.rightAnalyser = audioContext.createAnalyser();
            this.leftAnalyser.fftSize = 256;
            this.rightAnalyser.fftSize = 256;

            source.connect(this.splitter);
            this.splitter.connect(this.leftAnalyser, 0);
            this.splitter.connect(this.rightAnalyser, 1);
            this.isConnected = true;
        } catch (e) {
            // Mono source or unsupported - silently degrade
            this.isConnected = false;
        }
    }

    getDirection() {
        if (!this.isConnected) return 'center';

        const leftData = new Uint8Array(this.leftAnalyser.frequencyBinCount);
        const rightData = new Uint8Array(this.rightAnalyser.frequencyBinCount);
        this.leftAnalyser.getByteFrequencyData(leftData);
        this.rightAnalyser.getByteFrequencyData(rightData);

        let leftEnergy = 0;
        let rightEnergy = 0;
        for (let i = 0; i < leftData.length; i++) {
            leftEnergy += leftData[i];
            rightEnergy += rightData[i];
        }

        const total = leftEnergy + rightEnergy;
        if (total < 100) return 'center'; // Too quiet

        const balance = (rightEnergy - leftEnergy) / total;

        if (balance > 0.15) return 'right';
        if (balance < -0.15) return 'left';
        return 'center';
    }

    getDirectionIcon() {
        const dir = this.getDirection();
        switch (dir) {
            case 'left': return '◀';
            case 'right': return '▶';
            default: return '●';
        }
    }

    disconnect() {
        try {
            if (this.splitter) this.splitter.disconnect();
            if (this.leftAnalyser) this.leftAnalyser.disconnect();
            if (this.rightAnalyser) this.rightAnalyser.disconnect();
        } catch (e) {}
        this.isConnected = false;
    }
}
