/** @type {import('next').NextConfig} */

// The API origin ships a full set of security headers; the app origin shipped
// none, so the pages that actually render a customer's data were the unguarded
// half. These are the headers that cost nothing to set and need no per-page
// thought.
//
// No Content-Security-Policy yet: the app is a client-rendered SPA with inline
// styles, and a CSP written blind here would either break the UI or be so loose
// it says nothing. It wants its own pass, with the page open in a browser.
const securityHeaders = [
  // Do not let a browser second-guess a declared type - "looks like HTML" is how
  // an uploaded image becomes a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The admin console is never legitimately framed by anyone.
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
