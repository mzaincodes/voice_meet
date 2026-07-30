/**
 * Unit tests for the signaling-URL config guard — the check that turns the
 * "works for me but nobody else can join" Vercel misconfiguration into an
 * immediate, actionable error instead of a forever-hang.
 *
 * The function under test is pure, so this needs no browser. It mirrors the
 * implementation in src/services/socket-client.ts; keep them in sync.
 */

function isLocalHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

function evaluateSocketConfig(socketUrl, pageProtocol, pageHostname) {
  let url;
  try {
    url = new URL(socketUrl);
  } catch {
    return "The signaling server address (NEXT_PUBLIC_SOCKET_URL) is not a valid URL.";
  }
  const pageIsLocal = isLocalHostname(pageHostname);
  const serverIsLocal = isLocalHostname(url.hostname);
  if (!pageIsLocal && serverIsLocal) {
    return "This site is deployed, but its signaling server is still set to localhost, so no one else can connect. Set NEXT_PUBLIC_SOCKET_URL to your deployed signaling server's URL and redeploy.";
  }
  if (pageProtocol === "https:" && url.protocol === "http:" && !serverIsLocal) {
    return "This site is served over HTTPS, but the signaling server URL is http://, which browsers block as mixed content. Use an https:// URL for NEXT_PUBLIC_SOCKET_URL.";
  }
  return null;
}

let passed = 0;
let failed = 0;

function expect(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const near = (msg, needle) => typeof msg === "string" && msg.includes(needle);

console.log("\nsignaling config guard\n");

// The healthy setups — must NOT fire.
expect(
  "local dev (localhost page -> localhost server) is allowed",
  evaluateSocketConfig("http://localhost:3001", "http:", "localhost") === null,
);
expect(
  "LAN dev (127.0.0.1 page -> localhost server) is allowed",
  evaluateSocketConfig("http://localhost:3001", "http:", "127.0.0.1") === null,
);
expect(
  "proper deploy (https page -> https server) is allowed",
  evaluateSocketConfig("https://signal.example.com", "https:", "app.vercel.app") === null,
);
expect(
  "proper deploy to wss server is allowed",
  evaluateSocketConfig("wss://signal.example.com", "https:", "app.vercel.app") === null,
);

// THE bug the user hit — deployed page, server still localhost.
{
  const msg = evaluateSocketConfig("http://localhost:3001", "https:", "myapp.vercel.app");
  expect("deployed page pointing at localhost fires", msg !== null);
  expect("...and the message names the fix (NEXT_PUBLIC_SOCKET_URL)", near(msg, "NEXT_PUBLIC_SOCKET_URL"));
  expect("...and mentions redeploy", near(msg, "redeploy"));
}
expect(
  "deployed page pointing at 127.0.0.1 fires",
  evaluateSocketConfig("http://127.0.0.1:3001", "https:", "myapp.vercel.app") !== null,
);

// Mixed content — https page, http remote server.
{
  const msg = evaluateSocketConfig("http://signal.example.com", "https:", "app.vercel.app");
  expect("https page + http remote server fires (mixed content)", msg !== null);
  expect("...and the message explains mixed content", near(msg, "mixed content"));
}

// Invalid URL.
expect(
  "an unparseable socket URL fires",
  evaluateSocketConfig("not a url", "https:", "app.vercel.app") !== null,
);

// A correctly-deployed http server on a http page (e.g. internal network) is fine.
expect(
  "http page + http remote server is allowed (no mixed content)",
  evaluateSocketConfig("http://signal.internal", "http:", "app.internal") === null,
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
