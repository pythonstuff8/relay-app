# Relay

Relay is a desktop accessibility app.

It gives live captions, sound alerts, voice commands, and optional sign-language camera input.

## For Judges

Use the **Releases** page for the fastest demo setup:

- macOS Apple Silicon: `Relay-mac-arm64.dmg`
- macOS Intel: `Relay-mac-x64.dmg`
- Windows x64: `Relay-windows-x64-setup.exe`
- Linux x64 AppImage: `Relay-linux-x64.AppImage`
- Linux x64 deb: `Relay-linux-x64.deb`

Direct links always point to the newest release:

- `https://github.com/pythonstuff8/relay-app/releases/latest/download/Relay-mac-arm64.dmg`
- `https://github.com/pythonstuff8/relay-app/releases/latest/download/Relay-mac-x64.dmg`
- `https://github.com/pythonstuff8/relay-app/releases/latest/download/Relay-windows-x64-setup.exe`
- `https://github.com/pythonstuff8/relay-app/releases/latest/download/Relay-linux-x64.AppImage`
- `https://github.com/pythonstuff8/relay-app/releases/latest/download/Relay-linux-x64.deb`

## Unsigned Build Note

macOS signing is planned for a later release.

Right now, macOS builds are unsigned. You may need to open the app from **Privacy & Security** and click **Open Anyway**.

Windows may show SmartScreen. Click **More info** then **Run anyway**.

## What Relay Does

- Live speech captions with speaker labels
- Deaf mode with gesture camera panel
- Blind mode with voice-first controls
- Sound event alerts (alarm, knock, dog bark, and more)
- AI Guide with step-by-step help
- Meeting transcripts and summaries
- Text to speech output

## Build From Source

### Requirements

- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/pythonstuff8/relay-app.git
cd relay-app
npm install
cp .env.example .env
```

Edit `.env` and add your keys:

```env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

### Run

```bash
npm start
```

### Build Installers

```bash
npm run build
```

## API Keys and Features

If keys are missing, Relay still starts.

Cloud features will be limited until keys are added.

- Missing `DEEPGRAM_API_KEY`: no Deepgram live transcription
- Missing `OPENAI_API_KEY`: AI Guide, TTS AI voice, and some AI features are unavailable

## Project Layout

- `electron/` main process and IPC
- `renderer/` overlay UI and feature modules
- `assets/` icons, sounds, models
- `website/` public download site
- `scripts/` verification scripts

## Verify

```bash
npm run verify:strict
```

## License

ISC
