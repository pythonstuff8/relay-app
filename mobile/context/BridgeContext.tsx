import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Pairing } from '../utils/pairing';
import { readJson, removeKey, StorageKeys, writeJson } from '../utils/storage';
import { useLanguage } from './LanguageContext';

// One connection to the Relay desktop app, shared by every screen.
// Protocol (v1): desktop sends WELCOME, ALERT, CAPTION, AUDIO_ACK, AUDIO_REJECTED, PONG;
// the phone sends PING, SET_LANGUAGE, AUDIO_START, AUDIO_STOP and binary PCM16 frames.

export type BridgeStatus = 'unpaired' | 'connecting' | 'connected' | 'disconnected';

export type BridgeAlert = { id: number; message: string; severity: 'high' | 'normal'; at: number };
export type BridgeCaption = { id: number; text: string; speaker: number | null; at: number; original?: string };
export type BridgeMessage = { type: string; [key: string]: unknown };

type BridgeContextType = {
  status: BridgeStatus;
  pairing: Pairing | null;
  desktopName: string | null;
  error: string | null;
  alerts: BridgeAlert[];
  captions: BridgeCaption[];
  interimCaption: string;
  pair: (pairing: Pairing) => void;
  forget: () => void;
  reconnect: () => void;
  sendJson: (message: BridgeMessage) => boolean;
  sendBinary: (data: ArrayBuffer) => boolean;
  addListener: (listener: (message: BridgeMessage) => void) => () => void;
  clearCaptions: () => void;
  // Language the computer translates captions into for this phone, or null.
  captionLanguage: string | null;
};

const BridgeContext = createContext<BridgeContextType | null>(null);

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 20000];
const MAX_ALERTS = 30;
const MAX_CAPTIONS = 200;
const DEVICE_NAME = Platform.OS === 'ios' ? 'iPhone' : 'Android phone';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function vibrateForAlert(severity: 'high' | 'normal') {
  if (severity === 'high') {
    for (let i = 0; i < 3; i++) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      await sleep(350);
    }
  } else {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }
}

export function BridgeProvider({ children }: { children: React.ReactNode }) {
  const { prefs, activeLang } = useLanguage();
  const captionLanguage = prefs.mirrorTranslate && activeLang.name !== 'English' ? activeLang.openai : null;
  const captionLanguageRef = useRef(captionLanguage);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [status, setStatus] = useState<BridgeStatus>('unpaired');
  const [desktopName, setDesktopName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<BridgeAlert[]>([]);
  const [captions, setCaptions] = useState<BridgeCaption[]>([]);
  const [interimCaption, setInterimCaption] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const pairingRef = useRef<Pairing | null>(null);
  const listenersRef = useRef(new Set<(message: BridgeMessage) => void>());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const idRef = useRef(0);

  const clearReconnect = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  };

  const closeSocket = () => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try { ws.close(); } catch { /* already closed */ }
    }
  };

  const handleMessage = useCallback((message: BridgeMessage) => {
    switch (message.type) {
      case 'WELCOME':
        setDesktopName(String(message.name || 'Computer'));
        break;
      case 'ALERT': {
        const severity = message.severity === 'high' ? 'high' : 'normal';
        const alert: BridgeAlert = {
          id: ++idRef.current,
          message: String(message.message || 'Sound detected'),
          severity,
          at: Date.now(),
        };
        setAlerts((current) => [alert, ...current].slice(0, MAX_ALERTS));
        vibrateForAlert(severity);
        break;
      }
      case 'CAPTION': {
        const text = String(message.text || '');
        if (message.isFinal) {
          const speaker = typeof message.speaker === 'number' ? message.speaker : null;
          const original = typeof message.original === 'string' && message.original !== text ? message.original : undefined;
          setCaptions((current) => [...current, { id: ++idRef.current, text, speaker, at: Date.now(), original }].slice(-MAX_CAPTIONS));
          setInterimCaption('');
        } else {
          setInterimCaption(text);
        }
        break;
      }
      default:
        break;
    }
    listenersRef.current.forEach((listener) => listener(message));
  }, []);

  const connect = useCallback(() => {
    const target = pairingRef.current;
    clearReconnect();
    closeSocket();
    if (!target) {
      setStatus('unpaired');
      return;
    }

    setStatus('connecting');
    const url = `ws://${target.host}:${target.port}/?token=${encodeURIComponent(target.token)}&name=${encodeURIComponent(DEVICE_NAME)}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;
    let opened = false;

    ws.onopen = () => {
      opened = true;
      attemptRef.current = 0;
      setError(null);
      setStatus('connected');
      ws.send(JSON.stringify({ type: 'SET_LANGUAGE', language: captionLanguageRef.current }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        handleMessage(JSON.parse(event.data));
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      if (!opened) {
        setError(`Could not reach ${target.name}. Make sure Relay is open on the computer and both devices are on the same Wi-Fi.`);
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setInterimCaption('');
      if (event.code === 4401) {
        setStatus('disconnected');
        setError('The pairing code on your computer changed. Scan the new code to reconnect.');
        return;
      }
      setStatus('disconnected');
      const delay = RECONNECT_DELAYS_MS[Math.min(attemptRef.current, RECONNECT_DELAYS_MS.length - 1)];
      attemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [handleMessage]);

  // Tell the computer when the requested caption language changes.
  useEffect(() => {
    captionLanguageRef.current = captionLanguage;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'SET_LANGUAGE', language: captionLanguage }));
  }, [captionLanguage]);

  // Restore the saved pairing on launch.
  useEffect(() => {
    readJson<Pairing | Record<string, never>>(StorageKeys.pairing, {}).then((stored) => {
      if (stored && 'host' in stored && stored.host) {
        pairingRef.current = stored as Pairing;
        setPairing(stored as Pairing);
        connect();
      }
    });
    return () => {
      clearReconnect();
      closeSocket();
    };
  }, [connect]);

  // iOS suspends sockets in the background; reconnect when the app returns.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pairingRef.current && !wsRef.current) {
        attemptRef.current = 0;
        connect();
      }
    });
    return () => subscription.remove();
  }, [connect]);

  const pair = useCallback((next: Pairing) => {
    pairingRef.current = next;
    setPairing(next);
    setDesktopName(next.name);
    setError(null);
    attemptRef.current = 0;
    writeJson(StorageKeys.pairing, next);
    connect();
  }, [connect]);

  const forget = useCallback(() => {
    pairingRef.current = null;
    clearReconnect();
    closeSocket();
    setPairing(null);
    setDesktopName(null);
    setError(null);
    setStatus('unpaired');
    setCaptions([]);
    setInterimCaption('');
    removeKey(StorageKeys.pairing);
  }, []);

  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    setError(null);
    connect();
  }, [connect]);

  const sendJson = useCallback((message: BridgeMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(data);
    return true;
  }, []);

  const addListener = useCallback((listener: (message: BridgeMessage) => void) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  const clearCaptions = useCallback(() => {
    setCaptions([]);
    setInterimCaption('');
  }, []);

  const value = useMemo<BridgeContextType>(() => ({
    status,
    pairing,
    desktopName,
    error,
    alerts,
    captions,
    interimCaption,
    pair,
    forget,
    reconnect,
    sendJson,
    sendBinary,
    addListener,
    clearCaptions,
    captionLanguage,
  }), [status, pairing, desktopName, error, alerts, captions, interimCaption, pair, forget, reconnect, sendJson, sendBinary, addListener, clearCaptions, captionLanguage]);

  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

export function useBridge() {
  const context = useContext(BridgeContext);
  if (!context) throw new Error('useBridge must be used inside BridgeProvider');
  return context;
}
