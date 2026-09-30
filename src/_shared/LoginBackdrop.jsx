"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The sign-in / free-trial background: a slow push-in on the marble-and-gold
 * still, played forward and then backward, forever, with no seam.
 *
 * Why two files. The film zooms, so its last frame is not its first and a
 * plain loop would jump. Played forward (login-film.mp4) and then reversed
 * (login-film-rev.mp4, the same frames in reverse order), each clip ENDS on
 * exactly the frame the other STARTS on, so the hand-over is invisible - no
 * cut, no dissolve. The reversed file exists because browsers cannot play a
 * video backwards smoothly.
 *
 * Both files are cropped to the picture's own 3:2 frame (the generator had
 * padded it with black bars) and fill the viewport with object-cover, like
 * the still beneath them, which is the film's own first frame. The still is
 * always painted first, so the page is never blank; the film shows only once
 * it is playing. Data Saver users get the still alone.
 */
const FWD = "/login-film.mp4";
const REV = "/login-film-rev.mp4";
const STILL = "/login-film.jpg";

export default function LoginBackdrop({ veil = "from-white/60 via-white/30 to-white/5" }) {
  const fwd = useRef(null);
  const rev = useRef(null);
  const [front, setFront] = useState(null); // "f" | "r" | null (still showing)
  const [still, setStill] = useState(false);

  useEffect(() => {
    // Only Data Saver turns the film off. prefers-reduced-motion is NOT used:
    // Windows reports it whenever "Animation effects" is off, which is common
    // on office PCs, and the owner wants this slow, calm film seen there.
    if (typeof navigator !== "undefined" && navigator.connection?.saveData) { setStill(true); return; }
    const F = fwd.current, R = rev.current;
    if (!F || !R) return;
    for (const v of [F, R]) {
      // React does not write `muted` as an HTML attribute, so the browser's
      // autoplay check sees a film with sound and refuses it. Say it directly.
      v.muted = true; v.defaultMuted = true; v.setAttribute("muted", "");
    }
    let alive = true, active = F;
    const play = (v) => { const p = v.play?.(); if (p && p.catch) p.catch(() => {}); };

    // The reversed copy loads once the forward one has the whole file, so the
    // first film starts as soon as possible.
    const warm = () => { if (!R.getAttribute("src")) { R.src = REV; R.load(); } };

    // Hand over on the shared frame. The finished clip holds its last frame
    // on screen until the other is ready to play from its first - which is
    // the same picture - so a slow line never shows a jump.
    const handOver = (from) => {
      if (!alive || from !== active) return;
      const to = from === F ? R : F;
      if (!to.getAttribute("src")) warm();
      const go = () => {
        if (!alive) return;
        to.currentTime = 0;
        setFront(to === F ? "f" : "r");
        active = to;
        play(to);
        // Rewind the one now hidden, ready for its next turn.
        setTimeout(() => { from.pause(); from.currentTime = 0; }, 250);
      };
      if (to.readyState >= 3) go();
      else to.addEventListener("canplay", go, { once: true });
    };
    const onEndF = () => handOver(F);
    const onEndR = () => handOver(R);
    const onPlaying = (e) => { if (alive && e.target === active) setFront(active === F ? "f" : "r"); };

    const start = () => { if (active.paused && !active.ended) play(active); };
    // A background tab may not start a film until it is shown.
    const onVis = () => { if (document.visibilityState === "visible") start(); };

    F.addEventListener("ended", onEndF);
    R.addEventListener("ended", onEndR);
    F.addEventListener("playing", onPlaying);
    R.addEventListener("playing", onPlaying);
    F.addEventListener("canplay", start);
    F.addEventListener("canplaythrough", warm);
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      alive = false;
      F.removeEventListener("ended", onEndF);
      R.removeEventListener("ended", onEndR);
      F.removeEventListener("playing", onPlaying);
      R.removeEventListener("playing", onPlaying);
      F.removeEventListener("canplay", start);
      F.removeEventListener("canplaythrough", warm);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const film = (ref, id, src) => (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden="true"
      tabIndex={-1}
      className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
        front === id ? "z-[1] opacity-100" : front ? "z-0 opacity-100" : "z-0 opacity-0"}`}
    />
  );

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={STILL} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
      {!still && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {film(fwd, "f", FWD)}
          {film(rev, "r", undefined)}
        </div>
      )}
      {/* A light veil so the card reads, without washing the film out. */}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${veil}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_45%,rgba(45,38,28,0.22)_100%)]" />
    </>
  );
}
