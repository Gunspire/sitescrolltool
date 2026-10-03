import {
  Archivo_Black,
  Bebas_Neue,
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Fraunces,
  IBM_Plex_Sans,
  Inter,
  Lora,
  Playfair_Display,
  Source_Sans_3,
  Work_Sans,
} from "next/font/google";
import type { CustomFont } from "./types";

export type FontOption = {
  /** Stable key used in state / JSON exports. */
  value: string;
  label: string;
  className: string;
  /** Weight steps available for the specimen ladder. */
  weights: number[];
  /** Whether an italic cut exists. */
  italic: boolean;
};

/* Font loaders must be called with explicitly written literal options at
   module scope (a Turbopack requirement) — hence the repeated literals.
   Variable fonts are loaded without `weight` to get their full axis. */
const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"] });
const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"] });
const dmSerifDisplay = DM_Serif_Display({ subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], style: ["normal", "italic"] });
const archivoBlack = Archivo_Black({ subsets: ["latin"], weight: "400" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400" });

const inter = Inter({ subsets: ["latin"], style: ["normal", "italic"] });
const dmSans = DM_Sans({ subsets: ["latin"], style: ["normal", "italic"] });
const workSans = Work_Sans({ subsets: ["latin"], style: ["normal", "italic"] });
const sourceSans = Source_Sans_3({ subsets: ["latin"], style: ["normal", "italic"] });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const lora = Lora({ subsets: ["latin"], style: ["normal", "italic"] });

export const DISPLAY_FONTS: FontOption[] = [
  { value: "playfair", label: "Playfair Display", className: playfair.className, weights: [400, 500, 600, 700, 800, 900], italic: true },
  { value: "fraunces", label: "Fraunces", className: fraunces.className, weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: true },
  { value: "dm-serif-display", label: "DM Serif Display", className: dmSerifDisplay.className, weights: [400], italic: true },
  { value: "cormorant", label: "Cormorant Garamond", className: cormorant.className, weights: [300, 400, 500, 600, 700], italic: true },
  { value: "archivo-black", label: "Archivo Black", className: archivoBlack.className, weights: [400], italic: false },
  { value: "bebas", label: "Bebas Neue", className: bebas.className, weights: [400], italic: false },
];

export const BODY_FONTS: FontOption[] = [
  { value: "inter", label: "Inter", className: inter.className, weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: true },
  { value: "dm-sans", label: "DM Sans", className: dmSans.className, weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: true },
  { value: "work-sans", label: "Work Sans", className: workSans.className, weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: true },
  { value: "source-sans-3", label: "Source Sans 3", className: sourceSans.className, weights: [200, 300, 400, 500, 600, 700, 800, 900], italic: true },
  { value: "plex-sans", label: "IBM Plex Sans", className: plexSans.className, weights: [400, 500, 600, 700], italic: true },
  { value: "lora", label: "Lora", className: lora.className, weights: [400, 500, 600, 700], italic: true },
];

export const FONT_BY_VALUE = new Map<string, FontOption>(
  [...DISPLAY_FONTS, ...BODY_FONTS].map((f) => [f.value, f] as const),
);

export type ResolvedFont = {
  label: string;
  /** next/font class (built-ins). */
  className?: string;
  /** CSS font-family value (custom uploads). */
  family?: string;
  weights: number[];
  italic: boolean;
  custom: boolean;
};

const INTER_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const FALLBACK: ResolvedFont = {
  label: "Inter",
  className: inter.className,
  weights: INTER_WEIGHTS,
  italic: true,
  custom: false,
};

/** Resolve a stored font key ("playfair" or "custom:<id>") for rendering. */
export function resolveFont(key: string, customFonts: CustomFont[]): ResolvedFont {
  if (key.startsWith("custom:")) {
    const cf = customFonts.find((f) => `custom:${f.id}` === key);
    if (!cf) return FALLBACK;
    const ws = new Set<number>();
    let italic = false;
    for (const v of cf.variants) {
      const parts = v.weight
        .split(/[\s-]+/)
        .map(Number)
        .filter(Number.isFinite);
      if (parts.length === 2) {
        const start = Math.max(100, Math.round(parts[0] / 100) * 100);
        for (let w = start; w <= parts[1]; w += 100) ws.add(w);
      } else if (parts.length === 1) {
        ws.add(parts[0]);
      }
      if (v.style === "italic") italic = true;
    }
    return {
      label: `${cf.family} (custom)`,
      family: `cf-${cf.id}`,
      weights: ws.size ? [...ws].sort((a, b) => a - b) : [400],
      italic,
      custom: true,
    };
  }
  const f = FONT_BY_VALUE.get(key);
  return f
    ? { label: f.label, className: f.className, weights: f.weights, italic: f.italic, custom: false }
    : FALLBACK;
}

/** Options for a font <select>: the built-in list plus all custom fonts. */
export function fontSelectOptions(
  builtins: FontOption[],
  customFonts: CustomFont[],
): { value: string; label: string }[] {
  return [
    ...builtins.map((f) => ({ value: f.value, label: f.label })),
    ...customFonts.map((cf) => ({ value: `custom:${cf.id}`, label: `${cf.family} (custom)` })),
  ];
}
