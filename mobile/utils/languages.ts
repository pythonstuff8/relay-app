export const SUPPORTED_LANGUAGES = [
  { name: 'English', deepgram: 'en-US', tts: 'en-US', openai: 'English' },
  { name: 'Spanish', deepgram: 'es', tts: 'es-ES', openai: 'Spanish' },
  { name: 'French', deepgram: 'fr', tts: 'fr-FR', openai: 'French' },
  { name: 'Hindi', deepgram: 'hi', tts: 'hi-IN', openai: 'Hindi' },
  { name: 'Mandarin', deepgram: 'zh-CN', tts: 'zh-CN', openai: 'Chinese (Mandarin)' },
  { name: 'Arabic', deepgram: 'ar', tts: 'ar-SA', openai: 'Arabic' }
];

export function getNextLanguage(currentIndex: number): number {
  return (currentIndex + 1) % SUPPORTED_LANGUAGES.length;
}
