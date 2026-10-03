"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  Maximize2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import BrandBoard from "./board";
import { BODY_FONTS, DISPLAY_FONTS, FONT_BY_VALUE, fontSelectOptions } from "./fonts";
import {
  DEFAULT_SECTIONS,
  DEFAULT_STATE,
  LEGACY_KEY,
  SECTION_LABELS,
  STORAGE_KEY,
  uid,
  type Asset,
  type Board,
  type BrandState,
  type ColorRole,
  type CustomFont,
  type FontVariant,
  type SectionKey,
  type Store,
  type Swatch,
} from "./types";

/* --------------------------------------------------------------- */
/* Limits & helpers                                                 */
/* --------------------------------------------------------------- */

const HEX_RE = /^#[0-9a-f]{6}$/i;
const VALID_WEIGHT = /^([1-9]00)( [1-9]00)?$/;
const MAX_COLORS = 10;
const MAX_ASSETS = 12;
const MAX_CUSTOM_FONTS = 8;
const MAX_FONT_VARIANTS = 6;
const MAX_BOARDS = 20;

const WEIGHT_OPTIONS = ["100", "200", "300", "400", "500", "600", "700", "800", "900", "100 900"];
const ROLES: ColorRole[] = ["background", "secondary", "accent", "text", "none"];

const uid2 = uid;
const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

function normalizeHex(raw: string): string {
  let v = raw.trim();
  if (!v) return v;
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return HEX_RE.test(v) ? v.toLowerCase() : v;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function slugify(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "brandboard";
}

/** Best-effort role assignment when importing pre-v2 data. */
function legacyRole(id: string): ColorRole {
  if (/paper|bg|background/i.test(id)) return "background";
  if (/ink|text/i.test(id)) return "text";
  if (/accent/i.test(id)) return "accent";
  return "none";
}

/** Default palette-split part derived from a colour's role. */
function defaultShare(role: ColorRole): number {
  switch (role) {
    case "background":
      return 60;
    case "secondary":
      return 30;
    case "accent":
      return 10;
    case "text":
      return 5;
    default:
      return 10;
  }
}

/** Accept anything (localStorage or an imported JSON file) and return a safe BrandState. */
function sanitizeBrand(input: unknown): BrandState {
  const raw: Record<string, unknown> =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};

  const colors: Swatch[] = Array.isArray(raw.colors)
    ? (raw.colors as unknown[])
        .filter(
          (c): c is Record<string, unknown> =>
            typeof c === "object" && c !== null && typeof (c as Record<string, unknown>).hex === "string",
        )
        .slice(0, MAX_COLORS)
        .map((c, i) => {
          const role =
            typeof c.role === "string" && ROLES.includes(c.role as ColorRole)
              ? (c.role as ColorRole)
              : legacyRole(typeof c.id === "string" ? c.id : "");
          return {
            id: typeof c.id === "string" ? c.id : `c-${i}`,
            name: typeof c.name === "string" ? c.name : "",
            hex: String(c.hex),
            role,
            share: typeof c.share === "number" ? clamp(c.share) : defaultShare(role),
          };
        })
    : DEFAULT_STATE.colors.map((c) => ({ ...c }));

  const assets: Asset[] = Array.isArray(raw.assets)
    ? (raw.assets as unknown[])
        .filter(
          (a): a is Record<string, unknown> =>
            typeof a === "object" && a !== null && typeof (a as Record<string, unknown>).src === "string",
        )
        .slice(0, MAX_ASSETS)
        .map((a, i) => ({
          id: typeof a.id === "string" ? a.id : `a-${i}`,
          src: String(a.src),
          caption: typeof a.caption === "string" ? a.caption : "",
        }))
    : [];

  const customFonts: CustomFont[] = Array.isArray(raw.customFonts)
    ? (raw.customFonts as unknown[])
        .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
        .slice(0, MAX_CUSTOM_FONTS)
        .map((f, i) => ({
          id: typeof f.id === "string" ? f.id : `f-${i}`,
          family:
            typeof f.family === "string" && f.family.trim() ? f.family.trim() : "Custom font",
          variants: Array.isArray(f.variants)
            ? (f.variants as unknown[])
                .filter(
                  (v): v is Record<string, unknown> =>
                    typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).src === "string",
                )
                .slice(0, MAX_FONT_VARIANTS)
                .map((v, j) => ({
                  id: typeof v.id === "string" ? v.id : `v-${i}-${j}`,
                  src: String(v.src),
                  weight:
                    typeof v.weight === "string" && VALID_WEIGHT.test(v.weight) ? v.weight : "400",
                  style: v.style === "italic" ? ("italic" as const) : ("normal" as const),
                }))
            : [],
        }))
    : [];

  const sections: BrandState["sections"] = (() => {
    const known = new Set<SectionKey>(["moodboard", "colors", "hierarchy", "type", "logo"]);
    const fromRaw = Array.isArray(raw.sections)
      ? (raw.sections as unknown[])
          .map((s) => (typeof s === "object" && s !== null ? (s as Record<string, unknown>) : {}))
          .filter((s) => typeof s.key === "string" && known.has(s.key as SectionKey))
          .map((s) => ({ key: s.key as SectionKey, visible: s.visible !== false }))
      : [];
    const seen = new Set(fromRaw.map((s) => s.key));
    const missing = DEFAULT_SECTIONS.filter((d) => !seen.has(d.key)).map((m) => ({ ...m }));
    const all = [...fromRaw, ...missing];
    return all.length ? all : DEFAULT_SECTIONS.map((s) => ({ ...s }));
  })();

  const toneWords = Array.isArray(raw.toneWords)
    ? (raw.toneWords as unknown[])
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim())
        .slice(0, 8)
    : [];

  const fontKeyOk = (v: unknown) =>
    typeof v === "string" && (FONT_BY_VALUE.has(v) || v.startsWith("custom:"));

  return {
    name: typeof raw.name === "string" ? raw.name : "",
    tagline: typeof raw.tagline === "string" ? raw.tagline : "",
    toneWords,
    logo: typeof raw.logo === "string" ? raw.logo : null,
    colors,
    displayFont: fontKeyOk(raw.displayFont) ? (raw.displayFont as string) : DEFAULT_STATE.displayFont,
    bodyFont: fontKeyOk(raw.bodyFont) ? (raw.bodyFont as string) : DEFAULT_STATE.bodyFont,
    specimen: typeof raw.specimen === "string" ? raw.specimen : "",
    customFonts,
    assets,
    sections,
  };
}

