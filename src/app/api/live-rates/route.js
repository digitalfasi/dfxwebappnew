/**
 * DFX Collector Engine — read-only live rate endpoint.  GET /api/live-rates
 *
 * Scrapes KJPL + MJDTA server-side (see src/lib/collector.js) and returns the
 * normalized payload. Feeds the admin web form (auto-prefill) and can be called
 * directly by any client (e.g. a native mobile app — CORS does not apply there).
 * Pass ?fresh=1 to bypass the 20s soft cache.
 */
import { collectLiveRates } from "../../../lib/collector";

export const dynamic = "force-dynamic"; // never statically cached
export const revalidate = 0;

export async function GET(request) {
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const body = await collectLiveRates({ fresh });
  return Response.json(body, { status: body.success ? 200 : 502 });
}
