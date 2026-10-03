// Bisect: load the REAL site with (or without) our client patch injected.
import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";

const mode = process.argv[2] ?? "patched"; // patched | clean
const patch = readFileSync("/tmp/patch.js", "utf8");

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
if (mode === "patched") {
  await page.evaluateOnNewDocument(patch);
}
const logs = [];
page.on("pageerror", (e) => logs.push("[pageerror] " + String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") logs.push("[console] " + m.text().slice(0, 160));
});

await page.goto("https://www.virtuelefabriek.nl/", {
  waitUntil: "networkidle2",
  timeout: 60_000,
});
await new Promise((r) => setTimeout(r, 3_000));

await page.evaluate(
  (secondsPerScreen) => {
    const scroller = document.scrollingElement ?? document.documentElement;
    let y = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      y += (innerHeight / secondsPerScreen) * dt;
      scroller.scrollTop = y;
      if (y < scroller.scrollHeight) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  3.5,
);
await new Promise((r) => setTimeout(r, 25_000));

const state = await page.evaluate(() => {
  const scroller = document.scrollingElement ?? document.documentElement;
  const hidden = [...document.querySelectorAll("h1,h2,h3,h4,p,img")].filter(
    (el) =>
      (getComputedStyle(el).visibility === "hidden" ||
        getComputedStyle(el).opacity === "0") &&
      el.getBoundingClientRect().height > 10,
  ).length;
  return {
    hidden,
    total: document.querySelectorAll("h1,h2,h3,h4,p,img").length,
    bodyTextLen: document.body.innerText.length,
  };
});
console.log(`MODE=${mode}`, JSON.stringify(state));
console.log("ERRORS:", logs.length ? logs.slice(0, 6).join(" | ") : "(none)");
await browser.close();
process.exit(0);
