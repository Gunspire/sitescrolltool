import { NextResponse, type NextRequest } from "next/server";

/**
 * Host-based proxying: any request to `<site>.ss.localhost:<port>` is
 * rewritten onto the internal /ssproxy route, which fetches the real site.
 *
 * The proxied page keeps the real site's URL paths, so framework-internal
 * URL assumptions — Turbopack chunk keys, `querySelectorAll('script[src=…]')`
 * lookups, runtime-built `/_next/...` URLs — resolve exactly as they do on
 * the live site. Nothing about the HTML's URLs needs rewriting.
 *
 * `*.localhost` resolves to 127.0.0.1 in Chrome/Firefox/Safari, so no
 * host-file or DNS setup is needed locally.
 */
export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const match = host.match(/^(.+)\.ss\.localhost(?::\d+)?$/);
  if (!match) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/ssproxy${url.pathname === "/" ? "" : url.pathname}`;
  url.searchParams.delete("__sstarget");
  const headers = new Headers(req.headers);
  headers.set("x-ss-target", `https://${match[1]}`);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Everything except the internal proxy route itself.
  matcher: ["/((?!ssproxy).*)"],
};
