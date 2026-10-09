import { AccessibilityInfo } from 'react-native';
import * as Speech from 'expo-speech';

let screenReaderOn = false;

AccessibilityInfo.isScreenReaderEnabled()
  .then((enabled) => { screenReaderOn = enabled; })
  .catch(() => {});
AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => { screenReaderOn = enabled; });

export function isScreenReaderOn() {
  return screenReaderOn;
}

// App prompts. With VoiceOver/TalkBack on, hand them to the screen reader
// instead of talking over it.
export function sayPrompt(text: string) {
  Speech.stop();
  if (screenReaderOn) {
    AccessibilityInfo.announceForAccessibility(text);
    return;
  }
  Speech.speak(text, { language: 'en-US', rate: 1.0 });
}

// Content the user asked for (AI answers, typed text, phrases). Always spoken,
// in the chosen language voice.
export function speakContent(text: string, languageTag: string, rate = 1.0) {
  Speech.stop();
  if (screenReaderOn) {
    AccessibilityInfo.announceForAccessibility(text);
    return;
  }
  Speech.speak(text, { language: languageTag, rate });
}

// Text the user typed to say out loud to someone nearby. Always spoken aloud,
// even with a screen reader on.
export function speakAloud(text: string, languageTag: string, rate = 0.95) {
  Speech.stop();
  Speech.speak(text, { language: languageTag, rate });
}

export function stopSpeaking() {
  Speech.stop();
}
