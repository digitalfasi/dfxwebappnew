/** @type {import('next').NextConfig} */

// Content-Security-Policy.
//
// Written with the app's actual shape in mind rather than copied from a
// template. Two honest limitations, stated here so nobody reads this as
// stronger than it is:
//
//   'unsafe-inline' on script-src — Next's App Router inlines its hydration
//   bootstrap and flight data into the document. Removing it needs a nonce
//   threaded through a middleware on every request, which changes how every
//   page is rendered; that is its own change with its own regression, not a
//   line in a config file. What this CSP still buys, even with inline allowed:
//   no script may be loaded from another origin, so an injected
//   <script src="//attacker"> is dead.
//
//   'unsafe-inline' on style-src — Tailwind plus the inline style attributes
//   this UI uses throughout. Inline CSS is a far smaller weapon than inline JS.
//
// The directives that cost nothing and close real holes are all strict:
// object-src none (no Flash/PDF plugin injection), base-uri self (an injected
// <base> cannot repoint every relative URL), frame-ancestors none (clickjacking,
// and it is the header-equivalent that actually applies to modern browsers),
// form-action self (an injected form cannot POST credentials elsewhere).
//
// connect-src must name the API origin: the SPA calls it with fetch, and 'self'
// alone would block every request. It falls back to the local dev API.
// Empty when the API is reached by a relative path (the deployed setup sends
// NEXT_PUBLIC_API_URL=/api/v1 through the same origin) - 'self' already covers
// it, and naming a guessed absolute origin would both be wrong and, if it were
// localhost, block every API call the browser makes.
const API_ORIGIN = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL || "";
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
})();

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // data: for inlined icons, blob: for anything the app renders client-side,
  // and the API origin because product and catalogue images are served from it.
  `img-src 'self' data: blob: ${API_ORIGIN}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${API_ORIGIN}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

// The API origin ships a full set of security headers; the app origin shipped
// none, so the pages that actually render a customer's data were the unguarded
// half.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Do not let a browser second-guess a declared type - "looks like HTML" is how
  // an uploaded image becomes a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Kept alongside frame-ancestors for browsers that honour only this one.
  { key: "X-Frame-Options", value: "DENY" },
  // Send the origin to other sites, the full path only to ourselves: an invoice
  // or customer id has no business travelling in a Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here uses a camera, a microphone or a location.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // HTTPS only, once the browser has seen this header. Kept off preload: that
  // is a one-way commitment for the whole domain.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  // Sent for every response this origin serves, pages and assets alike.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
