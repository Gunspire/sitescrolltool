import type { NextRequest } from "next/server";

import { rewriteHtmlHostMode } from "@/lib/proxy-rewrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIP_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
];

const DESKTOP_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/**
 * Host-mode proxy: middleware rewrites every request to
 * `<site>.ss.localhost:<port>` onto this route with `__sstarget` carrying
 * the upstream origin. The path and query are forwarded untouched, so the
 * proxied page sees the same URL layout as the real site.
 *
 * Subresources (JS, CSS, images) are passed through byte-identical — the
 * browser resolves their paths against the proxy host exactly as it would
 * against the real site, so no rewriting (and no broken framework URL
 * assumptions) is ever needed.
 */
async function handleProxy(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path: segments = [] } = await ctx.params;

  const search = new URLSearchParams(req.nextUrl.searchParams);
  const target = req.headers.get("x-ss-target");
  // Full-URL fetch mode: the injected client patch routes the site's own
  // API calls (same brand domain, cross-origin) through here.
  const fetchUrl = search.get("__ssfetch");
  search.delete("__ssfetch");
  search.delete("__sstarget");
  const device = search.get("__ssdevice") === "mobile" ? "mobile" : "desktop";
  search.delete("__ssdevice");

  let targetUrl: string | null = null;
  if (fetchUrl && /^https?:\/\//i.test(fetchUrl)) {
    targetUrl = fetchUrl;
  } else if (target && /^https?:\/\//i.test(target)) {
    let base = target.replace(/\/+$/, "");
    if (segments.length) {
      base += "/" + segments.map(encodeURIComponent).join("/");
    }
    targetUrl = base;
  }
  if (!targetUrl) {
    return new Response("Missing proxy target", { status: 400 });
  }

  const qs = search.toString();
  if (qs) {
    targetUrl += (targetUrl.includes("?") ? "&" : "?") + qs;
  }
  const upstreamUrl = targetUrl;

  const method = req.method;
  const init: RequestInit = {
    method,
    redirect: "follow",
    cache: "no-store",
    headers: {
      "user-agent": device === "mobile" ? MOBILE_UA : DESKTOP_UA,
      accept: req.headers.get("accept") ?? "*/*",
      "accept-language":
        req.headers.get("accept-language") ?? "en-US,en;q=0.9",
      referer: new URL(upstreamUrl).origin + "/",
    },
  };
  // Forward bodies for POST/PUT/PATCH/DELETE (site API calls, forms,
  // analytics beacons).
  if (method !== "GET" && method !== "HEAD") {
    const contentType = req.headers.get("content-type");
    if (contentType) {
      (init.headers as Record<string, string>)["content-type"] = contentType;
    }
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (error) {
    return new Response(
      `Proxy fetch failed: ${error instanceof Error ? error.message : "unknown error"}`,
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";

  const passthroughHeaders = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "set-cookie") continue; // handled below (multi-value)
    if (STRIP_HEADERS.includes(lower)) continue;
    passthroughHeaders.set(key, value);
  }
  // Upstream cookies carry Domain attributes for the real site; rewrite
  // them to host-only so the browser accepts them for the proxy host.
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    passthroughHeaders.append(
      "set-cookie",
      cookie.replace(/;\s*domain=[^;]*/i, ""),
    );
  }

  if (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml")
  ) {
    const html = await upstream.text();
    passthroughHeaders.set("content-type", "text/html; charset=utf-8");
    passthroughHeaders.set("cache-control", "no-store");
    return new Response(rewriteHtmlHostMode(html), {
      status: upstream.status,
      headers: passthroughHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: passthroughHeaders,
  });
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const HEAD = handleProxy;
