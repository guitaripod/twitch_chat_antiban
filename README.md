# Twitch Anti-Ban (stealth fork)

Stealth fork of [tmarenko/twitch_chat_antiban](https://github.com/tmarenko/twitch_chat_antiban) (Apache-2.0). Same core behavior — automatically opens a proxy stream & chat to channels where you are banned — with the UX reworked so the page shows no sign that you are banned or that an extension is active.

**Download:** [Release 1.0.0](https://github.com/guitaripod/twitch_chat_antiban/releases/tag/1.0.0) (loadable zip) or clone the repo.

## What the stealth fork changes

**Invisible takeover**
- All ban indicators are suppressed before they can render: the ban overlay, the stream gate, and the ban text Twitch now puts in the input's placeholder. Injected at `document_start`, so nothing ever flashes.
- Chat takeover triggers on the first ban detection (250 ms polling). The stream proxy still requires 3 consistent detections to avoid hijacking the player on ad placeholders.

**Chat that looks alive**
- Chat history is backfilled (last 50 messages) from the public recent-messages service when the proxy engages, so the room is never empty at takeover.
- Live messages stream in from Twitch IRC with badges and BTTV / 7TV emotes.
- Ban detection recognizes Twitch's current banned-state UI (disabled editor + placeholder text), not just the legacy overlays.

**A working input box**
- The real input is hooked when it is editable. When Twitch disables it (banned), it is replaced in place with an identical, fully working box — the avatar slot, gift button, and the purple **Chat** send button stay where they belong, and the Chat button is re-enabled and hooked (click sends locally, same as Enter).
- The replacement survives Twitch re-renders: focus, typed text, and the "Send a message" placeholder behave through incoming messages and channel switches.
- `/me` renders as an action; other slash commands are swallowed silently; ArrowUp recalls your last message.

**Your identity, locally**
- Sent messages render with your real display name, chat color, and earned badges, fetched from Twitch GQL authenticated with your session token (read from the page via an injected bridge; content scripts can't reach the page's localStorage directly).
- Messages are local-only by design: nobody else sees them, and they don't survive a reload — like real chat.

**Self-contained**
- All Twitch lookups (channel IDs, badges, stream playlists, identity) go directly to Twitch's public endpoints — the upstream private API (`%APIURL%`) is gone, so raw source installs work out of the box.
- Status messages ("Connecting to chat server…", etc.) go to the browser console only, never into the visible chat.

**Caveat:** the third-party recent-messages service is used for history backfill. If it's down, takeover still works but the room starts empty.

## Install

No build step.

1. Download the zip from the [release](https://github.com/guitaripod/twitch_chat_antiban/releases/tag/1.0.0) and unzip, or clone this repo.
2. Chrome / Edge / Vivaldi: `chrome://extensions` → enable Developer mode → **Load unpacked** → select the `src/` folder.
3. Open any Twitch channel — the extension activates only where you are banned. Changes to `src/` require reloading the extension card and refreshing the Twitch tab.

Firefox users need the upstream packaging script (`prepare.js`) to merge `manifest.firefox.json`; simplest path is Chrome-family browsers.

## Differences from upstream

- `run_at: document_start` + suppression CSS and a ban-text MutationObserver in `src/scripts/content.js`
- Input supervisor: hooks the real editor when editable, replaces it in place when banned, re-enables the Chat send button (`src/scripts/proxy-chat.js`)
- Local message rendering with GQL identity (`currentUser` via OAuth token from the page's `localStorage`) and own-badge rendering (`displayBadges`)
- Direct Twitch endpoints replace the upstream private API: GQL for channel IDs and badges, GQL playback token + `usher.ttvnw.net` for stream playlists (`src/scripts/utils.js`)
- Credentials are sent only to `twitch.tv` hosts; third-party APIs (BTTV, 7TV, recent-messages) are fetched without credentials (their CORS setup forbids credentialed requests)
- Chat history backfill via `src/scripts/background.js` fetch proxy
- Input-box and scrollbar styling in `src/css/chat.css`

## License

Apache-2.0, inherited from upstream; see [LICENSE](LICENSE).