/**
 * ICE configuration.
 *
 * STUN alone is enough for most home/office networks, but roughly 10–15% of
 * connections (symmetric NAT, corporate firewalls, some mobile carriers) need
 * a TURN relay. Configure TURN via env vars — see `.env.example`.
 */

const STUN_SERVERS: RTCIceServer[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "stun:global.stun.twilio.com:3478",
    ],
  },
];

/**
 * Reads TURN credentials from the public env. These are intentionally
 * `NEXT_PUBLIC_*`: TURN credentials are always visible to the browser that
 * uses them, so the only real protection is short-lived credentials issued
 * per session (see `getIceServers` for the dynamic path).
 */
function getStaticTurnServers(): RTCIceServer[] {
  const urls = process.env.NEXT_PUBLIC_TURN_URLS;
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (!urls || !username || !credential) return [];

  return [
    {
      urls: urls.split(",").map((u) => u.trim()).filter(Boolean),
      username,
      credential,
    },
  ];
}

/**
 * Fetches ephemeral TURN credentials from our own API route when a provider
 * is configured server-side. Falls back to static/STUN-only on any failure so
 * a TURN outage degrades rather than breaks the call.
 */
export async function getIceServers(signal?: AbortSignal): Promise<RTCIceServer[]> {
  const fallback = [...STUN_SERVERS, ...getStaticTurnServers()];

  try {
    const res = await fetch("/api/turn-credentials", { signal, cache: "no-store" });
    if (!res.ok) return fallback;

    const body: unknown = await res.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "iceServers" in body &&
      Array.isArray((body as { iceServers: unknown }).iceServers)
    ) {
      const dynamic = (body as { iceServers: RTCIceServer[] }).iceServers;
      if (dynamic.length > 0) return [...STUN_SERVERS, ...dynamic];
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function buildPeerConfiguration(iceServers: RTCIceServer[]): RTCConfiguration {
  return {
    iceServers,
    // A small pool warms candidates before the offer is created, shaving
    // ~100–300ms off time-to-first-audio.
    iceCandidatePoolSize: 4,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}

/** Opus tuned for speech: mono, moderate bitrate, DTX to save bandwidth on silence. */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
};

export const OPUS_SEND_PARAMS = {
  maxBitrate: 32_000,
  /** Opus discontinuous transmission — stops sending during silence. */
  dtx: true,
} as const;
