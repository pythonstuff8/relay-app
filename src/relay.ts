/**
 * Relay - Main Application Entry Point
 *
 * Universal Accessibility Middleware for Deaf and Hard-of-Hearing Users
 *
 * This module initializes and coordinates all Relay services:
 * - Deepgram real-time speech-to-text
 * - Speaker diarization
 * - Sound event detection
 * - UI understanding
 * - Agentic AI assistant
 */

import { DeepgramService, TranscriptResult, createDeepgramService } from "./services/deepgram-service";
import { AudioCaptureService, createAudioCaptureWithTranscription } from "./services/audio-capture";

// Types
export interface RelayConfig {
  // API Keys
  deepgramApiKey?: string;
  openaiApiKey?: string;

  // Features
  enableCaptions: boolean;
  enableSoundAlerts: boolean;
  enableUIAssistant: boolean;
  enableMeetingMode: boolean;

  // Transcription
  transcriptionLanguage: string;
  customKeywords: string[];
  forceOfflineMode: boolean;

  // Display
  captionFontSize: number;
  captionPosition: "floating" | "top" | "bottom";
  showSpeakerNames: boolean;
  showEmotions: boolean;

  // Privacy
  storeTranscripts: boolean;
  transcriptRetentionHours: number;
}

export interface RelayEvents {
  onTranscript: (result: TranscriptResult) => void;
  onSoundEvent: (event: SoundEvent) => void;
  onError: (error: Error) => void;
  onStatusChange: (status: RelayStatus) => void;
}

export interface SoundEvent {
  type: string;
  category: "emergency" | "attention" | "communication" | "appliance" | "environmental" | "media";
  confidence: number;
  timestamp: number;
  direction?: number; // degrees, if directional audio available
}

export type RelayStatus =
  | "initializing"
  | "ready"
  | "listening"
  | "processing"
  | "error"
  | "offline";

const DEFAULT_CONFIG: RelayConfig = {
  enableCaptions: true,
  enableSoundAlerts: true,
  enableUIAssistant: true,
  enableMeetingMode: true,
  transcriptionLanguage: "en-US",
  customKeywords: [],
  forceOfflineMode: false,
  captionFontSize: 18,
  captionPosition: "bottom",
  showSpeakerNames: true,
  showEmotions: true,
  storeTranscripts: false,
  transcriptRetentionHours: 24,
};

/**
 * Relay - Main Application Class
 */
export class Relay {
  private config: RelayConfig;
  private events: Partial<RelayEvents>;
  private status: RelayStatus = "initializing";

  // Services
  private deepgramService: DeepgramService | null = null;
  private audioCaptureService: AudioCaptureService | null = null;

  // State
  private isRunning: boolean = false;
  private transcriptHistory: TranscriptResult[] = [];
  private speakerNames: Map<number, string> = new Map();

  constructor(config?: Partial<RelayConfig>, events?: Partial<RelayEvents>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events || {};

    // Validate API key
    if (!this.config.deepgramApiKey && !process.env.DEEPGRAM_API_KEY) {
      console.warn("Relay: No Deepgram API key provided. Will use offline mode.");
      this.config.forceOfflineMode = true;
    }
  }

  /**
   * Initialize Relay
   */
  async initialize(): Promise<void> {
    this.setStatus("initializing");

    try {
      // Initialize Deepgram service
      if (!this.config.forceOfflineMode) {
        this.deepgramService = createDeepgramService({
          model: "nova-3",
          language: this.config.transcriptionLanguage,
          diarize: true,
          interimResults: true,
          keywords: this.config.customKeywords,
        });
      }

      this.setStatus("ready");
      console.log("Relay: Initialized successfully");
    } catch (error) {
      this.setStatus("error");
      this.events.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Start listening and processing
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("Relay: Already running");
      return;
    }

    try {
      this.setStatus("listening");

      // Start audio capture with transcription
      this.audioCaptureService = new AudioCaptureService({
        captureSystemAudio: true,
        captureMicrophone: false,
        sampleRate: 16000,
      });

      await this.audioCaptureService.startWithTranscription(
        (result) => this.handleTranscript(result),
        (error) => this.handleError(error)
      );

      this.isRunning = true;
      console.log("Relay: Started listening");
    } catch (error) {
      this.setStatus("error");
      this.events.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Stop listening
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.audioCaptureService?.stopCapture();
      this.audioCaptureService = null;
      this.isRunning = false;
      this.setStatus("ready");
      console.log("Relay: Stopped listening");
    } catch (error) {
      this.events.onError?.(error as Error);
    }
  }

  /**
   * Get current status
   */
  getStatus(): RelayStatus {
    return this.status;
  }

  /**
   * Check if running
   */
  isListening(): boolean {
    return this.isRunning;
  }

  /**
   * Get transcript history
   */
  getTranscriptHistory(): TranscriptResult[] {
    return [...this.transcriptHistory];
  }

  /**
   * Clear transcript history
   */
  clearTranscriptHistory(): void {
    this.transcriptHistory = [];
  }

  /**
   * Set a speaker's name for display
   */
  setSpeakerName(speakerId: number, name: string): void {
    this.speakerNames.set(speakerId, name);
  }

  /**
   * Get speaker names map
   */
  getSpeakerNames(): Map<number, string> {
    return new Map(this.speakerNames);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RelayConfig>): void {
    this.config = { ...this.config, ...config };

    // Update Deepgram if language changed
    if (config.transcriptionLanguage) {
      this.deepgramService?.setLanguage(config.transcriptionLanguage);
    }

    // Update keywords
    if (config.customKeywords) {
      this.deepgramService?.setKeywords(config.customKeywords);
    }
  }

  /**
   * Handle incoming transcript
   */
  private handleTranscript(result: TranscriptResult): void {
    // Store in history if final
    if (result.isFinal && this.config.storeTranscripts) {
      this.transcriptHistory.push(result);

      // Trim history based on retention
      const cutoff = Date.now() - this.config.transcriptRetentionHours * 60 * 60 * 1000;
      this.transcriptHistory = this.transcriptHistory.filter(
        (t) => t.words[0]?.start * 1000 > cutoff
      );
    }

    // Emit event
    this.events.onTranscript?.(result);
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    console.error("Relay: Error", error);
    this.events.onError?.(error);

    // Try to recover
    if (error.message.includes("connection") || error.message.includes("network")) {
      this.setStatus("offline");
      // Could attempt reconnection here
    }
  }

  /**
   * Set and emit status
   */
  private setStatus(status: RelayStatus): void {
    this.status = status;
    this.events.onStatusChange?.(status);
  }

  /**
   * Cleanup on destroy
   */
  async destroy(): Promise<void> {
    await this.stop();
    this.deepgramService = null;
    this.transcriptHistory = [];
    this.speakerNames.clear();
  }
}

/**
 * Create and initialize a Relay instance
 */
export async function createRelay(
  config?: Partial<RelayConfig>,
  events?: Partial<RelayEvents>
): Promise<Relay> {
  const instance = new Relay(config, events);
  await instance.initialize();
  return instance;
}

// Export everything
export { DeepgramService, AudioCaptureService };
export default Relay;
