import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';

export const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

let currentOpenAISound: Audio.Sound | null = null;

type MobilityAlertType = 'stop' | 'clear' | 'instruction';

export type MobilitySafetyDecision = {
  speech: string;
  alert: MobilityAlertType;
  isDanger: boolean;
};

export type MobilitySafetyContext = {
  languageName?: string;
  mode?: 'navigate';
};

const MOBILITY_SYSTEM_PROMPT = `
You are an AI safety navigator for a blind or low-vision user.

Input:
- One live camera frame from the phone.

Rules:
1. Prioritize immediate walking-path hazards only.
2. If danger is directly ahead (car, bike, person, curb, pole, barrier, step, wall), return exactly: Stop.
3. If path is clearly safe, return: Clear.
4. If safe but a brief directional cue helps, return one short instruction sentence.
5. No explanations, no filler, no reasoning.
6. Keep response very short and actionable.
`;

function normalizeMobilityDecision(raw: string): MobilitySafetyDecision {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const normalized = cleaned.toLowerCase();

  if (normalized.startsWith('stop')) {
    return { speech: 'Stop.', alert: 'stop', isDanger: true };
  }

  if (normalized.startsWith('clear')) {
    return { speech: 'Clear.', alert: 'clear', isDanger: false };
  }

  if (!cleaned) {
    return { speech: 'Clear.', alert: 'clear', isDanger: false };
  }

  return { speech: cleaned, alert: 'instruction', isDanger: false };
}

export async function analyzeMobilitySafety(
  base64Image: string,
  context: MobilitySafetyContext = {}
): Promise<MobilitySafetyDecision> {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing Expo Public OpenAI API Key.');
  }

  const languageName = context.languageName || 'English';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 48,
      messages: [
        {
          role: 'system',
          content: `${MOBILITY_SYSTEM_PROMPT}\nAlways respond in ${languageName}.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Return only one short spoken output for real-time mobility safety.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: 'low'
              }
            }
          ]
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to analyze mobility safety');
  }

  const rawSpeech = data.choices?.[0]?.message?.content || 'Clear.';
  return normalizeMobilityDecision(rawSpeech);
}

export async function stopOpenAISpeech() {
  if (currentOpenAISound) {
    try {
      await currentOpenAISound.stopAsync();
      await currentOpenAISound.unloadAsync();
    } catch {}
    currentOpenAISound = null;
  }
}

export async function playOpenAITTS(text: string) {
  if (!OPENAI_API_KEY) throw new Error('Missing Expo Public OpenAI API Key.');

  await stopOpenAISpeech();

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: text,
    }),
  });

  if (!response.ok) throw new Error('Failed to fetch TTS');

  const blob = await response.blob();
  const reader = new FileReader();

  await new Promise((resolve, reject) => {
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const uri = FileSystem.cacheDirectory + `tts_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });

        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri });
        currentOpenAISound = sound;
        await sound.playAsync();
        resolve(true);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function transcribeWithOpenAI(uri: string, languageCode: string = 'en'): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('Missing Expo Public OpenAI API Key.');

  const formData = new FormData();
  formData.append('file', {
    uri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);

  formData.append('model', 'gpt-4o-mini-transcribe');
  formData.append('language', languageCode.split('-')[0]);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'OpenAI Fallback failed.');
  return data.text || '';
}

export async function describeImageWithAI(base64Image: string, languageName: string = 'English'): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing Expo Public OpenAI API Key.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an accessibility assistant for a blind person. Describe what is in the image clearly, concisely, and accurately in 1-2 sentences. Focus on the most important objects, people, or obstacles. You MUST reply completely in ${languageName}.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: 'low',
              },
            },
          ],
        },
      ],
      max_tokens: 150,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to analyze image');
  }

  return data.choices?.[0]?.message?.content || 'Could not recognize the scene.';
}

export async function navigateWithAI(base64Image: string, userQuery: string, languageName: string = 'English'): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('Missing Expo Public OpenAI API Key.');

  const query = userQuery?.trim() ? userQuery : 'What is in front of me?';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a real-time navigational assistant for a blind person walking or navigating indoors/outdoors. Analyze the provided image and directly answer their question: "${query}". Provide physical, spatial directions (for example, to your immediate left, 10 o'clock, straight ahead). Keep it extremely concise, safe, and helpful (1-3 short sentences max). Do not mention the image. You MUST reply completely in ${languageName}.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: 'low',
              },
            },
          ],
        },
      ],
      max_tokens: 150,
      temperature: 0.2,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Failed to navigate');

  return data.choices?.[0]?.message?.content || 'Could not provide navigation.';
}
