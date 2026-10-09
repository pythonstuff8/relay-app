import { Linking } from 'react-native';
import { ExpoPlayAudioStream, type Subscription } from '@saltmango/expo-audio-stream';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';

export const MIC_SAMPLE_RATE = 16000;

// Speech output must stay audible with the iPhone silent switch on.
export async function ensurePlaybackAudioMode() {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, interruptionMode: 'duckOthers' });
  } catch {
    // Non-fatal: speech still works with the default session.
  }
}

export async function ensureMicPermission(): Promise<boolean> {
  try {
    const result = await requestRecordingPermissionsAsync();
    return result.granted;
  } catch {
    return false;
  }
}

export function openAppSettings() {
  Linking.openSettings().catch(() => {});
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Loudness of a PCM16 little-endian chunk in dBFS (0 is the loudest possible).
export function pcm16Level(bytes: Uint8Array): number {
  const samples = Math.floor(bytes.length / 2);
  if (samples === 0) return -100;
  const view = new DataView(bytes.buffer, bytes.byteOffset, samples * 2);
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const value = view.getInt16(i * 2, true) / 32768;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / samples);
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

let activeSubscription: Subscription | null = null;
let micActive = false;

// Streams 16 kHz mono PCM16 chunks (about every 100 ms) from the microphone.
// Only one stream can run at a time; starting a new one stops the previous.
export async function startMicStream(onChunk: (bytes: Uint8Array) => void): Promise<void> {
  await stopMicStream();
  // Speech output switches the session to playback-only; recording needs it back.
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, interruptionMode: 'duckOthers' });
  } catch {
    // The stream module also configures the session on first use.
  }
  activeSubscription = ExpoPlayAudioStream.subscribeToAudioEvents(async (event) => {
    if (typeof event.data !== 'string' || !event.data) return;
    onChunk(base64ToBytes(event.data));
  });
  try {
    await ExpoPlayAudioStream.startMicrophone({
      sampleRate: MIC_SAMPLE_RATE,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 100,
    });
    micActive = true;
  } catch (error) {
    activeSubscription?.remove();
    activeSubscription = null;
    throw error;
  }
}

export async function stopMicStream(): Promise<void> {
  activeSubscription?.remove();
  activeSubscription = null;
  if (micActive) {
    micActive = false;
    try {
      await ExpoPlayAudioStream.stopMicrophone();
    } catch {
      // already stopped
    }
    await ensurePlaybackAudioMode();
  }
}
