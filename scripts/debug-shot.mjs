// Dev-only diagnostic: loads a proxied site, scrolls it like the app does,
// captures console errors / failed requests / screenshots.
// Usage: node scripts/debug-shot.mjs <url> [outPrefix]
import puppeteer from "puppeteer";

const target = process.argv[2] ?? "https://framer.com";
const prefix = process.argv[3] ?? "/tmp/dbg";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();

const logs = [];
page.on("console", (msg) => {
  if (["error", "warning"].includes(msg.type())) {
    logs.push(`[console.${msg.type()}] ${msg.text().slice(0, 300)}`);
  }
});
page.on("pageerror", (err) => {
  logs.push(`[pageerror] ${String(err).slice(0, 300)}`);
});
page.on("requestfailed", (req) => {
  logs.push(
    `[requestfailed] ${req.failure()?.errorText} ${req.url().slice(0, 140)}`,
  );
});
page.on("response", (res) => {
  if (res.status() >= 400) {
    logs.push(`[http ${res.status()}] ${res.url().slice(0, 140)}`);
  }
});

await page.goto(`http://localhost:3000/proxy/${target}`, {
  waitUntil: "networkidle2",
  timeout: 60_000,
});
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${prefix}-0-hero.png` });

// Scroll like the app does: ~3.5s per screen.
const steps = 40;
for (let i = 1; i <= steps; i++) {
  await page.evaluate(
    (frame, total) => {
      const scroller = document.scrollingElement ?? document.documentElement;
      scroller.scrollTop = (frame / total) * (scroller.scrollHeight - innerHeight);
    },
    i,
    steps,
  );
  await new Promise((r) => setTimeout(r, 3500 / 40));
  if (i === 10) await page.screenshot({ path: `${prefix}-1-mid.png` });
  if (i === 25) await page.screenshot({ path: `${prefix}-2-mid2.png` });
}
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${prefix}-3-bottom.png` });

const info = await page.evaluate(() => ({
  scrollY: window.scrollY,
  scrollHeight: document.documentElement.scrollHeight,
  innerHeight: window.innerHeight,
  imgs: document.querySelectorAll("img").length,
  imgsLoaded: [...document.querySelectorAll("img")].filter(
    (i) => i.complete && i.naturalWidth > 0,
  ).length,
  imgsBroken: [...document.querySelectorAll("img")].filter(
    (i) => i.complete && i.naturalWidth === 0,
  ).length,
}));
console.log("PAGE STATE:", JSON.stringify(info));
console.log("LOG COUNT:", logs.length);
console.log(logs.slice(0, 40).join("\n"));
await browser.close();
process.exit(0);
