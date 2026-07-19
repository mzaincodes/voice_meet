# VoiceMeet

Audio-only, peer-to-peer voice rooms for up to five people. Create a room, share
the ID, talk. No accounts, no downloads, and no audio ever passes through a server.

Built with Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui,
Framer Motion, WebRTC and Socket.IO.

---

## Architecture, and the one thing you must know before deploying

**Socket.IO cannot run on Vercel.** Vercel's serverless functions have no
long-lived process to hold a WebSocket open. So VoiceMeet ships as two
deployables:

```
┌──────────────────────────┐        WebSocket        ┌──────────────────────────┐
│  Next.js app  (Vercel)   │ ──────────────────────▶ │  Signaling server        │
│  UI, /api/turn-creds     │   SDP + ICE exchange    │  server/  (Render, Fly…) │
└──────────────────────────┘                         └──────────────────────────┘
             │                                                    
             │  encrypted peer-to-peer audio (SRTP), never via a server
             ▼                                                    
      ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
      │  Browser A  │◀─▶│  Browser B  │◀─▶│  Browser C  │   full mesh, ≤5 peers
      └─────────────┘   └─────────────┘   └─────────────┘
```

The signaling server only brokers the handshake. Once peers connect, audio flows
directly between browsers (or via TURN when a firewall blocks the direct path).

A full mesh is the right topology here precisely *because* the cap is five: each
browser holds at most four connections, which is comfortable for audio. An SFU
would only start paying off past roughly eight participants.

