"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The sign-in / free-trial background: the marble-and-gold still, brought to
 * life by a short film of the same scene.
 *
 * The photograph is always painted first and stays underneath, so the page is
 * never blank while the film loads, on a slow line, or where autoplay is
 * refused. The film is the original file, untouched - no re-encode, no
 * quality loss - and fills the viewport with object-cover, so there is never
 * a gap at any aspect ratio. Data Saver users get the still alone.
 *
 * Seamless loop: the film's camera drifts, so its last frame is not its
 * first and a plain `loop` jumps every 8 s. Two copies take turns instead:
 * FADE seconds before one ends, the other starts from the top and dissolves
 * in over it, so the seam is a soft cross-fade rather than a cut.
 */
const SRC = "/login-bg.mp4";
const FADE = 1.2; // seconds of cross-fade at the seam

export default function LoginBackdrop({ veil = "from-white/60 via-white/30 to-white/5" }) {
  const a = useRef(null);
  const b = useRef(null);
  const [front, setFront] = useState(null); // "a" | "b" | null (still showing)
  // The copy being faded OVER stays fully visible underneath until the new one
  // is opaque; fading both at once would let the still show through mid-seam.
  const [back, setBack] = useState(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    // Only Data Saver turns the film off. prefers-reduced-motion is NOT used:
    // Windows reports it whenever "Animation effects" is off, which is common
    // on office PCs, and the owner wants this slow, calm film seen there.
    if (typeof navigator !== "undefined" && navigator.connection?.saveData) { setStill(true); return; }
    const A = a.current, B = b.current;
    if (!A || !B) return;
    for (const v of [A, B]) {
      // React does not write `muted` as an HTML attribute, so the browser's
      // autoplay check sees a film with sound and refuses it. Say it directly.
      v.muted = true; v.defaultMuted = true; v.setAttribute("muted", "");
    }
    let active = A, handing = false, alive = true;
    const play = (v) => { const p = v.play?.(); if (p && p.catch) p.catch(() => {}); };

    const start = () => { if (active.paused) play(active); };
    const onPlaying = (e) => { if (e.target === active && alive) setFront(active === A ? "a" : "b"); };
    const onTime = (e) => {
      const v = e.target;
      if (v !== active || handing || !v.duration) return;
      if (v.currentTime >= v.duration - FADE) {
        // Hand over: the other copy starts at 0 and fades in on top.
        handing = true;
        const next = v === A ? B : A;
        if (!next.getAttribute("src")) { next.src = SRC; }
        next.currentTime = 0;
        play(next);
        active = next;
        setBack(v === A ? "a" : "b");
        setFront(next === A ? "a" : "b");
        setTimeout(() => { v.pause(); v.currentTime = 0; if (alive) setBack(null); handing = false; }, FADE * 1000 + 150);
      }
    };
    // A background tab may not start a film until it is shown.
    const onVis = () => { if (document.visibilityState === "visible") start(); };

    for (const v of [A, B]) {
      v.addEventListener("playing", onPlaying);
      v.addEventListener("timeupdate", onTime);
    }
    A.addEventListener("canplay", start);
    // The second copy loads only once the first has the whole file, so it is
    // read from the browser cache instead of downloading 2.7 MB again.
    const warm = () => { if (!B.getAttribute("src")) { B.src = SRC; B.load(); } };
    A.addEventListener("canplaythrough", warm);
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      alive = false;
      for (const v of [A, B]) {
        v.removeEventListener("playing", onPlaying);
        v.removeEventListener("timeupdate", onTime);
      }
      A.removeEventListener("canplay", start);
      A.removeEventListener("canplaythrough", warm);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const film = (ref, id) => (
    <video
      ref={ref}
      src={id === "a" ? SRC : undefined}
      poster="/login-bg.jpg"
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden="true"
      tabIndex={-1}
      style={{ transitionDuration: `${FADE}s` }}
      className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity ease-in-out ${
        front === id ? "z-[1] opacity-100" : back === id ? "z-0 opacity-100" : "z-0 opacity-0"}`}
    />
  );

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/login-bg.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
      {!still && (
        <div className="pointer-events-none absolute inset-0">
          {film(a, "a")}
          {film(b, "b")}
        </div>
      )}
      {/* A light veil so the card reads, without washing the film out. */}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${veil}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_45%,rgba(45,38,28,0.22)_100%)]" />
    </>
  );
}
