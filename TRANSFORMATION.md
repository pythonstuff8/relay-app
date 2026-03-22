# Relay - Award-Winning Accessibility Transformation

## Overview

Relay has been transformed into a premium, Apple-inspired accessibility application with three distinct modes: **Deaf Mode**, **Blind Mode**, and **Combined Mode**. This transformation includes a complete UI redesign, enhanced ML-based sound detection, and innovative multi-sensory accessibility features.

## Key Features

### 1. Three Accessibility Modes

#### Deaf Mode (Default)
- **Visual-first design** with premium glassmorphism UI
- **Real-time captions** with speaker identification and word-level confidence
- **Sound alerts** with directional indicators (left/center/right)
- **Visual notifications** for environmental sounds
- **Meeting mode** with auto-detection and summaries

#### Blind Mode
- **Voice navigation** with natural language commands
- **Screen reader** integration with GPT-4o Vision
- **Spatial audio** cues for sound direction
- **Earcons** (audio icons) for different events
- **Keyboard shortcuts** for spatial navigation (Alt + Arrow keys)

#### Combined Mode
- **Multi-sensory feedback** for deaf-blind users
- **Haptic patterns** for different alert types
- **Screen flash notifications** with color coding
- **Vibration + Visual + Audio** simultaneous output
- **Braille display** support (prepared for future integration)

### 2. Premium Apple-Inspired Design

#### Glassmorphism UI
- Backdrop blur effects with 40px+ blur radius
- Dynamic glass panels with gradient overlays
- Subtle borders and shadows for depth
- Smooth spring physics animations

#### Design System
- **CSS Custom Properties** for theming
- **Dark mode** support with automatic detection
- **High contrast** mode for accessibility
- **Reduced motion** support for vestibular disorders

#### Animations
- Spring physics-based transitions
- Staggered entrance animations
- Smooth micro-interactions
- Performance-optimized with `will-change`

### 3. Enhanced ML Sound Detection

#### Multi-Model Ensemble
- **YAMNet** (60% weight) for mobile-optimized detection
- **AST** (40% weight) for high-accuracy classification
- **Temporal smoothing** to reduce false positives
- **Confidence thresholding** with per-category tuning

#### Directional Audio Analysis
- **Stereo phase analysis** for sound direction
- **Left/Center/Right** indicators in alerts
- **Spatial audio** playback for blind mode
- **Real-time processing** with WebGL acceleration

#### Sound Categories
1. **Emergency** (Priority 100): Fire alarms, sirens, smoke detectors
2. **Attention** (Priority 80): Doorbells, knocking, phone ringing
3. **Communication** (Priority 60): Baby crying, screaming, laughter
4. **Appliance** (Priority 40): Microwaves, washing machines
5. **Environmental** (Priority 30): Dog barking, thunder, car horns
6. **Media** (Priority 10): Music, instruments, applause

### 4. Mode Switcher

#### Elegant Mode Selection
- **Modal overlay** with glassmorphism design
- **Three mode cards** with feature tags
- **Keyboard shortcuts**: Cmd+Shift+D/B/C for direct switching
- **Hotkey hint**: Cmd+Shift+M to toggle overlay
- **Smooth animations** with spring physics

#### Floating Mode Indicator
- **Always-visible** mode badge
- **Color-coded** by mode (Blue/Purple/Pink)
- **Click to switch** modes instantly
- **Pulse animation** on mode change

### 5. New File Structure

```
renderer/
├── styles/
│   ├── design-system.css      # Core design tokens
│   ├── apple-components.css   # UI components
│   └── animations.css         # Motion system
├── mode-switcher.js           # Mode selection UI
├── blind-mode.js              # Blind mode features
├── combined-mode.js           # Combined mode features
└── overlay.html               # Updated with new styles
```

## Technical Improvements

### Performance
- **Lazy loading** of mode-specific features
- **WebGL acceleration** for audio processing
- **Debounced** sound detection (4-second cooldown)
- **Optimized** animations with `transform` and `opacity`

### Accessibility
- **ARIA labels** throughout
- **Keyboard navigation** support
- **Screen reader** compatibility
- **Focus management** with visible indicators
- **Reduced motion** media query support

### Code Quality
- **ES6 modules** for all components
- **Event-driven** architecture
- **Separation of concerns** between modes
- **Comprehensive** JSDoc comments

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+Shift+C | Toggle captions |
| Cmd+Shift+E | Explain screen |
| Cmd+Shift+Space | Open command bar |
| Cmd+Shift+H | AI Guide |
| Cmd+Shift+D | Switch to Deaf Mode |
| Cmd+Shift+B | Switch to Blind Mode |
| Cmd+Shift+M | Toggle mode switcher |
| Cmd+Shift+= | Increase caption size |
| Cmd+Shift+- | Decrease caption size |
| Alt+Arrow Keys | Spatial navigation (Blind Mode) |
| Ctrl+Space | Toggle voice commands (Blind Mode) |

## Usage

### Switching Modes
1. Press **Cmd+Shift+M** to open mode switcher
2. Click desired mode card
3. Or use direct shortcuts: Cmd+Shift+D/B/C

### Blind Mode Commands
Say any of these commands when voice commands are active:
- "explain screen" - Describe current screen
- "read captions" - Read current captions aloud
- "stop reading" - Stop speech synthesis
- "help" - List available commands
- "switch mode" - Open mode switcher
- "increase speech speed" - Speed up TTS
- "decrease speech speed" - Slow down TTS

### Combined Mode Feedback
- **Emergency**: Strong vibration + Red flash + High-pitch tone
- **Attention**: Medium vibration + Orange flash + Medium tone
- **Communication**: Gentle vibration + Blue flash + Low tone

## Future Enhancements

### Planned Features
1. **Braille display** hardware integration
2. **Custom sound training** UI for personal sounds
3. **AI-powered** sound prediction
4. **Multi-language** support for all modes
5. **Cloud sync** for settings and custom sounds

### Hardware Support
- **Haptic vests** for immersive feedback
- **Braille displays** for text output
- **Head tracking** for spatial audio
- **Eye tracking** for gaze-based controls

## Credits

Relay was transformed with a focus on:
- **Apple Design Principles** - Clean, intuitive, accessible
- **Inclusive Design** - Supporting deaf, blind, and deaf-blind users
- **Machine Learning** - State-of-the-art sound detection
- **Performance** - Smooth 60fps animations

## License

ISC License - See package.json for details.
