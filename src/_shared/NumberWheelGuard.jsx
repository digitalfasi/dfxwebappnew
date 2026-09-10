"use client";

import { useEffect } from "react";

/**
 * Stops the mouse wheel from changing the value of a focused number input.
 *
 * Browsers treat a scroll over a focused <input type="number"> as increment/
 * decrement. While filling a long billing form the page scrolls under the
 * cursor and silently rewrites a rate, a weight or a discount — a money bug
 * the user cannot see happening. The CSS in globals.css removes the spinner
 * arrows; this removes the wheel gesture, which CSS cannot reach.
 *
 * Mounted once at the app root, so it covers every module without each screen
 * having to remember an onWheel handler.
 *
 * Registered non-passive because preventDefault() on a wheel event is ignored
 * in a passive listener. Keyboard arrow keys are deliberately left working:
 * they are a deliberate keystroke, not an accident, and they are how keyboard
 * and assistive-tech users adjust a value.
 */
export default function NumberWheelGuard() {
  useEffect(() => {
    const onWheel = (event) => {
      const el = document.activeElement;
      if (!el || el.type !== "number") return;
      // Only when the pointer is actually over the focused field: scrolling
      // elsewhere on the page must still scroll the page.
      if (el !== event.target && !el.contains(event.target)) return;
      event.preventDefault();
    };
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
