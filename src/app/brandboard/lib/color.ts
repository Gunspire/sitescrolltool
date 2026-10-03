const HEX6 = /^#[0-9a-f]{6}$/i;

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb | null {
  if (!HEX6.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function channelToHex(v: number): string {
  return Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, "0");
}

/** WCAG relative luminance, 0–1. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const lin = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export type WcagGrade = "AAA" | "AA" | "AA Large" | "Fail";

export function wcagGrade(ratio: number): WcagGrade {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

/** Light enough for dark text/labels on top? */
export function isLight(hex: string): boolean {
  return luminance(hex) > 0.5;
}

/** Mix `hex` toward `target` by `amount` (0–1). */
export function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  if (!a || !b) return hex;
  return `#${channelToHex(a.r + (b.r - a.r) * amount)}${channelToHex(
    a.g + (b.g - a.g) * amount,
  )}${channelToHex(a.b + (b.b - a.b) * amount)}`;
}

/** Five-step tint/shade ramp: two tints, the base colour, two shades. */
export function ramp(hex: string): string[] {
  return [
    mix(hex, "#ffffff", 0.7),
    mix(hex, "#ffffff", 0.35),
    hex,
    mix(hex, "#000000", 0.35),
    mix(hex, "#000000", 0.7),
  ];
}
