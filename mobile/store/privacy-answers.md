# Privacy questionnaire answers

These match the in-app consent screen, `app.json` privacy manifest, and https://relay.suhaanthayyil.com/privacy.

## Data flows (source of truth)

| Data | When | Sent to | Stored by Relay? |
|---|---|---|---|
| Microphone audio | Live Captions on, or Blind Mode talk button held | Deepgram (speech to text), via short-lived token from the Relay API | No |
| Camera photo + question text | Blind Mode release, Read Aloud tap | OpenAI via the Relay API proxy | No |
| Caption text | Live Captions translation turned on | OpenAI via the Relay API proxy | No |
| Remote Mic audio | Remote Mic on | User's own computer on the local network | No |
| Preferences, phrases, pairing code | Always | Stays on device (AsyncStorage) | On device only |
| Loud Sound Alert audio | Listening | Never leaves the device | No |

No accounts, analytics, advertising, crash reporting SDKs, or tracking. The Relay API host (Vercel) keeps standard short-lived request logs (IP address) for security and rate limiting.

## Apple App Privacy ("nutrition label")

Do you or your third-party partners collect data from this app? **Yes**

| Data type | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| Audio Data | Yes | No | No | App Functionality |
| Photos or Videos | Yes | No | No | App Functionality |
| Other User Content (questions, caption text for translation) | Yes | No | No | App Functionality |

Everything else (contact info, location, identifiers, usage data, diagnostics, purchases, health, etc.): **Not collected**.

Notes for the questionnaire: data is processed only to provide the feature and is not retained by Relay. Apple counts sending data off-device to a third-party processor as "collected", which is why these three are listed.

Tracking: **No**.

## Google Play Data safety

- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS/WSS to the Relay API, OpenAI, and Deepgram. The phone-to-computer link is local-network only.)
- Do you provide a way for users to request that their data is deleted? **Yes**: nothing is retained server side, and uninstalling or Settings > Forget this computer removes local data. Explain this in the form.

| Category | Data type | Collected | Shared | Ephemeral processing | Required/optional | Purpose |
|---|---|---|---|---|---|---|
| Audio | Voice or sound recordings | Yes | Yes (Deepgram, service provider) | Yes | Optional (user turns features on) | App functionality |
| Photos and videos | Photos | Yes | Yes (OpenAI, service provider) | Yes | Optional | App functionality |
| App activity | Other user-generated content | Yes | Yes (OpenAI, service provider) | Yes | Optional | App functionality |

Google treats transfers to a service provider that processes data on your behalf as not "sharing"; if the form offers that exemption, mark these as collected but not shared.

## Content rating (IARC / Apple)

- Violence, sexual content, profanity, drugs, gambling: None
- User-generated content shared with other users: No
- Unrestricted web access: No
- Location sharing: No
- AI-generated content: Yes (descriptions and translations). In-app reporting: Settings > Report an AI response.
- Result: Everyone / 4+

## Permissions justification (Google Play)

- `CAMERA`: Blind Mode scene descriptions, Read Aloud, scanning the desktop pairing QR code.
- `RECORD_AUDIO`: Live Captions, Blind Mode voice questions, Remote Mic, Loud Sound Alert.
- No background location, no foreground service, no storage access.
