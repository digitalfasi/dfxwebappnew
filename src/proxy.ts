import { NextRequest, NextResponse } from "next/server";

// Content-Security-Policy with a per-request nonce.
//
// Next's App Router inlines its hydration bootstrap into every page. It used
// to be allowed with script-src 'unsafe-inline', which also lets any injected
// inline script run (security assessment 2026-10-06, A5). Next reads the nonce
// from the CSP request header set here and stamps it on its own scripts, so
// only those run. Pages render per request for this (layout.tsx reads
// headers()); they were already served no-store.
//
// style-src keeps 'unsafe-inline': the UI uses inline style attributes, and a
// nonce cannot cover attributes. Inline CSS cannot run code.

const IS_DEV = process.env.NODE_ENV !== "production";

// connect-src must name the API origin when the SPA calls it on another host
// (local dev). Deployed, NEXT_PUBLIC_API_URL is the relative /api/v1, so
// 'self' already covers it and nothing is added.
const API_ORIGIN = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL || "";
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
})();

// Locally the API is reached as 127.0.0.1 but the backend writes media URLs as
// localhost (or the reverse), so both loopback spellings are allowed.
const MEDIA_ORIGINS = (() => {
  if (!API_ORIGIN) return "";
  const twin = API_ORIGIN.replace("//127.0.0.1", "//localhost") === API_ORIGIN
    ? API_ORIGIN.replace("//localhost", "//127.0.0.1")
    : API_ORIGIN.replace("//127.0.0.1", "//localhost");
  return twin === API_ORIGIN ? API_ORIGIN : `${API_ORIGIN} ${twin}`;
})();

// Images come from this site (/media), the old host name that still serves the
// same app, Supabase storage when it is configured, and OpenStreetMap tiles for
// the branch location picker. Not every https host any more (A5 "wildcard").
const IMG_HOSTS = [
  "https://srv2000556.hstgr.cloud",
  "https://*.supabase.co",
  "https://*.tile.openstreetmap.org",
].join(" ");

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets the barcode reader (WebAssembly from this site)
    // compile. It allows WebAssembly only - JavaScript eval stays blocked.
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${IS_DEV ? " 'unsafe-eval'" : ""}`,
    // Google Fonts serves the stylesheet that loads the app's fonts.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob: ${IMG_HOSTS} ${MEDIA_ORIGINS}`.trim(),
    // Promotion banner videos: blob: for a picked file, the API origin for a
    // saved one.
    `media-src 'self' blob: ${MEDIA_ORIGINS}`.trim(),
    "font-src 'self' data: https://fonts.gstatic.com",
    // Nominatim answers the branch address search.
    `connect-src 'self' https://nominatim.openstreetmap.org ${API_ORIGIN}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Documents only. Static chunks, images and the API never execute as a page.
export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|login-|zxing).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