function defaultStore(): Store {
  return {
    boards: [{ id: "b-main", name: "Untitled board", data: structuredClone(DEFAULT_STATE) }],
    activeId: "b-main",
  };
}

function sanitizeStore(input: unknown): Store {
  const raw: Record<string, unknown> =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const boards: Board[] = Array.isArray(raw.boards)
    ? (raw.boards as unknown[])
        .slice(0, MAX_BOARDS)
        .map((b, i) => {
          const rec = typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
          const data = sanitizeBrand(rec.data);
          return {
            id: typeof rec.id === "string" ? rec.id : `b-${i}`,
            name:
              typeof rec.name === "string" && rec.name.trim()
                ? rec.name.trim()
                : data.name.trim() || "Untitled board",
            data,
          };
        })
    : [];
  if (!boards.length) return defaultStore();
  const activeId =
    typeof raw.activeId === "string" && boards.some((b) => b.id === raw.activeId)
      ? raw.activeId
      : boards[0].id;
  return { boards, activeId };
}

/* Shared editor styling. */
const field =
  "h-9 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500";
const label = "text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500";
const ghostBtn =
  "rounded-md border border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100";
const iconBtn =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30";
const selectSm =
  "h-8 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-300 outline-none transition-colors focus:border-emerald-500";
const dashBtn =
  "w-full rounded-md border border-dashed border-zinc-700 py-2 text-xs text-zinc-500 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40";

/* --------------------------------------------------------------- */
/* Page                                                             */
/* --------------------------------------------------------------- */

