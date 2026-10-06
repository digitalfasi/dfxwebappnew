import { readFileSync } from "node:fs";
/** @type {import('next').NextConfig} */

// Content-Security-Policy lives in src/proxy.ts now: it carries a fresh nonce
// per request, so script-src no longer needs 'unsafe-inline' (security
// assessment 2026-10-06, A5). The headers below are the ones nginx does NOT
// already send. nosniff, X-Frame-Options and Referrer-Policy come from nginx;
// sending them here as well produced duplicate, conflicting values (A4).
const securityHeaders = [
  // The camera is for New Sale's "Scan barcode", on this site only (self) -
  // never inside another site's frame. No microphone or location.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()" },
  // HTTPS only, once the browser has seen this header. Kept off preload: that
  // is a one-way commitment for the whole domain.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

// The commit this bundle was built from, read at BUILD time from the DEPLOY_SHA
// that scripts/archive.sh stamps into the archive root. Surfaced in the UI so
// "which build is that browser actually running?" is answerable from a
// screenshot instead of by asking someone to open devtools. Two people looking
// at the same URL and disagreeing about what it shows is, more often than not,
// two different bundles - and there was no way to tell.
let BUILD_SHA = "dev";
try {
  BUILD_SHA = readFileSync(new URL("./DEPLOY_SHA", import.meta.url), "utf8").trim() || "dev";
} catch {
  // Not an archive build (local dev, or a checkout without the stamp).
}

const nextConfig = {
  env: { NEXT_PUBLIC_BUILD_SHA: BUILD_SHA },
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  // Sent for every response this origin serves, pages and assets alike.
  async headers() {
    return [
      // The app shell must be revalidated. Next defaults a prerendered page to
      // "s-maxage=31536000", which let returning browsers keep an app shell
      // pointing at an older build's chunk names long after a deploy: the
      // symptom is a machine still hitting a bug that was fixed and shipped,
      // curable only by a hard refresh.
      //
      // /_next/static is excluded rather than overridden. Those filenames carry
      // their own content hash, so Next's own immutable default is already
      // right, and setting it explicitly here would also apply in dev, where
      // it serves stale chunks to whoever is working on the app.
      {
        source: "/:path((?!_next/static|login-(?:bg|film)).*)",
        headers: [...securityHeaders, { key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      // The sign-in background films and their still: ~8 MB that never changes
      // between deploys. no-store made every visit download it again (twice,
      // for the cross-fade copy). Cached for a week; ship a new file under a
      // new name rather than overwriting it.
      {
        source: "/:file(login-bg|login-film|login-film-rev).:ext(mp4|jpg)",
        headers: [...securityHeaders, { key: "Cache-Control", value: "public, max-age=604800" }],
      },
      { source: "/_next/static/:path*", headers: securityHeaders },
    ];
  },
};
export default nextConfig;
