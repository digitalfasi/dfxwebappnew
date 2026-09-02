import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  const g = gsap?.default || gsap;
  const st = ScrollTrigger?.default || ScrollTrigger;
  if (g?.registerPlugin && st) {
    try { g.registerPlugin(st); } catch {}
  }
}
const _gsap = gsap?.default || gsap;

/**
 * GSAP entrance choreography — Corporate personality:
 * cubic-bezier(0.2,0,0,1) family, ease-out entrances, stagger < 400ms,
 * ScrollTrigger reveals below the fold. Collapses under reduced motion.
 */
export function usePageMotion(scopeRef, deps = []) {
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = _gsap.context(() => {
      _gsap.from("[data-motion='page-head']", {
        y: 16, autoAlpha: 0, duration: 0.5, ease: "power3.out",
      });
      _gsap.from("[data-motion='stat']", {
        y: 20, autoAlpha: 0, duration: 0.5, ease: "power3.out",
        stagger: 0.07, delay: 0.1, clearProps: "transform",
      });
      _gsap.from("[data-motion='toolbar']", {
        y: 10, autoAlpha: 0, duration: 0.4, ease: "power2.out", delay: 0.2,
      });
      _gsap.from("[data-motion='count']", {
        textContent: 0,
        duration: 1.1,
        ease: "power2.out",
        snap: { textContent: 1 },
        delay: 0.3,
      });
      _gsap.from("[data-motion='reveal']", {
        scrollTrigger: { trigger: scope, start: "top 70%", once: true },
      });
      _gsap.utils.toArray("[data-motion='draw']").forEach((path) => {
        const len = path.getTotalLength?.() ?? 0;
        if (!len) return;
        _gsap.fromTo(path,
          { strokeDasharray: len, strokeDashoffset: len },
          {
            strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut", delay: 0.4,
            scrollTrigger: { trigger: path, start: "top 92%", once: true },
          }
        );
      });
      _gsap.utils.toArray("[data-motion='sweep']").forEach((circle) => {
        const r = circle.r.baseVal.value;
        const c = 2 * Math.PI * r;
        const frac = parseFloat(circle.getAttribute("data-motion-fraction") || "0.5");
        _gsap.fromTo(circle,
          { strokeDasharray: c, strokeDashoffset: c },
          {
            strokeDashoffset: c * (1 - frac), duration: 1.3, ease: "power2.inOut", delay: 0.5,
            scrollTrigger: { trigger: circle, start: "top 92%", once: true },
          }
        );
      });
    }, scope);

    return () => ctx.revert();
  }, deps);
}

/** Press feedback on pointer-down (Apple fluid interfaces) */
export function usePressFeedback(scopeRef) {
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = scope.querySelectorAll("button");
    const downs = [], ups = [];
    els.forEach((el) => {
      const down = () => _gsap.to(el, { scale: 0.96, duration: 0.1, ease: "power2.out", overwrite: "auto" });
      const up = () => _gsap.to(el, { scale: 1, duration: 0.25, ease: "power2.out", overwrite: "auto" });
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointerleave", up);
      downs.push([el, down]); ups.push([el, up]);
    });
    return () => {
      downs.forEach(([el, fn]) => el.removeEventListener("pointerdown", fn));
      ups.forEach(([el, fn]) => { el.removeEventListener("pointerup", fn); el.removeEventListener("pointerleave", fn); });
    };
  }, []);
}
