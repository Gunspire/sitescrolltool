/* eslint-disable @next/next/no-img-element */

import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import CustomFontStyles from "./custom-fonts";
import { resolveFont, type ResolvedFont } from "./fonts";
import { isLight, ramp } from "./lib/color";
import type { BrandState, ColorRole, SectionKey, Swatch } from "./types";

const ROLE_LABEL: Record<Exclude<ColorRole, "none">, string> = {
  background: "Background",
  secondary: "Secondary",
  accent: "Accent",
  text: "Text",
};

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-zinc-200 pt-6">
      <h2 className="shrink-0 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
        {title}
      </h2>
      {meta && <p className="min-w-0 truncate text-xs tabular-nums text-zinc-400">{meta}</p>}
    </div>
  );
}

/**
 * The white-label board — exactly what gets recorded or screenshotted.
 * Neutral by design: white field, zinc ink, the company's own assets as content.
 */
export default function BrandBoard({ state }: { state: BrandState }) {
  const display = resolveFont(state.displayFont, state.customFonts);
  const body = resolveFont(state.bodyFont, state.customFonts);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const copyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      window.setTimeout(() => setCopiedHex(null), 1200);
    } catch {
      /* clipboard unavailable — non-fatal */
    }
  };

  const name = state.name.trim() || "Untitled brand";
  const specimen = state.specimen.trim() || name;

  const fontProps = (
    f: ResolvedFont,
    extra?: CSSProperties,
  ): { className?: string; style?: CSSProperties } =>
    f.className
      ? { className: f.className, style: extra }
      : { style: { fontFamily: `"${f.family ?? "sans-serif"}", sans-serif`, ...extra } };

  /** Largest declared weight ≤ target (never synthesises a weight). */
  const pickWeight = (f: ResolvedFont, target: number): number => {
    const fit = f.weights.filter((w) => w <= target);
    return fit.length ? Math.max(...fit) : f.weights.length ? Math.min(...f.weights) : 400;
  };

  const byRole = (role: ColorRole): Swatch | undefined =>
    state.colors.find((c) => c.role === role);
  const bg = byRole("background");
  const secondary = byRole("secondary");
  const accent = byRole("accent");
  const inkColor = byRole("text")?.hex ?? "#14161a";

  const hasLogo = Boolean(state.logo);
  const hasColors = state.colors.length > 0;
  const hasAssets = state.assets.length > 0;
  const hasTone = state.toneWords.length > 0;

  const renderSection = (key: SectionKey): ReactNode => {
    switch (key) {
      /* Moodboard — the first image runs large, the rest support it. */
      case "moodboard": {
        if (!hasAssets) return null;
        return (
          <section className="mt-24">
            <SectionHeader
              title="Moodboard"
              meta={`${state.assets.length} ${state.assets.length === 1 ? "image" : "images"}`}
            />
            <div className="mt-10 grid auto-rows-[11rem] grid-cols-2 gap-5 sm:grid-cols-3">
              {state.assets.map((a, i) => (
                <figure key={a.id} className={i === 0 ? "col-span-2 row-span-2" : ""}>
                  <div className="h-full w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                    <img src={a.src} alt={a.caption || ""} className="h-full w-full object-cover" />
                  </div>
                  {a.caption && (
                    <figcaption className="mt-2 text-sm leading-snug text-zinc-500">
                      {a.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </section>
        );
      }

      /* Colour — swatch, name, hex, role and a tint/shade ramp. Click copies hex. */
      case "colors": {
        if (!hasColors) return null;
        return (
          <section className="mt-24">
            <SectionHeader
              title="Colour"
              meta={`${state.colors.length} ${state.colors.length === 1 ? "swatch" : "swatches"}`}
            />
            <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
              {state.colors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void copyHex(c.hex)}
                  title="Copy hex"
                  className="group text-left"
                >
                  <div
                    className="relative flex h-36 items-end rounded-xl border border-zinc-200"
                    style={{ backgroundColor: c.hex }}
                  >
                    <span
                      className={`mb-3 ml-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-opacity ${
                        copiedHex === c.hex
                          ? "bg-zinc-900 text-white opacity-100"
                          : "bg-white/90 text-zinc-900 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {copiedHex === c.hex ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedHex === c.hex ? "Copied" : "Copy"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold">{c.name || "Unnamed"}</p>
                    <p className="shrink-0 font-mono text-xs uppercase text-zinc-500">{c.hex}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                    {c.role === "none" ? "\u00A0" : ROLE_LABEL[c.role]}
                  </p>
                  <div className="mt-2 flex h-3 overflow-hidden rounded-full border border-zinc-200">
                    {ramp(c.hex).map((h, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: h }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      }

      /* Hierarchy — donut split of every colour, plus the composed example. */
      case "hierarchy": {
        if (!hasColors) return null;
        const parts = state.colors.filter((c) => c.share > 0);
        const partTotal = parts.reduce((acc, c) => acc + c.share, 0);
        const circumference = 2 * Math.PI * 60;
        const gap = parts.length > 1 ? 2.5 : 0;
        let travelled = 0;
        const slices = parts.map((c) => {
          const pct = partTotal > 0 ? (c.share / partTotal) * 100 : 0;
          const len = Math.max((pct / 100) * circumference - gap, 0.5);
          const start = travelled;
          travelled += (pct / 100) * circumference;
          return { c, pct, len, start };
        });
        return (
          <section className="mt-24">
            <SectionHeader
              title="Hierarchy"
              meta={[bg?.share, secondary?.share, accent?.share]
                .map((v) => (typeof v === "number" ? String(Math.round(v)) : "—"))
                .join(" / ")}
            />
            <div className="mt-10 flex flex-col items-start gap-10 sm:flex-row sm:items-center sm:gap-14">
              <svg
                viewBox="0 0 160 160"
                className="h-44 w-44 shrink-0"
                role="img"
                aria-label="Palette split"
              >
                <g transform="rotate(-90 80 80)">
                  {slices.map(({ c, len, start }) => (
                    <circle
                      key={c.id}
                      cx={80}
                      cy={80}
                      r={60}
                      fill="none"
                      stroke={c.hex}
                      strokeWidth={22}
                      strokeDasharray={`${len} ${circumference - len}`}
                      strokeDashoffset={-(start + gap / 2)}
                    />
                  ))}
                </g>
              </svg>
              <div className="min-w-0 flex-1 space-y-3">
                {slices.map(({ c, pct }) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-zinc-300"
                      style={{ backgroundColor: c.hex }}
                    />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {c.name || "Unnamed"}
                    </p>
                    <p className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                      {c.role === "none" ? "—" : ROLE_LABEL[c.role]}
                    </p>
                    <p className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-500">
                      {Math.round(pct)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
            {bg && accent && (
              <div className="mt-10 overflow-hidden rounded-xl border border-zinc-200">
                <div className="flex flex-col sm:flex-row" style={{ backgroundColor: bg.hex }}>
                  <div className="flex-1 p-8 sm:p-12" style={{ color: inkColor }}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] opacity-60">
                      In practice
                    </p>
                    <h3
                      {...fontProps(display, { fontWeight: pickWeight(display, 700) })}
                      className="mt-4 text-3xl sm:text-4xl"
                    >
                      {specimen}
                    </h3>
                    <p className="mt-4 max-w-md text-sm leading-relaxed opacity-75">
                      {state.tagline.trim() || "Sixty percent — the field everything sits on."}
                    </p>
                    <span
                      className="mt-8 inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold"
                      style={{
                        backgroundColor: accent.hex,
                        color: isLight(accent.hex) ? "#18181b" : "#fafafa",
                      }}
                    >
                      Call to action
                    </span>
                  </div>
                  {secondary && (
                    <div
                      className="p-8 sm:w-[30%] sm:shrink-0 sm:p-10"
                      style={{ backgroundColor: secondary.hex }}
                    >
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: isLight(secondary.hex) ? "#3f3f46" : "#d4d4d8" }}
                      >
                        Thirty percent — panels, cards and supporting surfaces.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      }

      /* Typography — display and body side by side, full weight ladders. */
      case "type": {
        return (
          <section className="mt-24">
            <SectionHeader title="Typography" meta={`${display.label} · ${body.label}`} />
            <div className="mt-10 grid gap-12 lg:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="min-w-0 truncate text-sm font-semibold">{display.label}</p>
                  <p className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                    Display
                  </p>
                </div>
                <p
                  {...fontProps(display, { fontWeight: pickWeight(display, 700) })}
                  className="mt-5 text-4xl leading-[1.02] tracking-tight sm:text-5xl"
                >
                  {specimen}
                </p>
                {display.weights.length > 1 && (
                  <div className="mt-6 space-y-2 border-t border-zinc-100 pt-5">
                    {display.weights.map((w) => (
                      <div key={w} className="flex items-baseline gap-4">
                        <span className="w-9 shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
                          {w}
                        </span>
                        <p
                          {...fontProps(display, { fontWeight: w })}
                          className="min-w-0 flex-1 truncate text-lg"
                        >
                          {specimen}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {display.italic && (
                  <p {...fontProps(display)} className="mt-5 text-lg italic text-zinc-600">
                    {specimen} — italic
                  </p>
                )}
              </div>
              <div className="lg:border-l lg:border-zinc-200 lg:pl-12">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="min-w-0 truncate text-sm font-semibold">{body.label}</p>
                  <p className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                    Body
                  </p>
                </div>
                <p {...fontProps(body)} className="mt-5 text-base leading-relaxed text-zinc-700">
                  The quick brown fox jumps over the lazy dog — 0123456789 — body copy reads
                  comfortably at sixteen pixels with relaxed leading.
                </p>
                <p
                  {...fontProps(body)}
                  className="mt-3 text-base font-semibold leading-relaxed text-zinc-900"
                >
                  Semibold for emphasis, buttons and interface copy.
                </p>
                {body.italic && (
                  <p
                    {...fontProps(body)}
                    className="mt-3 text-base italic leading-relaxed text-zinc-500"
                  >
                    Italic for captions, quotes and asides.
                  </p>
                )}
                <p
                  {...fontProps(body, { fontWeight: 500 })}
                  className="mt-5 border-t border-zinc-100 pt-5 text-sm tracking-wide text-zinc-500"
                >
                  {"0123456789 £$€¥ %@&#()"}
                </p>
                {body.weights.length > 1 && (
                  <div className="mt-5 space-y-2 border-t border-zinc-100 pt-5">
                    {body.weights.map((w) => (
                      <div key={w} className="flex items-baseline gap-4">
                        <span className="w-9 shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
                          {w}
                        </span>
                        <p
                          {...fontProps(body, { fontWeight: w })}
                          className="min-w-0 flex-1 truncate text-base"
                        >
                          {specimen}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      }

      /* Logo — light and dark fields. */
      case "logo": {
        if (!hasLogo) return null;
        return (
          <section className="mt-24">
            <SectionHeader title="Logo" meta="Light / dark" />
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              <div className="flex h-56 items-center justify-center rounded-xl border border-zinc-200 bg-white p-10">
                <img
                  src={state.logo as string}
                  alt="Logo on a light background"
                  className="max-h-28 max-w-[70%] object-contain"
                />
              </div>
              <div className="flex h-56 items-center justify-center rounded-xl border border-zinc-900 bg-zinc-900 p-10">
                <img
                  src={state.logo as string}
                  alt="Logo on a dark background"
                  className="max-h-28 max-w-[70%] object-contain"
                />
              </div>
            </div>
          </section>
        );
      }
    }
  };

  return (
    <div {...fontProps(body)} className="bg-white text-zinc-900">
      <CustomFontStyles fonts={state.customFonts} />
      <div className="mx-auto max-w-4xl px-6 py-20 sm:px-10 sm:py-24">
        <header>
          {hasLogo && (
            <img
              src={state.logo as string}
              alt={`${name} logo`}
              className="h-16 w-auto object-contain"
            />
          )}
          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
            Brand Guidelines
          </p>
          <h1
            {...fontProps(display, { fontWeight: pickWeight(display, 700) })}
            className="mt-6 text-6xl leading-[0.95] tracking-tight sm:text-8xl"
          >
            {name}
          </h1>
          {state.tagline.trim() && (
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-zinc-500">
              {state.tagline}
            </p>
          )}
          {hasTone && (
            <div className="mt-8 flex flex-wrap gap-2">
              {state.toneWords.map((t, i) => (
                <span
                  key={i}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </header>

        {state.sections
          .filter((s) => s.visible)
          .map((s) => (
            <Fragment key={s.key}>{renderSection(s.key)}</Fragment>
          ))}

        <footer className="mt-24 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-6">
          <p className="text-xs text-zinc-400">
            © {new Date().getFullYear()} {name}
          </p>
          <p className="min-w-0 truncate text-xs text-zinc-400">
            {state.colors.length} colours · {display.label} · {body.label}
          </p>
        </footer>
      </div>
    </div>
  );
}
