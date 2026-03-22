/**
 * Relay - Audio Capture Service
 *
 * This module captures system audio and microphone input,
 * processes it, and streams it to the transcription service.
 */

import { DeepgramService, TranscriptResult } from "./deepgram-service";

// Types
export interface AudioCaptureConfig {
  sampleRate: number;
  channels: number;
  captureSystemAudio: boolean;
  captureMicrophone: boolean;
  noiseReduction: boolean;
}

export interface AudioChunk {
  data: Buffer;
  timestamp: number;
  source: "system" | "microphone" | "mixed";
}

type AudioDataCallback = (chunk: AudioChunk) => void;

const DEFAULT_AUDIO_CONFIG: AudioCaptureConfig = {
  sampleRate: 16000,
  channels: 1, // Mono for speech recognition
  captureSystemAudio: true,
  captureMicrophone: false,
  noiseReduction: true,
};

/**
 * AudioCaptureService - Captures and processes audio from system and microphone
 */
export class AudioCaptureService {
  private config: AudioCaptureConfig;
  private isCapturing: boolean = false;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;

  // Deepgram integration
  private deepgramService: DeepgramService | null = null;
  private onTranscriptCallback: ((result: TranscriptResult) => void) | null = null;

  constructor(config?: Partial<AudioCaptureConfig>) {
    this.config = { ...DEFAULT_AUDIO_CONFIG, ...config };
  }

  /**
   * Initialize audio capture with Deepgram transcription
   */
  async startWithTranscription(
    onTranscript: (result: TranscriptResult) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    this.onTranscriptCallback = onTranscript;

    // Initialize Deepgram
    this.deepgramService = new DeepgramService();
    this.deepgramService.configure({
      sampleRate: this.config.sampleRate,
      encoding: "linear16",
    });

    // Start Deepgram streaming
    await this.deepgramService.startStreaming(
      onTranscript,
      onError,
      () => {
        console.log("AudioCapture: Utterance ended");
      }
    );

    // Start audio capture
    await this.startCapture((chunk) => {
      this.deepgramService?.sendAudio(chunk.data);
    });
  }

  /**
   * Start capturing audio
   */
  async startCapture(onAudioData: AudioDataCallback): Promise<void> {
    if (this.isCapturing) {
      console.warn("AudioCaptureService: Already capturing");
      return;
    }

    try {
      // Create audio context
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Get audio sources
      const constraints: MediaStreamConstraints = {
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          echoCancellation: true,
          noiseSuppression: this.config.noiseReduction,
          autoGainControl: true,
        },
      };

      // For system audio capture on desktop, we need platform-specific APIs
      // This is a simplified version using getUserMedia for microphone
      // In production, use ScreenCaptureKit (macOS) or WASAPI (Windows)
      if (this.config.captureMicrophone) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      // For system audio (Electron/desktop app)
      if (this.config.captureSystemAudio) {
        // In Electron, use desktopCapturer for system audio
        // This is a placeholder - actual implementation depends on platform
        await this.captureSystemAudio();
      }

      if (this.mediaStream) {
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);

        // Create processor for raw audio data
        // Note: ScriptProcessorNode is deprecated, use AudioWorklet in production
        const bufferSize = 4096;
        this.processor = this.audioContext.createScriptProcessor(
          bufferSize,
          this.config.channels,
          this.config.channels
        );

        this.processor.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);

          // Convert Float32Array to Int16Array (linear16 for Deepgram)
          const int16Data = this.float32ToInt16(inputData);

          const chunk: AudioChunk = {
            data: Buffer.from(int16Data.buffer),
            timestamp: Date.now(),
            source: this.config.captureMicrophone ? "microphone" : "system",
          };

          onAudioData(chunk);
        };

        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
      }

      this.isCapturing = true;
      console.log("AudioCaptureService: Started capturing");
    } catch (error) {
      console.error("AudioCaptureService: Failed to start capture", error);
      throw error;
    }
  }

  /**
   * Stop capturing audio
   */
  async stopCapture(): Promise<void> {
    // Stop Deepgram
    if (this.deepgramService) {
      await this.deepgramService.stop();
      this.deepgramService = null;
    }

    // Stop audio processing
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.isCapturing = false;
    this.onTranscriptCallback = null;
    console.log("AudioCaptureService: Stopped capturing");
  }

  /**
   * Check if currently capturing
   */
  isActive(): boolean {
    return this.isCapturing;
  }

  /**
   * Capture system audio (platform-specific implementation)
   * This is a placeholder - actual implementation needs platform APIs
   */
  private async captureSystemAudio(): Promise<void> {
    // macOS: Use ScreenCaptureKit with audio-only capture
    // Windows: Use WASAPI loopback capture
    // Linux: Use PulseAudio monitor

    // For Electron apps, we can use desktopCapturer:
    /*
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      fetchWindowIcons: false,
    });

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
        },
      },
    });

    // Extract audio track
    const audioTrack = stream.getAudioTracks()[0];
    */

    console.log("AudioCaptureService: System audio capture requires platform-specific implementation");
  }

  /**
   * Convert Float32Array audio samples to Int16Array (linear16)
   */
  private float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] and scale to Int16 range
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }
}

/**
 * Factory function to create AudioCaptureService with transcription
 */
export async function createAudioCaptureWithTranscription(
  onTranscript: (result: TranscriptResult) => void,
  onError?: (error: Error) => void,
  config?: Partial<AudioCaptureConfig>
): Promise<AudioCaptureService> {
  const service = new AudioCaptureService(config);
  await service.startWithTranscription(onTranscript, onError);
  return service;
}

export default AudioCaptureService;
