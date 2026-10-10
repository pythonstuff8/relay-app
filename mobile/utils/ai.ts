import type { CameraView } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { chatCompletion } from './relayApi';

// Downscale before upload: faster, cheaper, and well under the proxy's body limit.
export async function captureForAI(camera: CameraView | null, maxWidth: number): Promise<string> {
  if (!camera) throw new Error('Camera is not ready');
  const photo = await camera.takePictureAsync({ quality: 0.7, skipProcessing: false });
  if (!photo?.uri) throw new Error('No camera frame captured');
  const resized = await manipulateAsync(
    photo.uri,
    photo.width > maxWidth ? [{ resize: { width: maxWidth } }] : [],
    { compress: 0.6, format: SaveFormat.JPEG, base64: true }
  );
  if (!resized.base64) throw new Error('Could not encode the photo');
  return resized.base64;
}

export async function describeSurroundings(
  base64Jpeg: string,
  question: string,
  languageName: string,
  detail: 'low' | 'high' = 'low'
): Promise<string> {
  const query = question.trim() || 'What is in front of me?';
  return chatCompletion({
    model: 'gpt-4o-mini',
    maxTokens: 150,
    temperature: 0.2,
    system:
      'You are a navigation assistant for a blind or low-vision person. Answer their question about what the camera sees. ' +
      'Give physical, spatial directions (for example: to your left, at 2 o\'clock, about three steps ahead). ' +
      'Mention hazards first. Keep it to 1-3 short sentences. Do not mention the image or the camera. ' +
      `Reply only in ${languageName}.`,
    user: [
      { type: 'text', text: `Question: ${query}` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}`, detail } },
    ],
  });
}

export async function readTextInImage(base64Jpeg: string, languageName: string): Promise<string> {
  return chatCompletion({
    model: 'gpt-4o-mini',
    maxTokens: 700,
    temperature: 0,
    timeoutMs: 40000,
    system:
      'You read printed text aloud for a blind or low-vision person. Read the text in the photo in natural reading order. ' +
      'For signs, labels, and menus, read the most important text first. Skip decorative or repeated text. ' +
      'If there is no readable text, briefly describe what the camera sees instead. ' +
      `Write the result in ${languageName}; translate the text if it is in another language.`,
    user: [
      { type: 'text', text: 'Read this aloud.' },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}`, detail: 'high' } },
    ],
  });
}

export async function catchUpSummary(lines: string[], languageName: string, keywords: string[]): Promise<string> {
  const names = keywords.length ? keywords.join(', ') : 'the user';
  return chatCompletion({
    model: 'gpt-5.6-luna',
    maxTokens: 350,
    temperature: 0.2,
    timeoutMs: 20000,
    system:
      'You help a Deaf or hard of hearing person catch up on a conversation from its live captions. ' +
      'Write at most 3 short bullet points starting with "- " covering what was said. ' +
      `Then, if anyone asked a question of or mentioned ${names}, add a line starting with "For you:" saying what. ` +
      'Captions can contain recognition errors; do not invent details. ' +
      `Reply only in ${languageName}.`,
    user: lines.join('\n'),
  });
}

export async function translateCaption(text: string, targetLanguage: string): Promise<string> {
  return chatCompletion({
    model: 'gpt-5.6-luna',
    maxTokens: 300,
    temperature: 0,
    timeoutMs: 15000,
    system: `Translate the user's text into ${targetLanguage}. Output only the translation, nothing else.`,
    user: text,
  });
}