---

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` runs both processes: the Next.js app on
[localhost:3000](http://localhost:3000) and the signaling server on
[localhost:3001](http://localhost:3001).

Open the app in two browser windows to test a real call. Chrome or Edge is
recommended — see the browser support note below.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js **and** the signaling server together |
| `npm run dev:web` | Next.js only |
| `npm run dev:signal` | Signaling server only (watch mode) |
| `npm run build` | Production build of the Next.js app |
| `npm run signal` | Signaling server, production mode |
| `npm run typecheck` | Type-checks the app *and* the server |
| `npm run lint` | ESLint |
| `npm run test:signal` | Signaling end-to-end suite (needs the signal server running) |
| `npm run test:browser` | Two-browser WebRTC call suite (needs both servers running) |

---

## Tests

Two end-to-end suites, both driving the real thing — no mocks.

```bash
npm run dev          # in one terminal
npm run test:signal  # 39 assertions against the live signaling server
npm run test:browser # 43 assertions across two real Chromium instances
```

`test:signal` opens real socket.io connections and covers room creation, join
validation, the 5-person cap, glare-free mesh setup, relay authorization
(including cross-room SDP/ICE injection attempts), host migration, session
reclamation after a dead transport, and the empty-room grace period.

`test:browser` runs Chromium with `--use-fake-device-for-media-stream`, which
produces a genuine audio track, and asserts on `RTCPeerConnection.getStats()`
that RTP packets actually flow in both directions. It also covers the create and
join flows, voice-activity animation, mute (button, propagation, and the `m`
shortcut), audio-settings plumbing, the room-full screen, reconnection after a
real network interruption, and clean teardown on leave.

Run `npm run test:browser` against `npm run build && npm start` to exercise the
production bundle rather than the dev server.

---

## Deployment

### 1. Signaling server (deploy this first)

Any platform that runs a persistent Node process works. A `render.yaml` and a
`Dockerfile.signal` are included.

**Render** — push the repo, then *New → Blueprint*, pick the repo, and set
`CORS_ORIGIN` to your Vercel domain.

**Manually, anywhere:**

```bash
npm ci
CORS_ORIGIN=https://your-app.vercel.app PORT=3001 npm run signal
```

Server env vars:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Listen port |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated origin allowlist |
| `ALLOW_VERCEL_PREVIEWS` | `false` | Also accept `*.vercel.app` preview URLs |

`GET /health` returns room/participant counts for platform health checks.

### 2. Next.js app on Vercel

Import the repo, then set:

```
NEXT_PUBLIC_SOCKET_URL=https://your-signal-server.onrender.com
```

Deploy. That single variable is all the app needs to find the signaling server.

> If you're on Render's free tier, the server sleeps after inactivity and the
> first join of the day will take ~30s to wake it. Any paid tier removes this.

### 3. TURN (optional, but expect ~10–15% of users to need it)

STUN alone connects most home and office networks. Symmetric NAT, strict
corporate firewalls and some mobile carriers need a TURN relay to fall back to.

**Self-hosted coturn** — `deploy/turnserver.conf` is a production-ready config
using time-limited credentials. Install coturn on a VM with a public IP, edit
the realm/cert/secret, then set on Vercel:

```
TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349
TURN_STATIC_AUTH_SECRET=<same secret as turnserver.conf>
```

`/api/turn-credentials` mints an HMAC credential that expires after 12 hours, so
the long-lived secret stays server-side.

**Managed provider** (Metered, Twilio, Cloudflare) — use the static path instead:

```
NEXT_PUBLIC_TURN_URLS=turn:relay.example.com:80
NEXT_PUBLIC_TURN_USERNAME=...
NEXT_PUBLIC_TURN_CREDENTIAL=...
```

Static credentials are visible in the browser bundle. That's inherent to static
TURN auth — prefer the coturn path if that matters to you.

---

## Design

The theme is **"Studio"** — modelled on audio hardware rather than a web
dashboard, which suits a voice-only app and avoids the default light-and-violet
look.

- **Dark-first.** Graphite (`oklch(0.155 0.006 265)`) is the default; light is a
  warm-paper counterpart, not a plain inversion. Only an explicit in-app toggle
  opts out.
- **One accent.** Amber behaves like an indicator lamp: it marks the active
  speaker, primary actions, and focus rings — and nothing else. Green is
  reserved for "live" and connection quality, red for destructive actions.
- **Matte surfaces, no glassmorphism.** `.panel` / `.panel-raised` /
  `.panel-overlay` are opaque fills with a hairline seam and a faint top
  highlight, like light catching a brushed faceplate. Dropping backdrop blur
  also removes a real paint cost on the participant grid.
- **Identity colours are curated, not generated.** Six muted tones (clay, moss,
  steel, brass, plum, slate teal) chosen to sit together against graphite and to
  stay clear of amber, so a participant's colour never reads as an indicator. A
  free 0–360 hue gave every person a distinct colour but no shared character.
- **Tighter geometry.** `--radius` is `0.625rem`, closer to a hardware faceplate
  than the usual soft pill.

Tokens live in `src/app/globals.css`. Changing `--primary` and the `--panel-*`
group re-themes the whole app.

---

## How the pieces work

### Signaling and mesh setup

When someone joins, the server tells each **existing** participant to initiate
toward the newcomer. Only one side of each pair ever offers, which sidesteps
glare entirely. Peer connections additionally implement the
[perfect negotiation](https://w3c.github.io/webrtc-pc/#perfect-negotiation-example)
pattern, so renegotiation (device switches, ICE restarts) stays collision-free.

Relayed SDP and ICE messages are checked to ensure sender and target share a
room, so a client can't signal into a call it isn't part of.

### Reconnection

Socket.IO reconnects with backoff indefinitely. Because a reconnect assigns a
new socket id, the client tears down every peer connection and rebuilds the mesh
rather than trying to reuse stale ones. Separately, individual peer connections
that reach ICE `failed` trigger an ICE restart from the initiating side.

### Voice activity detection

One shared `AudioContext` drives one `AnalyserNode` per stream, sampled from a
single `requestAnimationFrame` loop. Speaking uses hysteresis — a higher onset
threshold than release threshold, plus a hangover timer — so the indicator
doesn't strobe between syllables. State commits are throttled to ~10fps and
skipped entirely when nothing meaningful changed, which keeps VAD from
dominating React's render budget.

### Profanity monitoring

Uses the **browser-native Web Speech API** — no external service, no AI model,
no audio or transcript leaves the device. Transcripts are matched against a
local wordlist and then discarded; they are never stored, returned from the
hook, or rendered. Only a boolean signal escapes.

The matcher normalises leetspeak and repeated characters before matching on word
boundaries, so `fuuuuck` and `sh1t` are caught while `class`, `analysis` and
`Scunthorpe` are not.

A flagged participant sees a toast and a small badge. They are **never
disconnected**, and monitoring simply continues.

---

## Browser support

| | Chrome / Edge | Safari | Firefox |
| --- | --- | --- | --- |
| Voice calls | ✅ | ✅ | ✅ |
| Speaking detection | ✅ | ✅ | ✅ |
| Profanity monitoring | ✅ | ❌ | ❌ |

Profanity monitoring depends on the Web Speech API, which only Chromium browsers
implement. Everywhere else the feature degrades silently — calls work fine, and
Settings explains why the toggle is unavailable.

Microphone access requires a secure context, so use HTTPS in production.
`localhost` is exempt during development.

One quirk worth knowing: Chromium runs noise suppression and echo cancellation
in a single audio-processing module, so it will not disable noise suppression
while echo cancellation is on. Changing either setting does re-acquire the
microphone and swap the outgoing track — the browser just may not honour every
combination.

---

## Project structure

```
server/                     Standalone Socket.IO signaling server
src/
  app/                      Routes (Server Components) + /api/turn-credentials
  components/
    landing/                Hero, feature cards, create/join dialogs
    room/                   Avatars, grid, controls, participant list, dialogs
    ui/                     shadcn/ui primitives
  contexts/                 Persisted user settings
  hooks/                    WebRTC orchestration, VAD, speech, devices, clipboard
  lib/                      Room IDs, ICE config, profanity matcher, error copy
  services/                 Socket client, RTCPeerConnection wrapper
  types/                    Shared client/server contract
```

`src/types/index.ts` is imported by both the app and the signaling server and is
the single source of truth for the wire protocol.
