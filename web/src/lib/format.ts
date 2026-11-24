const MINUS = "−";

export function num(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "–";
  const s = v.toFixed(digits);
  // A tiny negative rounds to "-0.00"; show it as zero.
  return Number(s) === 0 ? s.replace("-", "") : s.replace("-", MINUS);
}

export function signed(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "–";
  const s = Math.abs(v).toFixed(digits);
  // Values that round to zero print without a sign.
  if (Number(s) === 0) return s;
  return v > 0 ? `+${s}` : `${MINUS}${s}`;
}

export function pctText(v: number | null | undefined, digits = 1): string {
  return v == null ? "–" : `${(v * 100).toFixed(digits)}%`;
}

export function height(inches: number | null | undefined): string {
  if (!inches) return "–";
  return `${Math.floor(inches / 12)}′${Math.round(inches % 12)}″`;
}

export function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(2)}`;
}

const CLASS_NAMES: Record<string, string> = { Fr: "Freshman", So: "Sophomore", Jr: "Junior", Sr: "Senior", Gr: "Graduate" };
export const className = (exp: string | null) => (exp ? CLASS_NAMES[exp] ?? exp : "–");

export function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

// Bins use the same rounded, clamped (1-99) value the page prints, so color and number never disagree.
export function pctShown(p: number | null | undefined): number | null {
  return p == null ? null : Math.min(99, Math.max(1, Math.round(p)));
}
