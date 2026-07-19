"use client";

import { useEffect, useRef } from "react";

interface RemoteAudioProps {
  stream: MediaStream;
  muted: boolean;
}

function RemoteAudio({ stream, muted }: RemoteAudioProps) {
  const ref = useRef<HTMLAudioElement>(null);

  // Attaching and playing must stay together: a peer's stream object is
  // replaced in place on renegotiation without remounting this component, and
  // a fresh srcObject leaves the element paused until play() is called again.
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    el.srcObject = stream;
    el.muted = muted;

    // Autoplay can be blocked until the user has interacted with the page.
    // The parent owns the unlock gesture, so a rejection is not an error here.
    void el.play().catch(() => undefined);
  }, [stream, muted]);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    return () => {
      // Dropping the reference lets the browser release the decoder and the
      // underlying transport; leaving it attached leaks across re-joins.
      el.pause();
      el.srcObject = null;
    };
  }, []);

  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

interface AudioRendererProps {
  streams: Map<string, MediaStream>;
  mutedPeers: ReadonlySet<string>;
}

export function AudioRenderer({ streams, mutedPeers }: AudioRendererProps) {
  return (
    <div aria-hidden="true" className="hidden">
      {Array.from(streams, ([peerId, stream]) => (
        <RemoteAudio
          key={peerId}
          stream={stream}
          muted={mutedPeers.has(peerId)}
        />
      ))}
    </div>
  );
}
