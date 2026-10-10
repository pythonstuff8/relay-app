import * as Haptics from 'expo-haptics';

// Grade-1 Braille played as vibration: heavy taps are raised dots, light taps flat ones.
// Shared by Braille mode and Feel the Conversation.

// ─── COMPLETE GRADE-1 BRAILLE MAPPING ───
// Standard 6-dot cell: [1,2,3,4,5,6] → dots in columns (left: 1-2-3, right: 4-5-6)
// Value 1 = raised dot, 0 = flat
export const BRAILLE: Record<string, number[]> = {
  a: [1,0,0,0,0,0], b: [1,1,0,0,0,0], c: [1,0,0,1,0,0],
  d: [1,0,0,1,1,0], e: [1,0,0,0,1,0], f: [1,1,0,1,0,0],
  g: [1,1,0,1,1,0], h: [1,1,0,0,1,0], i: [0,1,0,1,0,0],
  j: [0,1,0,1,1,0], k: [1,0,1,0,0,0], l: [1,1,1,0,0,0],
  m: [1,0,1,1,0,0], n: [1,0,1,1,1,0], o: [1,0,1,0,1,0],
  p: [1,1,1,1,0,0], q: [1,1,1,1,1,0], r: [1,1,1,0,1,0],
  s: [0,1,1,1,0,0], t: [0,1,1,1,1,0], u: [1,0,1,0,0,1],
  v: [1,1,1,0,0,1], w: [0,1,0,1,1,1], x: [1,0,1,1,0,1],
  y: [1,0,1,1,1,1], z: [1,0,1,0,1,1],
  ' ': [0,0,0,0,0,0],
  '.': [0,1,0,0,1,1], ',': [0,1,0,0,0,0],
  '!': [0,1,1,0,1,0], '?': [0,1,1,0,0,1],
  '-': [0,0,1,0,0,1], "'": [0,0,1,0,0,0],
};

// Reverse map for input (dot pattern → character)
export const BRAILLE_INPUT: Record<string, string> = {};
for (const [char, dots] of Object.entries(BRAILLE)) {
  BRAILLE_INPUT[dots.join('')] = char;
}

// ─── TIMING CONSTANTS ───
const DOT_ON_MS = 80;        // Duration of a "raised dot" pulse
const DOT_OFF_MS = 60;       // Gap between dots within a cell
const LETTER_GAP_MS = 400;   // Gap between characters
export const WORD_GAP_MS = 700;     // Gap for space character

// ─── HAPTIC PLAYBACK ENGINE ───
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function playBrailleCell(dots: number[], speed: number = 1.0) {
  const dotOn = DOT_ON_MS / speed;
  const dotOff = DOT_OFF_MS / speed;

  for (let i = 0; i < dots.length; i++) {
    if (dots[i] === 1) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await sleep(dotOn); // Raised dots linger so they feel distinct from flat ones.
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (i < dots.length - 1) await sleep(dotOff);
  }
}

export async function playCharacterHaptic(char: string, speed: number = 1.0) {
  const lower = char.toLowerCase();
  const dots = BRAILLE[lower];
  if (!dots) {
    // Unknown character — triple warning buzz
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return;
  }
  if (lower === ' ') {
    await sleep(WORD_GAP_MS / speed);
    return;
  }
  await playBrailleCell(dots, speed);
}

export async function playWordHaptic(word: string, speed: number = 1.0, cancelled: () => boolean = () => false) {
  for (let i = 0; i < word.length; i++) {
    if (cancelled()) return;
    await playCharacterHaptic(word[i], speed);
    if (i < word.length - 1) await sleep(LETTER_GAP_MS / speed);
  }
}

// Lowercase letters and spaces only, so every character has a Braille cell.
export function toBrailleText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
