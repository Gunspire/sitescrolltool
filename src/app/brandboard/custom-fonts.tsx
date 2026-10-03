import type { CustomFont } from "./types";

/**
 * Injects @font-face rules for uploaded fonts (stored as data URLs).
 * Family names are synthetic ("cf-<id>") so they can never collide with
 * system fonts, and weight ranges ("100 900") work for variable uploads.
 */
export default function CustomFontStyles({ fonts }: { fonts: CustomFont[] }) {
  const rules = fonts.flatMap((f) =>
    f.variants.map(
      (v) =>
        `@font-face{font-family:"cf-${f.id}";src:url(${v.src});font-weight:${v.weight};font-style:${v.style};font-display:block;}`,
    ),
  );
  if (!rules.length) return null;
  return <style dangerouslySetInnerHTML={{ __html: rules.join("\n") }} />;
}
