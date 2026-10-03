export type ColorRole = "background" | "secondary" | "accent" | "text" | "none";

export type Swatch = { id: string; name: string; hex: string; role: ColorRole; share: number };

export type Asset = { id: string; src: string; caption: string };

export type FontVariant = {
  id: string;
  /** Data URL of the uploaded font file. */
  src: string;
  /** Single weight ("400") or a variable range ("100 900"). */
  weight: string;
  style: "normal" | "italic";
};

export type CustomFont = { id: string; family: string; variants: FontVariant[] };

export type SectionKey = "moodboard" | "colors" | "hierarchy" | "type" | "logo";

export type SectionConfig = { key: SectionKey; visible: boolean };

export type BrandState = {
  name: string;
  tagline: string;
  toneWords: string[];
  /** Data URL of the uploaded logo file — kept entirely client-side. */
  logo: string | null;
  colors: Swatch[];
  /** Built-in value ("playfair") or "custom:<fontId>". */
  displayFont: string;
  bodyFont: string;
  /** Editable specimen text — falls back to the company name. */
  specimen: string;
  customFonts: CustomFont[];
  assets: Asset[];
  /** Board sections in display order, with visibility. */
  sections: SectionConfig[];
};

export type Board = { id: string; name: string; data: BrandState };
export type Store = { boards: Board[]; activeId: string };

export const STORAGE_KEY = "brandboard.v2";
export const LEGACY_KEY = "brandboard.v1";

export const SECTION_LABELS: Record<SectionKey, string> = {
  moodboard: "Moodboard",
  colors: "Colour",
  hierarchy: "Hierarchy (60/30/10)",
  type: "Typography",
  logo: "Logo",
};

export const DEFAULT_SECTIONS: SectionConfig[] = [
  { key: "moodboard", visible: true },
  { key: "colors", visible: true },
  { key: "hierarchy", visible: true },
  { key: "type", visible: true },
  { key: "logo", visible: true },
];

export const DEFAULT_STATE: BrandState = {
  name: "Acme Co.",
  tagline: "A one-line summary of the company.",
  toneWords: [],
  logo: null,
  colors: [
    { id: "ink", name: "Ink", hex: "#14161a", role: "text", share: 5 },
    { id: "paper", name: "Paper", hex: "#fafaf8", role: "background", share: 60 },
    { id: "surface", name: "Surface", hex: "#ececea", role: "secondary", share: 30 },
    { id: "accent", name: "Accent", hex: "#2f6df6", role: "accent", share: 10 },
  ],
  displayFont: "playfair",
  bodyFont: "inter",
  specimen: "",
  customFonts: [],
  assets: [],
  sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
};

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
