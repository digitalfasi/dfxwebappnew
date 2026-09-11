"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Pick a branch location on a map instead of typing coordinates.
 *
 * Leaflet + OpenStreetMap, chosen over Google Maps because this form needs one
 * thing — drop a pin, get coordinates — and Leaflet does it with no API key, no
 * billing relationship and no vendor account to keep alive in a deploy that has
 * none. See PROJECT_CONTEXT §9 for the comparison.
 *
 * Leaflet is imported dynamically, inside an effect, because it touches
 * `window` at module scope and this app is server-rendered.
 *
 * ── Nominatim usage policy ────────────────────────────────────────────────
 * Nominatim is a free service run on donated infrastructure, and its policy is
 * a condition of use, not a suggestion:
 *   * at most 1 request per second — enforced here by a debounce AND a
 *     module-level timestamp, so two mounted pickers cannot together exceed it;
 *   * an identifying Referer/User-Agent — a browser sets these itself and will
 *     not let us override User-Agent, so the app identifies itself with the
 *     `email` parameter their policy accepts instead;
 *   * no bulk/automated querying — search runs only when a person types and
 *     then pauses, never on every keystroke;
 *   * cache results — repeated searches for the same text are answered from a
 *     local cache and never re-sent.
 * Breaking these gets the whole IP blocked, which would take the feature out
 * for every tenant at once.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Their policy asks for a contact address on automated use.
const CONTACT = "info@dfxsolution.com";
const MIN_INTERVAL_MS = 1100; // a shade over 1/sec, for clock skew
const DEBOUNCE_MS = 700;

// Shared across every instance of this component in the page, which is the
// point: the limit is per client, not per component.
let lastRequestAt = 0;
const searchCache = new Map();

// Bengaluru, only as the "no location yet" starting view.
const DEFAULT_CENTER = [12.9716, 77.5946];

async function geocode(query) {
  const key = query.trim().toLowerCase();
  if (searchCache.has(key)) return searchCache.get(key);

  const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestAt = Date.now();

  const url = `${NOMINATIM}?format=jsonv2&limit=5&countrycodes=in&email=${encodeURIComponent(CONTACT)}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Address search is unavailable right now (${res.status})`);
  const rows = (await res.json()).map(r => ({
    label: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));
  searchCache.set(key, rows);
  return rows;
}

export default function BranchLocationPicker({ latitude, longitude, onChange, addressQuery }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const leafletRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [ready, setReady] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [query, setQuery] = useState("");

  const hasPoint = latitude !== "" && longitude !== "" && latitude != null && longitude != null;

  // Build the map once. Leaflet is not a React component here on purpose: it
  // owns its own DOM, and re-rendering it on every keystroke of the form would
  // tear down and rebuild the tile layer.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !hostRef.current || mapRef.current) return;
      leafletRef.current = L;

      // Leaflet's default marker icons are resolved relative to the CSS file
      // and break under a bundler; a small inline SVG avoids shipping the
      // sprite entirely and renders identically at every zoom.
      const icon = L.divIcon({
        className: "",
        html: '<svg viewBox="0 0 24 24" width="30" height="30" fill="#c9a84c" stroke="#1c1c1c" stroke-width="1.2"><path d="M12 22s7-6.2 7-12A7 7 0 0 0 5 10c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6" fill="#1c1c1c"/></svg>',
        iconSize: [30, 30],
        iconAnchor: [15, 28],
      });

      const start = hasPoint ? [Number(latitude), Number(longitude)] : DEFAULT_CENTER;
      const map = L.map(hostRef.current, { attributionControl: true }).setView(start, hasPoint ? 16 : 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        // Attribution is required by the ODbL licence the tiles are under.
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const marker = L.marker(start, { draggable: true, icon }).addTo(map);
      if (!hasPoint) marker.setOpacity(0.45);

      const commit = (latlng) => {
        marker.setOpacity(1);
        onChangeRef.current?.({
          latitude: latlng.lat.toFixed(6),
          longitude: latlng.lng.toFixed(6),
        });
      };
      marker.on("dragend", () => commit(marker.getLatLng()));
      map.on("click", (e) => { marker.setLatLng(e.latlng); commit(e.latlng); });

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coordinates edited elsewhere (or loaded for an existing branch) move the
  // marker, without fighting a drag in progress.
  useEffect(() => {
    if (!ready || !hasPoint || !markerRef.current) return;
    const next = [Number(latitude), Number(longitude)];
    const cur = markerRef.current.getLatLng();
    if (Math.abs(cur.lat - next[0]) < 1e-6 && Math.abs(cur.lng - next[1]) < 1e-6) return;
    markerRef.current.setLatLng(next).setOpacity(1);
    mapRef.current.setView(next, Math.max(mapRef.current.getZoom(), 15));
  }, [ready, hasPoint, latitude, longitude]);

  const runSearch = useCallback(async (text) => {
    const q = text.trim();
    if (q.length < 4) { setResults([]); return; }
    setSearching(true);
    setSearchError("");
    try {
      setResults(await geocode(q));
    } catch (err) {
      setSearchError(err?.message || "Address search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced: search runs when the typing stops, never per keystroke.
  useEffect(() => {
    if (!query) { setResults([]); return; }
    const t = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const pick = (r) => {
    setResults([]);
    setQuery(r.label);
    onChangeRef.current?.({ latitude: r.lat.toFixed(6), longitude: r.lon.toFixed(6) });
    if (mapRef.current) mapRef.current.setView([r.lat, r.lon], 16);
    if (markerRef.current) markerRef.current.setLatLng([r.lat, r.lon]).setOpacity(1);
  };

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={addressQuery ? "Search this address, or a landmark" : "Search an address or landmark"}
          className="h-10 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent"
        />
        {addressQuery && (
          <button
            type="button"
            onClick={() => setQuery(addressQuery)}
            className="shrink-0 rounded-xl border border-line bg-white px-3 text-xs font-bold hover:border-accent"
            title="Search the address typed above"
          >
            Use address
          </button>
        )}
      </div>

      {searching && <div className="text-xs text-muted">Searching…</div>}
      {searchError && <div className="text-xs font-semibold text-danger">{searchError}</div>}
      {results.length > 0 && (
        <ul className="max-h-40 overflow-auto rounded-xl border border-line bg-white text-sm">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => pick(r)} className="block w-full px-3 py-2 text-left text-xs hover:bg-canvas">
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={hostRef} className="h-64 w-full overflow-hidden rounded-xl border border-line bg-canvas" />

      <div className="flex items-center justify-between text-xs text-muted">
        <span>Click the map or drag the pin to set the exact spot.</span>
        <span className="num">
          {hasPoint ? `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}` : "No location selected"}
        </span>
      </div>
    </div>
  );
}
