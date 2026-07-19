import { createHmac } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * Issues short-lived TURN credentials.
 *
 * TURN credentials always end up in the browser, so the only meaningful
 * protection is making them expire. This implements coturn's standard
 * REST API scheme (`use-auth-secret`): the username is `<expiry>:<label>`
 * and the password is base64(HMAC-SHA1(username, shared-secret)).
 *
 * If no secret is configured the route returns an empty list and the client
 * falls back to STUN-only — which works for the majority of networks.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Credentials live for 12 hours — far longer than any call, short enough to matter. */
const TTL_SECONDS = 12 * 60 * 60;

export async function GET() {
  const turnUrls = process.env.TURN_URLS;
  const secret = process.env.TURN_STATIC_AUTH_SECRET;

  if (!turnUrls || !secret) {
    return NextResponse.json(
      { iceServers: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const expiry = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const username = `${expiry}:voicemeet`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");

  const urls = turnUrls
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  return NextResponse.json(
    {
      iceServers: [{ urls, username, credential }],
      // Lets the client refresh before expiry if a call somehow outlives the TTL.
      expiresAt: expiry * 1000,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
