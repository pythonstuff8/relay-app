# Congressional App Challenge playbook

**Deadline:** Mon Oct 26, 2026, 12:00 PM. Check your district page, since some list Oct 30.
- The video must be 3 minutes or less.
- Disclose all AI help, and be ready to explain every module.

## What judges score

There is no single national rubric; each House office uses its own. Common criteria:
- the problem is real, and the app has impact;
- the app works and the demo shows it;
- the code and structure are explained, with the GitHub link;
- the UI.

Accessibility apps win often, for example NOVA (KS-03, 2024), SafeStride (MD-08, 2025), Accessify (MN-06, 2023) and ASLify (AL-05, 2022). So stand out on what others lack:
- phone and desktop working together;
- one app for Deaf, blind *and* DeafBlind users;
- six languages;
- privacy-first design: on-device sound detection, and no keys in the apps.

## Features in this build
- **Name Alert:** when your name or a keyword is said, the phone vibrates and highlights the sentence (Live Captions and Caption Mirror).
- **Catch me up:** one tap summarizes the last few minutes of captions.
- **Quick Ask in Blind Mode:** one-tap presets for money, colors, expiry dates and signs.
- **Conversation mode:** the phone lies flat between two people. The top half is flipped for the hearing person, there's live translation, and typed replies are spoken aloud.

## Next ideas (ranked by impact × effort)
1. **Classroom Broadcast:** the desktop translates captions once per language and sends each phone its language. Translate on the desktop to stay under the proxy's 60 requests per minute per IP.
2. **Find My Object:** a hot/cold haptic search loop using gpt-4o-mini vision with low detail, about every 1.5 s.
3. **Feel the Conversation (DeafBlind):** compress each caption to about 5 words and play it as haptic Braille.
4. **Night Guard:** a desktop smoke-alarm detection strobes the phone's flashlight. Keep the strobe at 2 Hz or slower (WCAG 2.3.1).

## Video beats (2:55)

| Time | Content |
|---|---|
| 0:00–0:12 | Cold open: Name Alert, or a phone buzzing when a smoke alarm sounds. |
| 0:12–0:30 | The problem, with statistics (below), and why you built it. |
| 0:30–1:10 | Deaf student: captions, Name Alert, Catch me up, translation. |
| 1:10–1:45 | Blind user: Blind Mode Quick Ask (a $5 bill), Read Aloud. |
| 1:45–2:05 | Conversation mode across two languages; Braille. |
| 2:05–2:35 | Architecture: Electron + Expo, the LAN bridge, on-device YAMNet, the Vercel proxy with short-lived tokens. Name one hard problem you solved. |
| 2:35–2:55 | Tester quotes, metrics, links. |

- Burn captions into the video itself.
- Film each feature in one take with a visible timer.

## Statistics (cite them)
- 15% of US adults (37.5M) report trouble hearing: https://www.nidcd.nih.gov/health/statistics/quick-statistics-hearing
- About 8.18M Americans reported a vision disability (Census ACS 2022): https://usafacts.org/articles/what-is-the-state-of-american-eyesight
- US visual impairment is expected to double by 2050: https://www.nei.nih.gov/about/news-and-events/news/visual-impairment-blindness-cases-us-expected-double-2050
- Worldwide, 430M people have disabling hearing loss: https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss
- Worldwide, 2.2B people have a vision impairment: https://www.who.int/news-room/fact-sheets/detail/blindness-and-visual-impairment

## User testing (about 10 days)
- Recruit 3 to 5 testers through district Deaf/HoH and Teacher of the Visually Impaired staff, the state commission, or NFB/ACB chapters.
- Get signed consent (parent consent for minors).
- Time a task before and after, and run a System Usability Scale survey.
- Show one or two quotes, and say what you changed because of them.

## Don't
- Call the gestures "ASL translation". They are about 7 fixed gestures, so call them gesture shortcuts.
- Make medical or safety guarantees ("safe to cross", "replaces your smoke alarm").
- Ship dead buttons or "coming soon" tiles. App Store rule 2.1 rejects them, and judges notice.
- Fake or speed up demo footage. Judges can check the repo.
- Rely on school Wi-Fi for live pairing; it often isolates devices. Bring a hotspot and have a recorded backup.
