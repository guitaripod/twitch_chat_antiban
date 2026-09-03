# Twitch Anti-Ban (stealth fork)

Stealth fork of [tmarenko/twitch_chat_antiban](https://github.com/tmarenko/twitch_chat_antiban) (Apache-2.0). Same core behavior — automatically opens a proxy stream & chat to channels where you are banned — with the UX reworked so the page shows no sign that you are banned or that an extension is active.

## What the stealth fork changes

- **No ban flash.** Suppression CSS for the ban overlay and stream gate is injected at `document_start`, so "You are banned" never renders, even briefly.
- **Chat looks normal.** The proxy chat backfills the last 50 messages from recent-messages.robotty.de on takeover, so the room is never empty when it appears.
- **Working-looking input box.** A Twitch-styled input box is added below the proxy chat. Typed messages are appended locally as your own display name and chat color (fetched from Twitch GQL). `/me` renders as an action; other slash commands are swallowed silently. ArrowUp recalls your last message.
- **No extension traces.** Status messages ("Connecting to chat server…", etc.) go to the browser console only, never into the visible chat.
- **Fast takeover.** Chat takeover triggers on the first ban detection (250ms polling). The stream proxy still requires 3 consistent detections to avoid hijacking the player on ad placeholders.
- **Clean channel switches.** Navigating to another channel disconnects the stale socket and resets the proxy room.

Messages you type are local-only: nobody else sees them, and they don't survive a page reload — like real chat.

## Install from source

No build step.

1. Clone or download this repo.
2. Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** → select `src/`.
3. Firefox: load `src/` via `about:debugging` → This Firefox → Load Temporary Add-on (uses `manifest.firefox.json` merge in the upstream packaging script).

## Differences from upstream

- `run_at: document_start` + injected suppression style in `src/scripts/content.js`
- fake input box, local message rendering, GQL identity lookup in `src/scripts/proxy-chat.js`
- chat history backfill via `src/scripts/utils.js` background fetcher
- input-box styles in `src/css/chat.css`

## License

Apache-2.0, inherited from upstream; see [LICENSE](LICENSE).