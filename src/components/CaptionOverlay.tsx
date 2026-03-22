/**
 * Relay - Caption Overlay Component
 *
 * Displays real-time captions with speaker identification,
 * emotion indicators, and customizable styling.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TranscriptResult, TranscriptWord } from "../services/deepgram-service";

// Speaker color palette (Apple-style)
const SPEAKER_COLORS = [
  { bg: "rgba(74, 144, 217, 0.15)", text: "#4A90D9", name: "Blue" },
  { bg: "rgba(80, 200, 120, 0.15)", text: "#50C878", name: "Green" },
  { bg: "rgba(255, 179, 71, 0.15)", text: "#E8A850", name: "Orange" },
  { bg: "rgba(221, 160, 221, 0.15)", text: "#DDA0DD", name: "Plum" },
  { bg: "rgba(135, 206, 235, 0.15)", text: "#5BA3C7", name: "Sky" },
  { bg: "rgba(240, 230, 140, 0.15)", text: "#C4B454", name: "Khaki" },
  { bg: "rgba(224, 176, 255, 0.15)", text: "#B88FD9", name: "Mauve" },
  { bg: "rgba(152, 216, 200, 0.15)", text: "#6BAF9E", name: "Seafoam" },
];

// Types
export interface CaptionSettings {
  fontSize: number;
  fontFamily: string;
  maxLines: number;
  showSpeakerNames: boolean;
  showEmotions: boolean;
  showTimestamps: boolean;
  backgroundOpacity: number;
  position: "floating" | "top" | "bottom";
  autoHideDelay: number; // seconds, 0 = never
}

export interface CaptionLine {
  id: string;
  speaker: number;
  speakerName?: string;
  text: string;
  words: TranscriptWord[];
  isFinal: boolean;
  timestamp: number;
  emotion?: "neutral" | "happy" | "sad" | "angry" | "fearful" | "surprised";
}

interface CaptionOverlayProps {
  settings?: Partial<CaptionSettings>;
  speakerNames?: Map<number, string>;
  onSpeakerClick?: (speakerId: number) => void;
}

const DEFAULT_SETTINGS: CaptionSettings = {
  fontSize: 18,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
  maxLines: 3,
  showSpeakerNames: true,
  showEmotions: true,
  showTimestamps: false,
  backgroundOpacity: 0.85,
  position: "bottom",
  autoHideDelay: 5,
};

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({
  settings: userSettings,
  speakerNames = new Map(),
  onSpeakerClick,
}) => {
  const settings = { ...DEFAULT_SETTINGS, ...userSettings };

  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get speaker color
  const getSpeakerColor = useCallback((speakerId: number) => {
    return SPEAKER_COLORS[speakerId % SPEAKER_COLORS.length];
  }, []);

  // Get speaker display name
  const getSpeakerName = useCallback(
    (speakerId: number) => {
      return speakerNames.get(speakerId) || `Speaker ${speakerId + 1}`;
    },
    [speakerNames]
  );

  // Add or update caption
  const handleTranscript = useCallback(
    (result: TranscriptResult) => {
      setCaptions((prev) => {
        const speakerId = result.speaker ?? 0;

        if (result.isFinal) {
          // Add as new final caption
          const newCaption: CaptionLine = {
            id: `${Date.now()}-${Math.random()}`,
            speaker: speakerId,
            speakerName: getSpeakerName(speakerId),
            text: result.transcript,
            words: result.words,
            isFinal: true,
            timestamp: Date.now(),
          };

          // Remove any interim captions and add the final one
          const filtered = prev.filter((c) => c.isFinal);
          const updated = [...filtered, newCaption];

          // Keep only the last N lines
          return updated.slice(-settings.maxLines);
        } else {
          // Update interim caption (always the last one if not final)
          const interimCaption: CaptionLine = {
            id: "interim",
            speaker: speakerId,
            speakerName: getSpeakerName(speakerId),
            text: result.transcript,
            words: result.words,
            isFinal: false,
            timestamp: Date.now(),
          };

          // Replace interim or add it
          const finalCaptions = prev.filter((c) => c.isFinal);
          return [...finalCaptions.slice(-(settings.maxLines - 1)), interimCaption];
        }
      });

      // Reset auto-hide timer
      if (settings.autoHideDelay > 0) {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
        }
        setIsVisible(true);
        hideTimeoutRef.current = setTimeout(() => {
          setIsVisible(false);
        }, settings.autoHideDelay * 1000);
      }
    },
    [settings.maxLines, settings.autoHideDelay, getSpeakerName]
  );

  // Expose handleTranscript via ref or context for parent components
  useEffect(() => {
    // This would be connected to the Deepgram service
    // For now, expose it globally for testing
    (window as any).relayCaptionHandler = handleTranscript;
    return () => {
      delete (window as any).relayCaptionHandler;
    };
  }, [handleTranscript]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Position styles
  const getPositionStyles = (): React.CSSProperties => {
    if (settings.position === "floating") {
      return {
        position: "fixed",
        left: position.x || "50%",
        top: position.y || "auto",
        bottom: position.y ? "auto" : "100px",
        transform: position.x ? "none" : "translateX(-50%)",
        cursor: isDragging ? "grabbing" : "grab",
      };
    }
    if (settings.position === "top") {
      return {
        position: "fixed",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
      };
    }
    return {
      position: "fixed",
      bottom: "60px",
      left: "50%",
      transform: "translateX(-50%)",
    };
  };

  return (
    <AnimatePresence>
      {isVisible && captions.length > 0 && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          style={{
            ...getPositionStyles(),
            zIndex: 999999,
            maxWidth: "80vw",
            minWidth: "400px",
          }}
          drag={settings.position === "floating"}
          dragMomentum={false}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={(_, info) => {
            setIsDragging(false);
            setPosition({ x: info.point.x, y: info.point.y });
          }}
        >
          <div
            style={{
              background: `rgba(28, 28, 30, ${settings.backgroundOpacity})`,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderRadius: "16px",
              padding: "16px 20px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            {captions.map((caption, index) => {
              const speakerColor = getSpeakerColor(caption.speaker);

              return (
                <motion.div
                  key={caption.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: caption.isFinal ? 1 : 0.7, y: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    marginBottom: index < captions.length - 1 ? "12px" : 0,
                  }}
                >
                  {/* Speaker name badge */}
                  {settings.showSpeakerNames && (
                    <div
                      onClick={() => onSpeakerClick?.(caption.speaker)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "6px",
                        cursor: onSpeakerClick ? "pointer" : "default",
                      }}
                    >
                      {/* Speaking indicator dot */}
                      <motion.div
                        animate={{
                          scale: caption.isFinal ? 1 : [1, 1.2, 1],
                        }}
                        transition={{
                          repeat: caption.isFinal ? 0 : Infinity,
                          duration: 0.8,
                        }}
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: speakerColor.text,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 500,
                          color: speakerColor.text,
                          fontFamily: settings.fontFamily,
                        }}
                      >
                        {caption.speakerName}
                      </span>
                      {!caption.isFinal && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "rgba(255, 255, 255, 0.5)",
                            fontStyle: "italic",
                          }}
                        >
                          speaking...
                        </span>
                      )}
                    </div>
                  )}

                  {/* Caption text */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: `${settings.fontSize}px`,
                      fontFamily: settings.fontFamily,
                      fontWeight: 400,
                      lineHeight: 1.5,
                      color: caption.isFinal ? "#FFFFFF" : "rgba(255, 255, 255, 0.7)",
                      fontStyle: caption.isFinal ? "normal" : "italic",
                      background: speakerColor.bg,
                      padding: "8px 12px",
                      borderRadius: "12px",
                      borderLeft: `3px solid ${speakerColor.text}`,
                    }}
                  >
                    {caption.text}
                  </p>

                  {/* Timestamp */}
                  {settings.showTimestamps && caption.isFinal && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "rgba(255, 255, 255, 0.4)",
                        marginTop: "4px",
                        display: "block",
                      }}
                    >
                      {new Date(caption.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CaptionOverlay;
