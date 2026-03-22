/**
 * Relay - Deepgram Speech-to-Text Service
 *
 * This module handles real-time speech transcription using Deepgram's Nova-3 model.
 * It provides streaming transcription with speaker diarization, emotion detection,
 * and automatic punctuation.
 */

import { createClient, LiveTranscriptionEvents, LiveClient } from "@deepgram/sdk";

// Types
export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  speaker: number;
  confidence: number;
  punctuated_word?: string;
}

export interface TranscriptResult {
  transcript: string;
  words: TranscriptWord[];
  isFinal: boolean;
  speechFinal: boolean;
  speaker: number | null;
  confidence: number;
}

export interface DeepgramConfig {
  model: "nova-3" | "nova-2" | "enhanced" | "base";
  language: string;
  smartFormat: boolean;
  punctuate: boolean;
  diarize: boolean;
  interimResults: boolean;
  utteranceEndMs: number;
  fillerWords: boolean;
  keywords?: string[];
  sampleRate?: number;
  encoding?: "linear16" | "opus" | "flac";
}

export type TranscriptCallback = (result: TranscriptResult) => void;
export type ErrorCallback = (error: Error) => void;
export type UtteranceEndCallback = () => void;

// Default configuration optimized for Relay
const DEFAULT_CONFIG: DeepgramConfig = {
  model: "nova-3",
  language: "en-US",
  smartFormat: true,
  punctuate: true,
  diarize: true,
  interimResults: true,
  utteranceEndMs: 1000,
  fillerWords: true,
  sampleRate: 16000,
  encoding: "linear16",
};

/**
 * DeepgramService - Handles real-time speech-to-text transcription
 */
export class DeepgramService {
  private client: ReturnType<typeof createClient>;
  private connection: LiveClient | null = null;
  private isConnected: boolean = false;
  private config: DeepgramConfig;

  private onTranscript: TranscriptCallback | null = null;
  private onError: ErrorCallback | null = null;
  private onUtteranceEnd: UtteranceEndCallback | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.DEEPGRAM_API_KEY;
    if (!key) {
      throw new Error("DEEPGRAM_API_KEY is required");
    }
    this.client = createClient(key);
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Configure the transcription settings
   */
  configure(config: Partial<DeepgramConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Add custom keywords for improved recognition
   * Format: ["Relay:2", "PostgreSQL:1.5"] (word:boost_factor)
   */
  setKeywords(keywords: string[]): void {
    this.config.keywords = keywords;
  }

  /**
   * Set the language for transcription
   */
  setLanguage(language: string): void {
    this.config.language = language;
  }

  /**
   * Start streaming transcription
   */
  async startStreaming(
    onTranscript: TranscriptCallback,
    onError?: ErrorCallback,
    onUtteranceEnd?: UtteranceEndCallback
  ): Promise<void> {
    if (this.isConnected) {
      console.warn("DeepgramService: Already connected, stopping previous connection");
      await this.stop();
    }

    this.onTranscript = onTranscript;
    this.onError = onError || null;
    this.onUtteranceEnd = onUtteranceEnd || null;

    try {
      this.connection = this.client.listen.live({
        model: this.config.model,
        language: this.config.language,
        smart_format: this.config.smartFormat,
        punctuate: this.config.punctuate,
        diarize: this.config.diarize,
        interim_results: this.config.interimResults,
        utterance_end_ms: this.config.utteranceEndMs,
        filler_words: this.config.fillerWords,
        keywords: this.config.keywords,
        encoding: this.config.encoding,
        sample_rate: this.config.sampleRate,
      });

      this.setupEventHandlers();

      // Wait for connection to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 10000);

        this.connection!.on(LiveTranscriptionEvents.Open, () => {
          clearTimeout(timeout);
          this.isConnected = true;
          console.log("DeepgramService: Connected to Deepgram");
          resolve();
        });

        this.connection!.on(LiveTranscriptionEvents.Error, (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Send audio data to Deepgram for transcription
   * @param audioChunk - Raw audio data (PCM 16-bit, 16kHz mono)
   */
  sendAudio(audioChunk: Buffer | ArrayBuffer): void {
    if (!this.isConnected || !this.connection) {
      console.warn("DeepgramService: Cannot send audio - not connected");
      return;
    }

    try {
      this.connection.send(audioChunk);
    } catch (error) {
      console.error("DeepgramService: Error sending audio", error);
      this.onError?.(error as Error);
    }
  }

  /**
   * Stop the transcription stream
   */
  async stop(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.finish();
      } catch (error) {
        console.error("DeepgramService: Error closing connection", error);
      }
      this.connection = null;
    }
    this.isConnected = false;
    this.onTranscript = null;
    this.onError = null;
    this.onUtteranceEnd = null;
  }

  /**
   * Check if currently connected
   */
  isActive(): boolean {
    return this.isConnected;
  }

  /**
   * Set up event handlers for the Deepgram connection
   */
  private setupEventHandlers(): void {
    if (!this.connection) return;

    // Handle transcript results
    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      try {
        const alternative = data.channel?.alternatives?.[0];
        if (!alternative) return;

        const result: TranscriptResult = {
          transcript: alternative.transcript || "",
          words: (alternative.words || []).map((w: any) => ({
            word: w.word,
            start: w.start,
            end: w.end,
            speaker: w.speaker ?? 0,
            confidence: w.confidence,
            punctuated_word: w.punctuated_word,
          })),
          isFinal: data.is_final ?? false,
          speechFinal: data.speech_final ?? false,
          speaker: this.extractPrimarySpeaker(alternative.words),
          confidence: alternative.confidence ?? 0,
        };

        // Only emit if there's actual content
        if (result.transcript.trim()) {
          this.onTranscript?.(result);
        }
      } catch (error) {
        console.error("DeepgramService: Error processing transcript", error);
      }
    });

    // Handle utterance end (natural pause in speech)
    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      this.onUtteranceEnd?.();
    });

    // Handle errors
    this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error("DeepgramService: Transcription error", error);
      this.onError?.(new Error(error.message || "Deepgram error"));
    });

    // Handle connection close
    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("DeepgramService: Connection closed");
      this.isConnected = false;
    });

    // Handle metadata
    this.connection.on(LiveTranscriptionEvents.Metadata, (data: any) => {
      console.log("DeepgramService: Metadata received", data);
    });
  }

  /**
   * Extract the primary speaker from a list of words
   */
  private extractPrimarySpeaker(words: any[]): number | null {
    if (!words || words.length === 0) return null;

    const speakerCounts = new Map<number, number>();
    for (const word of words) {
      if (word.speaker !== undefined) {
        speakerCounts.set(word.speaker, (speakerCounts.get(word.speaker) || 0) + 1);
      }
    }

    if (speakerCounts.size === 0) return null;

    let maxCount = 0;
    let primarySpeaker = 0;
    for (const [speaker, count] of speakerCounts) {
      if (count > maxCount) {
        maxCount = count;
        primarySpeaker = speaker;
      }
    }

    return primarySpeaker;
  }
}

/**
 * Factory function to create a configured DeepgramService instance
 */
export function createDeepgramService(config?: Partial<DeepgramConfig>): DeepgramService {
  const service = new DeepgramService();
  if (config) {
    service.configure(config);
  }
  return service;
}

// Export default instance for simple usage
export default DeepgramService;
