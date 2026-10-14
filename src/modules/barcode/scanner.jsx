"use client";
// Reading a piece's barcode at the counter, two ways:
//  - A USB scanner, or a phone app that acts as one, "types" the code very
//    fast and presses Enter. useScannerInput spots that burst anywhere on the
//    page (a person cannot type 3+ keys under 40 ms apart) and hands over the
//    code - even with the cursor in a text box, which gets its text back.
//  - CameraScanner reads the barcode with the phone's or laptop's camera.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/_shared/ui/button";

const MAX_GAP_MS = 100;  // longer pause = a person typing, start over
const MAX_AVG_MS = 40;   // a scanner's average key gap

export function useScannerInput(onScan, enabled = true) {
  const cb = useRef(onScan);
  useEffect(() => { cb.current = onScan; }, [onScan]);
  useEffect(() => {
    if (!enabled) return undefined;
    let buf = "", first = 0, last = 0, box = null, boxVal = "";
    const onKey = (e) => {
      // Autofill / password managers fire keydown with no key at all.
      if (e.ctrlKey || e.altKey || e.metaKey || typeof e.key !== "string") return;
      const t = e.target;
      // A scan works with the cursor in any text box too: the burst is still
      // spotted, and the box gets back what it held before the scan.
      const field = t && /^(INPUT|TEXTAREA)$/.test(t.tagName) ? t : null;
      // When the key was pressed, not when this page got to it: a busy page
      // handles a scanner's burst late, and late must not read as "slow".
      const now = e.timeStamp || performance.now();
      if (now - last > MAX_GAP_MS) { buf = ""; first = now; box = field; boxVal = field ? field.value : ""; }
      last = now;
      if (e.key === "Enter") {
        const v = buf;
        buf = "";
        if (v.length >= 3 && (now - first) / v.length < MAX_AVG_MS) {
          e.preventDefault();
          e.stopPropagation();
          if (box && box.value !== boxVal) {
            const proto = box.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, "value").set.call(box, boxVal);
            box.dispatchEvent(new Event("input", { bubbles: true }));
          }
          cb.current(v);
        }
        return;
      }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}

// Camera barcode engine: the browser's own BarcodeDetector where it reads
// Code 128 (Android Chrome, macOS), otherwise ZXing-C++ compiled to
// WebAssembly - far stronger on blurry webcam frames than ZXing in plain JS.
// Its .wasm is served from this site (/zxing_reader.wasm), never a CDN.
const FORMATS = ["code_128", "qr_code"];
let detectorPromise = null;
function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const Native = globalThis.BarcodeDetector;
      try {
        if (Native && (await Native.getSupportedFormats())?.includes("code_128")) return new Native({ formats: FORMATS });
      } catch { /* fall back to WebAssembly */ }
      const m = await import("barcode-detector/ponyfill");
      m.prepareZXingModule({
        overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? "/zxing_reader.wasm" : prefix + path) },
      });
      return new m.BarcodeDetector({ formats: FORMATS });
    })();
    detectorPromise.catch(() => { detectorPromise = null; });
  }
  return detectorPromise;
}

// Camera popup. Reads Code 128 (our stickers) and QR. Calls onResult once.
export function CameraScanner({ onResult, onClose }) {
  const video = useRef(null);
  const [error, setError] = useState("");
  const done = useRef(false);
  const resultCb = useRef(onResult);
  useEffect(() => { resultCb.current = onResult; }, [onResult]);
  useEffect(() => {
    let stream = null, timer = null, cancelled = false;
    const stop = () => { clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError("This browser cannot use the camera. Open DFX in Chrome on the phone or laptop."); return; }
      try {
        const [detector, media] = await Promise.all([
          getDetector(),
          // Full HD where the camera has it: thin bars need the pixels.
          navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } }),
        ]);
        stream = media;
        if (cancelled) { stop(); return; }
        const v = video.current;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (cancelled || done.current) return;
          if (v.readyState >= 2) {
            try {
              const codes = await detector.detect(v);
              const hit = codes.find((c) => (c.rawValue || "").trim());
              if (hit && !done.current && !cancelled) {
                done.current = true;
                stop();
                resultCb.current(hit.rawValue.trim());
                return;
              }
            } catch { /* frame not readable yet */ }
          }
          timer = setTimeout(tick, 80);
        };
        tick();
      } catch (err) {
        stop();
        if (cancelled) return;
        const n = err?.name || "";
        setError(n === "NotAllowedError" ? "Camera permission was refused. Allow the camera for this site in the browser settings, then try again."
          : n === "NotFoundError" || n === "OverconstrainedError" ? "No camera was found on this device."
          : n === "NotReadableError" ? "The camera is being used by another app. Close it and try again."
          : "The camera could not be started. Try again, or type the code instead.");
      }
    })();
    return () => { cancelled = true; stop(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Rendered on <body>: an animated parent (transform) would otherwise trap a
  // fixed overlay inside itself.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="camera-scan-title">
      <button className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[460px] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        <div className="px-6 pt-6">
          <h3 id="camera-scan-title" className="text-base font-extrabold">Scan QR code</h3>
          <p className="mt-0.5 text-sm text-muted">Hold the QR code inside the box, about a hand&apos;s width from the camera. It reads by itself.</p>
        </div>
        <div className="px-6 pt-4">
          {error ? (
            <div className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm font-semibold text-danger" role="alert">{error}</div>
          ) : (
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink">
              <video ref={video} className="h-full w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[60%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end border-t border-line bg-canvas/30 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose} autoFocus>Cancel</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
