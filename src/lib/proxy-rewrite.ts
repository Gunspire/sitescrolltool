import * as cheerio from "cheerio";

/**
 * Scroll driver, injected into every proxied page. The iframe is
 * cross-origin (each site gets its own *.ss.localhost host), so the parent
 * can't scroll it directly — instead the page runs the rAF scroll loop
 * itself and takes commands over postMessage from the toolbar.
 *
 * Auto-scrolls slowly from top to bottom so entry CSS animations play,
 * re-measures scrollHeight every tick (pages grow as lazy sections load),
 * and falls back to the deepest scrollable container when a site
 * scroll-jacks the window.
 */
export function scrollDriverScript(): string {
  return `(function () {
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = function () {
        return Promise.reject(new Error("service worker disabled by SiteShowcase"));
      };
    }
  } catch (e) {}
  // Route API-style requests (fetch/XHR/beacon/EventSource) to hosts that
  // belong to the site's own brand (same last-two-labels domain, e.g.
  // api.framer.com while viewing framer.com) through our proxy. The
  // proxied origin differs from the real one, so those would otherwise
  // fail CORS. Plain subresources (img/script/css) load fine cross-origin
  // and are left untouched.
  function sameSite(host) {
    var site = location.hostname.replace(/\\.ss\\.localhost$/, "");
    var a = site.split(".");
    var b = String(host).split(".");
    return a.slice(-2).join(".") === b.slice(-2).join(".");
  }
  function toProxy(u) {
    try {
      if (typeof u !== "string") return u;
      var abs = new URL(u, location.href);
      if (abs.origin === location.origin) return u;
      if (
        (abs.protocol === "https:" || abs.protocol === "http:") &&
        sameSite(abs.hostname)
      ) {
        return "/ssproxy?__ssfetch=" + encodeURIComponent(abs.href);
      }
    } catch (e) {}
    return u;
  }
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      if (typeof input === "string" || input instanceof URL) input = toProxy(String(input));
      else if (input && input.url) input = new Request(toProxy(input.url), input);
    } catch (e) {}
    return origFetch.call(this, input, init);
  };
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    try { arguments[1] = toProxy(arguments[1]); } catch (e) {}
    return origOpen.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    var origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) { return origBeacon(toProxy(u), d); };
  }
  if (window.EventSource) {
    var OrigES = window.EventSource;
    window.EventSource = function (u, cfg) { return new OrigES(toProxy(u), cfg); };
    window.EventSource.prototype = OrigES.prototype;
  }
  var SS = { speed: 3.5, loop: true, paused: false };
  var raf = 0, y = 0, last = 0, bottomSince = 0, stalledSince = 0, loadedAt = 0;
  var customScroller = null;
  var SETTLE_MS = 2500;
  function send(msg) {
    try { msg.__ss = 1; parent.postMessage(msg, "*"); } catch (e) {}
  }
  function findCustomScroller() {
    try {
      var best = null, bestDelta = 0;
      var candidates = document.querySelectorAll("*");
      var limit = Math.min(candidates.length, 400);
      for (var i = 0; i < limit; i++) {
        var el = candidates[i];
        var style = getComputedStyle(el);
        if (style.overflowY !== "auto" && style.overflowY !== "scroll" && style.overflowY !== "overlay") continue;
        var delta = el.scrollHeight - el.clientHeight;
        if (delta > bestDelta && delta > window.innerHeight * 0.5) { best = el; bestDelta = delta; }
      }
      return best;
    } catch (e) { return null; }
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (document.readyState === "loading") { last = now; return; }
    if (!loadedAt) loadedAt = now;
    if (now - loadedAt < SETTLE_MS || SS.paused) { last = now; return; }
    var scroller = customScroller || document.scrollingElement || document.documentElement;
    var innerH = customScroller ? customScroller.clientHeight : window.innerHeight;
    var max = Math.max(scroller.scrollHeight - innerH, 0);
    var dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (max <= 0) return;
    y += (innerH / SS.speed) * dt;
    var before = scroller.scrollTop;
    if (y >= max) {
      if (SS.loop) { y = 0; }
      else {
        scroller.scrollTop = max;
        if (!bottomSince) bottomSince = now;
        if (now - bottomSince > 2000) {
          send({ type: "ended" });
          cancelAnimationFrame(raf);
          raf = 0;
        }
        return;
      }
    }
    bottomSince = 0;
    scroller.scrollTop = y;
    if (!customScroller) {
      if (Math.abs(scroller.scrollTop - before) < 0.5 && y > 4) {
        if (!stalledSince) stalledSince = now;
        if (now - stalledSince > 1500) { customScroller = findCustomScroller(); stalledSince = 0; }
      } else { stalledSince = 0; }
    }
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.__ss !== 1) return;
    if (d.type === "config") {
      if (typeof d.speed === "number") SS.speed = d.speed;
      if (typeof d.loop === "boolean") SS.loop = d.loop;
      if (typeof d.paused === "boolean") SS.paused = d.paused;
      if (!SS.paused) start();
    }
  });
  send({ type: "ready" });
})();`;
}

/**
 * Host-mode HTML rewriting. The proxied page keeps the real site's URL
 * paths (served under `<site>.ss.localhost`), so every URL — including
 * ones built at runtime by the site's JavaScript — resolves through the
 * proxy naturally. Subresources stay byte-identical (SRI keeps working);
 * we only strip CSP meta tags and inject the scroll driver.
 */
export function rewriteHtmlHostMode(html: string): string {
  const $ = cheerio.load(html);

  // Strip CSP / framing protections embedded in the document.
  $("meta[http-equiv]").each((_, el) => {
    const equiv = ($(el).attr("http-equiv") ?? "").toLowerCase();
    if (equiv === "content-security-policy" || equiv === "x-frame-options") {
      $(el).remove();
    }
  });

  // Force exact scrolling behavior and inject the scroll driver as early
  // as possible.
  $("head").prepend(
    '<style>html{scroll-behavior:auto!important}</style>' +
      `<script>${scrollDriverScript()}</script>`,
  );

  return $.html();
}
