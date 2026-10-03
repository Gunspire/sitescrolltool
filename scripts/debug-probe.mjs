// Probe #13b: IO creation stacks + dynamic script tracking (function-based injection).
import puppeteer from "puppeteer";

const target = process.argv[2] ?? "https://www.virtuelefabriek.nl/";
const pageUrl = target.startsWith("direct:")
  ? target.slice(7)
  : `http://${new URL(target).hostname}.ss.localhost:3000${new URL(target).pathname}${new URL(target).search}`;

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();

await page.evaluateOnNewDocument(() => {
  window.__ioStats = { created: 0, observed: 0, fired: 0, opts: [] };
  window.__dynChunks = [];
  const OrigIO = window.IntersectionObserver;
  window.IntersectionObserver = function (cb, opts) {
    window.__ioStats.created++;
    if (window.__ioStats.opts.length < 6) {
      window.__ioStats.opts.push(
        String(opts && opts.rootMargin) + " @ " +
          String(new Error().stack || "").replace(/\n/g, " | ").slice(0, 400),
      );
    }
    const obs = new OrigIO(function (entries, io) {
      window.__ioStats.fired++;
      return cb(entries, io);
    }, opts);
    const origObserve = obs.observe.bind(obs);
    obs.observe = function (t) {
      window.__ioStats.observed++;
      return origObserve(t);
    };
    return obs;
  };
  window.IntersectionObserver.prototype = OrigIO.prototype;
  const origAppend = Element.prototype.appendChild;
  Element.prototype.appendChild = function (el) {
    if (el && el.tagName === "SCRIPT" && el.src) {
      window.__dynChunks.push(el.src.slice(-100));
    }
    return origAppend.call(this, el);
  };
});

const logs = [];
page.on("pageerror", (e) =>
  logs.push(`[pageerror] ${String(e?.stack ?? e).slice(0, 600)}`),
);
page.on("response", (r) => {
  if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url().slice(0, 120)}`);
});

await page.goto(pageUrl, { waitUntil: "load", timeout: 60_000 });
await new Promise((r) => setTimeout(r, 8_000));
const state = await page.evaluate(() => ({
  io: window.__ioStats ?? null,
  dynChunks: (window.__dynChunks ?? []).slice(0, 10),
  hasNext: typeof window.next,
}));
console.log(JSON.stringify(state, null, 1));
console.log("LOGS:", logs.slice(0, 8).join("\n"));
await browser.close();
process.exit(0);
