import { useLayoutEffect, useRef } from "react";

import { cn } from "@/_shared/utils";

/** `error` is truthy when the value is invalid: it paints the danger border and
 *  marks the field aria-invalid, so the visual state and the state a screen
 *  reader announces can never disagree. It is consumed here and never spread
 *  onto the DOM node. */
export function Input({ className, error, inputRef, ref, ...props }) {
  return (
    <input
      ref={ref ?? inputRef}
      aria-invalid={error ? true : undefined}
      className={cn(
        "h-10 w-full rounded-xl border bg-surface px-3.5 text-sm text-ink placeholder:text-faint",
        "transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "focus:outline-none",
        error
          ? "border-danger focus:border-danger focus:shadow-[0_0_0_3px_var(--color-danger-line)]"
          : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]",
        className
      )}
      {...props}
    />
  );
}

export function SearchInput({ className, icon = true, ...props }) {
  return (
    <div className={cn("relative", className)}>
      {icon && (
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      )}
      <Input className={icon ? "pl-10" : undefined} {...props} />
    </div>
  );
}

/**
 * A digits-only text input with a hard length cap.
 *
 * Used wherever a business rule limits a number's DIGITS rather than its
 * value — Tunch (1 digit), a percentage (2 digits), a phone's local part (10).
 * It is a text input on purpose: `type="number"` cannot be capped by length,
 * accepts `e`/`+`/`-`, and lets a paste through unchecked. `onValueChange`
 * receives the sanitised digit string, so the caller's state never holds
 * anything it would have to clean up later.
 *
 * Empty stays empty (never coerced to "0"), so a field can be left blank.
 */
export function DigitsInput({ value, onValueChange, maxDigits = 2, allowDecimal = false, className, ...props }) {
  const sanitize = (raw) => {
    if (allowDecimal) {
      // One dot, digits either side, integer part capped at maxDigits.
      const cleaned = String(raw).replace(/[^\d.]/g, "");
      const [int = "", ...rest] = cleaned.split(".");
      const head = int.slice(0, maxDigits);
      return rest.length ? `${head}.${rest.join("").replace(/\./g, "").slice(0, 3)}` : head;
    }
    return String(raw).replace(/\D/g, "").slice(0, maxDigits);
  };
  return (
    <Input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={value ?? ""}
      onChange={(e) => onValueChange?.(sanitize(e.target.value))}
      onPaste={(e) => {
        // Handled here as well as in onChange so a paste of "12abc99" cannot
        // land in state for even one render.
        e.preventDefault();
        onValueChange?.(sanitize(`${value ?? ""}${e.clipboardData.getData("text")}`));
      }}
      className={cn("num", className)}
      {...props}
    />
  );
}

/**
 * A rupee amount that READS in Indian grouping while the caller keeps the raw
 * number.
 *
 * `value` is the unformatted string the form owns ("1000000"); what the user
 * sees is "10,00,000". `onValueChange` always receives digits only, so nothing
 * downstream has to strip separators before sending it to the API — the class
 * of bug where a formatted string reaches a numeric column.
 */
export function MoneyInput({ value, onValueChange, className, maxDigits = 12, allowDecimal = false, symbolClassName, ...props }) {
  // `allowDecimal` keeps one dot and up to two paise digits. The decimal tail is
  // carried through exactly as typed - grouping only ever touches the rupees -
  // so a half-typed "1250." survives the render and the caret does not jump.
  const sanitize = (raw) => {
    const str = String(raw ?? "");
    if (!allowDecimal) return str.replace(/\D/g, "").slice(0, maxDigits);
    const cleaned = str.replace(/[^\d.]/g, "");
    const [int = "", ...rest] = cleaned.split(".");
    const head = int.slice(0, maxDigits);
    return rest.length ? `${head}.${rest.join("").replace(/\./g, "").slice(0, 2)}` : head;
  };
  const raw = sanitize(value);
  const [rupees, paise] = raw.split(".");
  const grouped = rupees ? Number(rupees).toLocaleString("en-IN") : "";
  const display = paise !== undefined ? `${grouped}.${paise}` : grouped;

  // Re-formatting the value on every keystroke moves the text, and a controlled
  // input then leaves the caret after the last character - which made editing
  // the middle of an amount impossible, because each digit typed jumped to the
  // end. The caret is remembered as "how many digits were to its left" so that
  // separators appearing or disappearing cannot shift it, and put back after
  // the browser paints the new string.
  const inputRef = useRef(null);
  const digitsBeforeCaret = useRef(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    const want = digitsBeforeCaret.current;
    digitsBeforeCaret.current = null;
    if (!el || want == null || document.activeElement !== el) return;
    let pos = 0;
    let seen = 0;
    while (pos < el.value.length && seen < want) {
      if (/[\d.]/.test(el.value[pos])) seen += 1;
      pos += 1;
    }
    // Skip a separator sitting immediately left of the caret, so backspacing
    // over "1,2|34" does not park the cursor between the comma and the digit.
    while (pos < el.value.length && /[^\d.]/.test(el.value[pos])) pos += 1;
    try { el.setSelectionRange(pos, pos); } catch { /* not a text input */ }
  }, [display]);

  const countDigits = (text) => String(text).replace(/[^\d.]/g, "").length;

  return (
    <div className="relative">
      <span className={cn("pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted", symbolClassName)}>₹</span>
      <Input
        ref={inputRef}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={display}
        onChange={(e) => {
          const caret = e.target.selectionStart ?? e.target.value.length;
          digitsBeforeCaret.current = countDigits(e.target.value.slice(0, caret));
          onValueChange?.(sanitize(e.target.value));
        }}
        onPaste={(e) => {
          e.preventDefault();
          const next = sanitize(e.clipboardData.getData("text"));
          digitsBeforeCaret.current = countDigits(next);
          onValueChange?.(next);
        }}
        className={cn("num pl-8", className)}
        {...props}
      />
    </div>
  );
}

/**
 * The store-wide mobile number field: a fixed +91 prefix, ten digits, nothing
 * else. The prefix is displayed and never typed, so it cannot be deleted,
 * duplicated or pasted over, and `onValueChange` always receives the ten local
 * digits alone — the shape every phone column in the product stores.
 *
 * Letters, symbols and an eleventh digit are dropped on keystroke AND on paste,
 * so an invalid value never reaches state for even one render. `error` paints
 * the standard danger treatment on the whole control, prefix included, because
 * a partially-red input reads as a rendering fault rather than a validation
 * message.
 */
export function PhoneInput({ value, onValueChange, error, className, id, ...props }) {
  const clean = (raw) => String(raw).replace(/\D/g, "").slice(0, 10);
  return (
    <div
      className={cn(
        "flex h-10 items-stretch overflow-hidden rounded-xl border bg-surface transition",
        error
          ? "border-danger"
          : "border-line focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]",
        className,
      )}
    >
      <span
        className="num grid w-12 shrink-0 place-items-center border-r border-line-soft bg-canvas/60 text-sm font-bold text-muted"
        aria-hidden="true"
      >
        +91
      </span>
      <input
        id={id}
        value={value ?? ""}
        onChange={(e) => onValueChange?.(clean(e.target.value))}
        onPaste={(e) => {
          e.preventDefault();
          onValueChange?.(clean(`${value ?? ""}${e.clipboardData.getData("text")}`));
        }}
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        aria-label="10-digit mobile number, country code +91"
        aria-invalid={error ? true : undefined}
        placeholder="98765 43210"
        className="num min-w-0 flex-1 bg-transparent px-3.5 text-sm tracking-[0.02em] outline-none"
        {...props}
      />
    </div>
  );
}
