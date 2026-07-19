import type { NextConfig } from "next";

/**
 * `getUserMedia` and the Web Speech API only work in a secure context, and the
 * Permissions-Policy header must explicitly allow the microphone for this origin.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // The signaling server lives outside src/ and is not part of the Next build.
  // Type-checking it is handled separately by `npm run typecheck`.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
