# Siri Shortcut Voice Control

FamilyTV exposes one voice-friendly endpoint:

```http
POST /command
content-type: application/json

{ "text": "open YouTube TV" }
```

Use it from iOS Shortcuts so you can say a command from your phone while the
FamilyTV server controls the TV over Tailscale.

## Prerequisites

- FamilyTV is running and reachable from your phone over Tailscale HTTPS.
- The PWA install path is already set up:

```bash
cd google
scripts/start-familytv.sh --serve
tailscale serve status
```

Use the FamilyTV host HTTPS URL from `tailscale serve status`, for example:

```text
https://<familytv-host>.<tailnet>.ts.net:8443
```

Do not use the TV's Tailscale URL as the shortcut URL. That is the ADB target;
the shortcut calls the FamilyTV server's `/command` endpoint.

## Build the shortcut

In the Shortcuts app on iPhone:

1. Create a new shortcut named `Family TV`.
2. Add action: **Dictate Text**.
   - Language: English
   - Stop Listening: After Pause
3. Add action: **Get Contents of URL**.
   - URL: `https://<familytv-host>.<tailnet>.ts.net:8443/command`
   - Method: `POST`
   - Headers:
     - `Content-Type`: `application/json`
   - Request Body: JSON
     - `text`: `Dictated Text`
4. Add action: **Get Dictionary Value**.
   - Get `message` from the result of `Get Contents of URL`.
5. Add action: **Speak Text**.
   - Speak the `message` value.

Now say:

```text
Hey Siri, Family TV
```

When Siri starts listening, say the TV command.

## Supported phrases

Apps:

```text
open Netflix
open YouTube
open YouTube TV
open Hulu
open Disney Plus
open Prime Video
open Tubi
open Peacock
```

Remote keys:

```text
go home
go back
press up
press down
press left
press right
ok
pause
mute
volume up
volume down
```

Text:

```text
type Dr Phil
search for weather
enter football
```

Gemini search:

```text
open Gemini
ask Gemini what's the weather
ask Gemini for Shrek
ask Gemini to find Columbo
ask Google TV to find Columbo
search the TV for Jeopardy
find the movie Shrek
```

This uses the Google TV search/Gemini surface with dictated text from your
iPhone. It does not stream the iPhone microphone into the TV's physical mic
button path.

Diagnostics:

```text
status
what app is on
take screenshot
what's on screen
```

Recovery:

```text
wake up the TV
turn it on
power on the streamer
reset
reset home
start over
```

`wake up the TV` sends Android's wake-only key. It is intentionally not a
power toggle, so it should not turn the TV off if it is already awake.

## Notes

- The shortcut does not need the PWA open.
- The iPhone only needs network access to the FamilyTV HTTPS URL.
- Keep this on Tailscale HTTPS; do not expose FamilyTV publicly.
- The command parser cleans common dictation filler such as `for Shrek`,
  `for for Shrek`, and `to find the movie Shrek` before sending the query.
- The command parser is deterministic and only maps to safe FamilyTV actions.
