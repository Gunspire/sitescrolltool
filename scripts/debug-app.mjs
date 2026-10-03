// Dev-only diagnostic: drives the real app UI (form -> iframe session) and
// inspects the proxied iframe's state, console errors and screenshots.
// Usage: node scripts/debug-app.mjs <url>
import puppeteer from "puppeteer";

const target = process.argv[2] ?? "https://framer.com";
const prefix = "/tmp/app";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();

const logs = [];
page.on("console", (msg) => {
  if (["error", "warning"].includes(msg.type())) {
    logs.push(`[console.${msg.type()}] ${msg.text().slice(0, 240)}`);
  }
});
page.on("pageerror", (err) => {
  logs.push(`[pageerror] ${String(err).slice(0, 240)}`);
});
page.on("requestfailed", (req) => {
  logs.push(`[requestfailed] ${req.failure()?.errorText} ${req.url().slice(0, 140)}`);
});

await page.goto("http://localhost:3000/", { waitUntil: "networkidle2" });
await page.type("input", target);
await page.click("button[type=submit]");
console.log("session started, waiting for load + settle...");

// Wait for iframe to appear and settle.
await new Promise((r) => setTimeout(r, 9_000));
await page.screenshot({ path: `${prefix}-0.png` });

// Find the proxied frame.
const proxiedFrame = page.frames().find((f) => f.url().includes(".ss.localhost"));
if (!proxiedFrame) {
  console.log("NO PROXIED FRAME FOUND. frames:");
  for (const f of page.frames()) console.log("  -", f.url().slice(0, 120));
} else {
  const state1 = await proxiedFrame.evaluate(() => ({
    readyState: document.readyState,
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    imgs: document.querySelectorAll("img").length,
    imgsLoaded: [...document.querySelectorAll("img")].filter(
      (i) => i.complete && i.naturalWidth > 0,
    ).length,
    bodyText: document.body.innerText.slice(0, 120).replace(/\n/g, " | "),
  }));
  console.log("IFRAME STATE @9s:", JSON.stringify(state1, null, 1));

  // Wait for the app's own scroll driver to progress.
  await new Promise((r) => setTimeout(r, 15_000));
  const state2 = await proxiedFrame.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    imgsLoaded: [...document.querySelectorAll("img")].filter(
      (i) => i.complete && i.naturalWidth > 0,
    ).length,
  }));
  console.log("IFRAME STATE @24s:", JSON.stringify(state2, null, 1));
  await page.screenshot({ path: `${prefix}-1.png` });
}

console.log("LOG COUNT:", logs.length);
console.log(logs.slice(0, 30).join("\n"));
await browser.close();
process.exit(0);
