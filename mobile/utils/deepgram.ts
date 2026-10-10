import { getDeepgramToken } from './relayApi';
import { MIC_SAMPLE_RATE, startMicStream, stopMicStream } from './audio';

export type LiveCaptionHandlers = {
  onOpen?: () => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onClose?: () => void;
  onError?: (message: string) => void;
};

export type LiveCaptionSession = {
  stop: () => Promise<void>;
};

// Streams the microphone to Deepgram using a short-lived token from the Relay API.
export async function startLiveCaptions(
  language: string,
  handlers: LiveCaptionHandlers,
  keyterms: string[] = []
): Promise<LiveCaptionSession> {
  const token = await getDeepgramToken();
  // Keyterm prompting (nova-3, English) helps names like "Maya" get recognized.
  const boost = language.startsWith('en') ? keyterms.slice(0, 10).map((term) => `keyterm=${encodeURIComponent(term)}`) : [];
  const params = [
    ...boost,
    'model=nova-3',
    'smart_format=true',
    'interim_results=true',
    'encoding=linear16',
    `sample_rate=${MIC_SAMPLE_RATE}`,
    'channels=1',
    'mip_opt_out=true',
    `language=${encodeURIComponent(language)}`,
  ].join('&');
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ['bearer', token]);
  let stopped = false;

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await stopMicStream();
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }));
      ws.close();
    } catch {
      // socket already closed
    }
  };

  ws.onopen = async () => {
    try {
      await startMicStream((bytes) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(bytes.buffer as ArrayBuffer);
      });
      handlers.onOpen?.();
    } catch {
      handlers.onError?.('Could not start the microphone.');
      await stop();
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(String(event.data));
      const text = data?.channel?.alternatives?.[0]?.transcript;
      if (data?.type === 'Results' && text) handlers.onTranscript(text, Boolean(data.is_final));
    } catch {
      // ignore non-JSON frames
    }
  };

  ws.onerror = () => {
    if (!stopped) handlers.onError?.('Captions connection failed.');
  };

  ws.onclose = () => {
    const wasStopped = stopped;
    stop().finally(() => {
      if (!wasStopped) handlers.onClose?.();
    });
  };

  return { stop };
}