export default function BrandboardPage() {
  const [store, setStore] = useState<Store>(defaultStore);
  const [clean, setClean] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const assetsInputRef = useRef<HTMLInputElement | null>(null);
  const fontFileInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFamilyRef = useRef<string | null>(null);

  const board = store.boards.find((b) => b.id === store.activeId) ?? store.boards[0];
  const state = board.data;

  const setState = (updater: (s: BrandState) => BrandState) =>
    setStore((st) => ({
      ...st,
      boards: st.boards.map((b) => (b.id === st.activeId ? { ...b, data: updater(b.data) } : b)),
    }));

  const patch = (p: Partial<BrandState>) => setState((s) => ({ ...s, ...p }));

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  };

  /* Restore the library (migrating the pre-v2 single board)… */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setStore(sanitizeStore(JSON.parse(raw)));
        return;
      }
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const data = sanitizeBrand(JSON.parse(legacy));
        const migrated: Board = { id: uid2(), name: data.name.trim() || "Imported board", data };
        setStore({ boards: [migrated], activeId: migrated.id });
      }
    } catch {
      /* corrupt storage — keep defaults */
    }
  }, []);

  /* …and persist every change locally (debounced). No server, no database. */
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        setStorageWarning(false);
      } catch {
        setStorageWarning(true);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [store]);

  /* Esc leaves clean view. */
  useEffect(() => {
    if (!clean) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClean(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clean]);

  /* ------------------------ board library ----------------------- */

  const newBoard = () => {
    const b: Board = {
      id: uid2(),
      name: `Board ${store.boards.length + 1}`,
      data: structuredClone(DEFAULT_STATE),
    };
    setStore((st) => ({ boards: [...st.boards, b].slice(-MAX_BOARDS), activeId: b.id }));
  };

  const duplicateBoard = () => {
    const b: Board = { id: uid2(), name: `${board.name} copy`, data: structuredClone(board.data) };
    setStore((st) => ({ boards: [...st.boards, b].slice(-MAX_BOARDS), activeId: b.id }));
  };

  const renameBoard = () => {
    const name = window.prompt("Board name", board.name);
    if (!name || !name.trim()) return;
    setStore((st) => ({
      ...st,
      boards: st.boards.map((b) => (b.id === board.id ? { ...b, name: name.trim() } : b)),
    }));
  };

  const deleteBoard = () => {
    if (store.boards.length < 2) {
      flash("Keep at least one board.");
      return;
    }
    if (!window.confirm(`Delete "${board.name}"? This cannot be undone.`)) return;
    setStore((st) => {
      const boards = st.boards.filter((b) => b.id !== st.activeId);
      return { boards, activeId: boards[0].id };
    });
  };

  /* -------------------------- colours --------------------------- */

  const updateColor = (id: string, p: Partial<Swatch>) =>
    setState((s) => ({
      ...s,
      colors: s.colors.map((c) => (c.id === id ? { ...c, ...p } : c)),
    }));

  const addColor = () =>
    setState((s) =>
      s.colors.length >= MAX_COLORS
        ? s
        : {
            ...s,
            colors: [...s.colors, { id: uid2(), name: "", hex: "#8b8b8b", role: "none", share: 10 }],
          },
    );

  const removeColor = (id: string) =>
    setState((s) => ({ ...s, colors: s.colors.filter((c) => c.id !== id) }));

  /* -------------------------- moodboard ------------------------- */

  const updateAsset = (id: string, p: Partial<Asset>) =>
    setState((s) => ({
      ...s,
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...p } : a)),
    }));

  const moveAsset = (index: number, dir: -1 | 1) =>
    setState((s) => {
      const j = index + dir;
      if (j < 0 || j >= s.assets.length) return s;
      const assets = [...s.assets];
      [assets[index], assets[j]] = [assets[j], assets[index]];
      return { ...s, assets };
    });

  const removeAsset = (id: string) =>
    setState((s) => ({ ...s, assets: s.assets.filter((a) => a.id !== id) }));

  const onLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    patch({ logo: await readFile(file) });
  };

  const onAssetsChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = Math.max(MAX_ASSETS - state.assets.length, 0);
    const loaded: Asset[] = [];
    for (const file of files.slice(0, room)) {
      loaded.push({ id: uid2(), src: await readFile(file), caption: "" });
    }
    if (loaded.length) setState((s) => ({ ...s, assets: [...s.assets, ...loaded] }));
    if (files.length > room) flash(`Moodboard is capped at ${MAX_ASSETS} images.`);
  };

  /* ------------------------ custom fonts ------------------------ */

  const addCustomFont = () =>
    setState((s) =>
      s.customFonts.length >= MAX_CUSTOM_FONTS
        ? s
        : { ...s, customFonts: [...s.customFonts, { id: uid2(), family: "Custom font", variants: [] }] },
    );

  const updateCustomFont = (id: string, p: Partial<CustomFont>) =>
    setState((s) => ({
      ...s,
      customFonts: s.customFonts.map((f) => (f.id === id ? { ...f, ...p } : f)),
    }));

  const removeCustomFont = (id: string) => {
    const key = `custom:${id}`;
    setState((s) => ({
      ...s,
      customFonts: s.customFonts.filter((f) => f.id !== id),
      displayFont: s.displayFont === key ? DEFAULT_STATE.displayFont : s.displayFont,
      bodyFont: s.bodyFont === key ? DEFAULT_STATE.bodyFont : s.bodyFont,
    }));
  };

  const updateVariant = (fontId: string, variantId: string, p: Partial<FontVariant>) =>
    setState((s) => ({
      ...s,
      customFonts: s.customFonts.map((f) =>
        f.id === fontId
          ? { ...f, variants: f.variants.map((v) => (v.id === variantId ? { ...v, ...p } : v)) }
          : f,
      ),
    }));

  const removeVariant = (fontId: string, variantId: string) =>
    setState((s) => ({
      ...s,
      customFonts: s.customFonts.map((f) =>
        f.id === fontId ? { ...f, variants: f.variants.filter((v) => v.id !== variantId) } : f,
      ),
    }));

  const addVariants = async (e: ChangeEvent<HTMLInputElement>) => {
    const familyId = pendingFamilyRef.current;
    e.target.value = "";
    if (!familyId) return;
    const files = Array.from(e.target.files ?? []);
    const room = Math.max(MAX_FONT_VARIANTS - (state.customFonts.find((f) => f.id === familyId)?.variants.length ?? 0), 0);
    const loaded: FontVariant[] = [];
    for (const file of files.slice(0, room)) {
      loaded.push({ id: uid2(), src: await readFile(file), weight: "400", style: "normal" });
    }
    if (loaded.length) {
      setState((s) => ({
        ...s,
        customFonts: s.customFonts.map((f) =>
          f.id === familyId ? { ...f, variants: [...f.variants, ...loaded] } : f,
        ),
      }));
    }
    if (files.length > room) flash(`Fonts are capped at ${MAX_FONT_VARIANTS} files per family.`);
  };

  /* -------------------------- sections -------------------------- */

  const moveSection = (key: SectionKey, dir: -1 | 1) =>
    setState((s) => {
      const idx = s.sections.findIndex((x) => x.key === key);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= s.sections.length) return s;
      const sections = [...s.sections];
      [sections[idx], sections[j]] = [sections[j], sections[idx]];
      return { ...s, sections };
    });

  const toggleSection = (key: SectionKey) =>
    setState((s) => ({
      ...s,
      sections: s.sections.map((x) => (x.key === key ? { ...x, visible: !x.visible } : x)),
    }));

  /* ----------------------- import / export ---------------------- */

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(board.name || state.name)}.brandboard.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = sanitizeBrand(JSON.parse(await file.text()));
      const imported: Board = { id: uid2(), name: data.name.trim() || "Imported board", data };
      setStore((st) => ({ boards: [...st.boards, imported].slice(-MAX_BOARDS), activeId: imported.id }));
      flash("Board imported as a new board.");
    } catch {
      flash("That file isn't a valid brandboard export.");
    }
  };

  const clearAll = () => {
    if (window.confirm("Reset this board to defaults?")) {
      setState(() => structuredClone(DEFAULT_STATE));
    }
  };

  /* --------------------------- views ---------------------------- */

  if (clean) {
    return (
      <div className="min-h-dvh bg-white">
        <BrandBoard state={state} />
        {/* Only visible on hover — stays out of the recording. */}
        <button
          type="button"
          onClick={() => setClean(false)}
          className="fixed bottom-4 right-4 rounded-md border border-zinc-300 bg-white/90 px-3 py-1.5 text-xs text-zinc-400 opacity-0 shadow-sm transition-opacity hover:opacity-100 focus:opacity-100"
        >
          Exit clean view (Esc)
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 text-zinc-100 lg:h-dvh lg:flex-row">
      <aside className="flex w-full flex-col gap-7 overflow-y-auto border-b border-zinc-800 bg-zinc-950 p-5 lg:h-dvh lg:w-[340px] lg:shrink-0 lg:border-b-0 lg:border-r">
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">Brandboard</h1>
            <Link
              href="/"
              className="text-xs text-zinc-500 transition-colors hover:text-emerald-400"
            >
              ← Showcase
            </Link>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            A one-page brand board for any company. Fill it in, hit clean view, record.
          </p>
        </div>

        <section className="space-y-2">
          <h2 className={label}>Boards</h2>
          <select
            className={field}
            value={store.activeId}
            onChange={(e) => setStore((st) => ({ ...st, activeId: e.target.value }))}
            aria-label="Active board"
          >
            {store.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={newBoard}
              className={`${ghostBtn} flex items-center justify-center gap-1`}
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
            <button
              type="button"
              onClick={duplicateBoard}
              className={`${ghostBtn} flex items-center justify-center gap-1`}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button
              type="button"
              onClick={renameBoard}
              className={`${ghostBtn} flex items-center justify-center gap-1`}
            >
              <Pencil className="h-3.5 w-3.5" /> Rename
            </button>
            <button
              type="button"
              onClick={deleteBoard}
              className={`${ghostBtn} flex items-center justify-center gap-1 hover:border-red-900 hover:text-red-400`}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className={label}>Identity</h2>
          <input
            className={field}
            placeholder="Company name"
            value={state.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <input
            className={field}
            placeholder="Tagline — one line (optional)"
            value={state.tagline}
            onChange={(e) => patch({ tagline: e.target.value })}
          />
          <input
            className={field}
            placeholder="Tone words, comma-separated"
            value={state.toneWords.join(", ")}
            onChange={(e) =>
              patch({
                toneWords: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 8),
              })
            }
          />
        </section>

        <section className="space-y-3">
          <h2 className={label}>Logo</h2>
          {state.logo ? (
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-white p-1.5">
                <img src={state.logo} alt="Logo preview" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="text-left text-xs text-zinc-400 transition-colors hover:text-zinc-100"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => patch({ logo: null })}
                  className="text-left text-xs text-zinc-400 transition-colors hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-zinc-700 py-4 text-sm text-zinc-500 transition-colors hover:border-emerald-500 hover:text-emerald-400"
            >
              <Plus className="h-4 w-4" /> Upload logo (PNG / SVG / JPG)
            </button>
          )}
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
        </section>

        <section className="space-y-3">
          <h2 className={label}>Colour</h2>
          <div className="space-y-2">
            {state.colors.map((c) => (
              <div key={c.id} className="space-y-1.5 rounded-md border border-zinc-800 p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Colour picker"
                    value={HEX_RE.test(c.hex) ? c.hex : "#000000"}
                    onChange={(e) => updateColor(c.id, { hex: e.target.value })}
                    className="h-8 w-8 shrink-0 cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5"
                  />
                  <input
                    className="h-8 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500"
                    placeholder="Name"
                    value={c.name}
                    onChange={(e) => updateColor(c.id, { name: e.target.value })}
                  />
                  <input
                    className="h-8 w-[78px] shrink-0 rounded-md border border-zinc-800 bg-zinc-900 px-2 font-mono text-xs uppercase text-zinc-300 outline-none transition-colors focus:border-emerald-500"
                    value={c.hex}
                    onChange={(e) => updateColor(c.id, { hex: e.target.value })}
                    onBlur={(e) => updateColor(c.id, { hex: normalizeHex(e.target.value) })}
                  />
                  <button
                    type="button"
                    aria-label="Remove colour"
                    onClick={() => removeColor(c.id)}
                    className="shrink-0 p-1 text-zinc-600 transition-colors hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className={selectSm}
                    value={c.role}
                    onChange={(e) => updateColor(c.id, { role: e.target.value as ColorRole })}
                    aria-label="Colour role"
                  >
                    <option value="none">Role — unassigned</option>
                    <option value="background">Role — background</option>
                    <option value="secondary">Role — secondary</option>
                    <option value="accent">Role — accent</option>
                    <option value="text">Role — text</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={c.share}
                    onChange={(e) => updateColor(c.id, { share: clamp(Number(e.target.value)) })}
                    aria-label="Part of the palette split"
                    title="Part — its slice of the donut"
                    className="h-8 w-14 shrink-0 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none transition-colors focus:border-emerald-500"
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addColor}
            disabled={state.colors.length >= MAX_COLORS}
            className={dashBtn}
          >
            + Add colour ({state.colors.length}/{MAX_COLORS})
          </button>
        </section>

        <section className="space-y-3">
          <h2 className={label}>Typography</h2>
          <div>
            <p className="mb-1 text-xs text-zinc-500">Display — headlines</p>
            <select
              className={field}
              value={state.displayFont}
              onChange={(e) => patch({ displayFont: e.target.value })}
            >
              {fontSelectOptions(DISPLAY_FONTS, state.customFonts).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs text-zinc-500">Body — text &amp; UI</p>
            <select
              className={field}
              value={state.bodyFont}
              onChange={(e) => patch({ bodyFont: e.target.value })}
            >
              {fontSelectOptions(BODY_FONTS, state.customFonts).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <input
            className={field}
            placeholder="Specimen text (defaults to company name)"
            value={state.specimen}
            onChange={(e) => patch({ specimen: e.target.value })}
          />

          <p className="pt-2 text-xs text-zinc-500">Custom fonts — upload WOFF2 / TTF / OTF</p>
          <div className="space-y-2">
            {state.customFonts.map((f) => (
              <div key={f.id} className="space-y-1.5 rounded-md border border-zinc-800 p-2">
                <div className="flex items-center gap-2">
                  <input
                    className="h-8 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none transition-colors focus:border-emerald-500"
                    value={f.family}
                    onChange={(e) => updateCustomFont(f.id, { family: e.target.value })}
                    aria-label="Font family name"
                  />
                  <button
                    type="button"
                    aria-label="Remove font"
                    onClick={() => removeCustomFont(f.id)}
                    className="shrink-0 p-1 text-zinc-600 transition-colors hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {f.variants.map((v) => (
                  <div key={v.id} className="flex items-center gap-2">
                    <select
                      className="h-7 min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 text-xs text-zinc-300 outline-none transition-colors focus:border-emerald-500"
                      value={v.weight}
                      onChange={(e) => updateVariant(f.id, v.id, { weight: e.target.value })}
                      aria-label="Weight"
                    >
                      {WEIGHT_OPTIONS.map((w) => (
                        <option key={w} value={w}>
                          {w === "100 900" ? "100–900 (variable)" : w}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-7 w-24 shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 text-xs text-zinc-300 outline-none transition-colors focus:border-emerald-500"
                      value={v.style}
                      onChange={(e) => updateVariant(f.id, v.id, { style: e.target.value as "normal" | "italic" })}
                      aria-label="Style"
                    >
                      <option value="normal">Normal</option>
                      <option value="italic">Italic</option>
                    </select>
                    <button
                      type="button"
                      aria-label="Remove variant"
                      onClick={() => removeVariant(f.id, v.id)}
                      className="shrink-0 p-1 text-zinc-600 transition-colors hover:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    pendingFamilyRef.current = f.id;
                    fontFileInputRef.current?.click();
                  }}
                  disabled={f.variants.length >= MAX_FONT_VARIANTS}
                  className={dashBtn}
                >
                  {f.variants.length ? "+ Add file" : "+ Upload font file"}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addCustomFont}
              disabled={state.customFonts.length >= MAX_CUSTOM_FONTS}
              className={dashBtn}
            >
              + Add custom font ({state.customFonts.length}/{MAX_CUSTOM_FONTS})
            </button>
          </div>
          <input
            ref={fontFileInputRef}
            type="file"
            accept=".woff,.woff2,.ttf,.otf,font/*"
            multiple
            className="hidden"
            onChange={addVariants}
          />
        </section>

        <section className="space-y-3">
          <h2 className={label}>Moodboard</h2>
          <div className="space-y-2">
            {state.assets.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-zinc-800">
                  <img src={a.src} alt="" className="h-full w-full object-cover" />
                </div>
                <input
                  className="h-9 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500"
                  placeholder="Caption (optional)"
                  value={a.caption}
                  onChange={(e) => updateAsset(a.id, { caption: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Move earlier"
                  onClick={() => moveAsset(i, -1)}
                  disabled={i === 0}
                  className={iconBtn}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move later"
                  onClick={() => moveAsset(i, 1)}
                  disabled={i === state.assets.length - 1}
                  className={iconBtn}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => removeAsset(a.id)}
                  className="shrink-0 p-1 text-zinc-600 transition-colors hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {state.assets.length < MAX_ASSETS && (
              <button
                type="button"
                onClick={() => assetsInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-zinc-700 py-2 text-xs text-zinc-500 transition-colors hover:border-emerald-500 hover:text-emerald-400"
              >
                <Plus className="h-3.5 w-3.5" /> Add image ({state.assets.length}/{MAX_ASSETS})
              </button>
            )}
          </div>
          <input
            ref={assetsInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onAssetsChange}
          />
        </section>

        <section className="space-y-2">
          <h2 className={label}>Sections</h2>
          {state.sections.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <span
                className={`flex-1 text-xs ${s.visible ? "text-zinc-200" : "text-zinc-600 line-through"}`}
              >
                {SECTION_LABELS[s.key]}
              </span>
              <button
                type="button"
                aria-label="Move section up"
                onClick={() => moveSection(s.key, -1)}
                disabled={i === 0}
                className={iconBtn}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move section down"
                onClick={() => moveSection(s.key, 1)}
                disabled={i === state.sections.length - 1}
                className={iconBtn}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={s.visible ? "Hide section" : "Show section"}
                title={s.visible ? "Hide" : "Show"}
                onClick={() => toggleSection(s.key)}
                className={`${iconBtn} ${s.visible ? "" : "text-zinc-600"}`}
              >
                {s.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </section>

        <section className="mt-auto space-y-3 border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={() => setClean(true)}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-500 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            <Maximize2 className="h-4 w-4" /> Clean view — for recording
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportJson}
              className={`${ghostBtn} flex flex-1 items-center justify-center gap-1.5`}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className={`${ghostBtn} flex flex-1 items-center justify-center gap-1.5`}
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-zinc-600 transition-colors hover:text-red-400"
          >
            <RotateCcw className="h-3 w-3" /> Reset this board
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onImport}
          />
          {storageWarning && (
            <p className="text-xs leading-relaxed text-amber-400">
              Couldn&apos;t save to local storage — likely full (large images or fonts). Use
              Export JSON to keep a copy.
            </p>
          )}
          {notice && <p className="text-xs text-emerald-400">{notice}</p>}
        </section>
      </aside>

      <main className="min-w-0 flex-1 bg-zinc-900 p-4 sm:p-8 lg:h-dvh lg:overflow-y-auto">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Live preview
            </p>
            <button
              type="button"
              onClick={() => setClean(true)}
              className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-white/20"
            >
              Clean view
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-700 shadow-2xl shadow-black/50">
            <BrandBoard state={state} />
          </div>
          <p className="mt-4 text-center text-xs leading-relaxed text-zinc-600">
            The frame above is exactly what clean view records. Click a colour on the board
            to copy its hex code.
          </p>
        </div>
      </main>
    </div>
  );
}
