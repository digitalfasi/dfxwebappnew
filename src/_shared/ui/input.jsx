import { cn } from "@/_shared/utils";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-faint",
        "transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] focus:outline-none",
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
export function MoneyInput({ value, onValueChange, className, maxDigits = 12, ...props }) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, maxDigits);
  const display = digits ? Number(digits).toLocaleString("en-IN") : "";
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">₹</span>
      <Input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={(e) => onValueChange?.(String(e.target.value).replace(/\D/g, "").slice(0, maxDigits))}
        onPaste={(e) => {
          e.preventDefault();
          onValueChange?.(String(e.clipboardData.getData("text")).replace(/\D/g, "").slice(0, maxDigits));
        }}
        className={cn("num pl-8", className)}
        {...props}
      />
    </div>
  );
}
