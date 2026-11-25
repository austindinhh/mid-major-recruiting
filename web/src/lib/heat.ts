import { pctShown } from "./format";

// Percentile heat: one continuous scale from the 1st to the 99th percentile. The 50th is the page
// background, blue deepens toward the top (better), orange toward the bottom (worse). Colors are
// mixed in OKLab so the ramp looks even, and each cell picks whichever text color reads better on it.
// Each theme has its own ends: the light theme pairs mid-tone ends with navy text; the dark theme
// uses deeper ends so white text stays at 4.5:1 or better at every percentile.
const THEMES = {
  light: { base: "#FFFFFF", hi: "#6694DB", lo: "#EA7429" },
  dark: { base: "#0E1A2D", hi: "#3A66AD", lo: "#B8561C" },
};
const TEXT = { navy: "#13294B", white: "#FFFFFF" };
const NEUTRAL_BAND = 4; // within this many points of the 50th, leave the cell unshaded

type Rgb = [number, number, number];
const hexToRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.map((c) => Math.min(1, Math.max(0, fromLinear(c)))) as Rgb;
}

const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const css = (rgb: Rgb) => `rgb(${rgb.map((c) => Math.round(c * 255)).join(" ")})`;

/** Background for a percentile (1-99) on the given theme. */
export function heatColor(p: number, dark: boolean): Rgb {
  const theme = dark ? THEMES.dark : THEMES.light;
  const base = toOklab(hexToRgb(theme.base));
  const end = toOklab(hexToRgb(p >= 50 ? theme.hi : theme.lo));
  const t = Math.min(1, Math.abs(p - 50) / 49);
  return fromOklab(base.map((v, i) => v + (end[i] - v) * t) as Rgb);
}

export function heatStyle(raw: number | null | undefined, dark: boolean): { background: string; color: string } | undefined {
  const p = pctShown(raw);
  if (p == null || Math.abs(p - 50) < NEUTRAL_BAND) return undefined;
  const bg = heatColor(p, dark);
  const navy = hexToRgb(TEXT.navy), white = hexToRgb(TEXT.white);
  return { background: css(bg), color: contrast(navy, bg) >= contrast(white, bg) ? TEXT.navy : TEXT.white };
}

/** CSS gradient for the key, sampled from the same scale the cells use. */
export function heatGradient(dark: boolean): string {
  const stops = Array.from({ length: 21 }, (_, i) => {
    const pos = i * 5;
    return `${css(heatColor(Math.max(1, Math.min(99, pos)), dark))} ${pos}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
