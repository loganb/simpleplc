// One-off UI check: node screenshot.mjs <url> [output.png]
// See "Testing the UI with a real browser" in ../CLAUDE.md for why this
// exists instead of the system `chromium` CLI.
import { chromium } from "playwright";

const url = process.argv[2];
const out = process.argv[3] || "/tmp/screenshot.png";
if (!url) {
  console.error("usage: node screenshot.mjs <url> [output.png]");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (msg) => console.error("console:", msg.type(), msg.text()));
page.on("pageerror", (err) => console.error("pageerror:", err.message));
await page.goto(url, { waitUntil: "load", timeout: 15000 });
await page.waitForTimeout(1000); // let the SPA finish its first render/fetch
await page.screenshot({ path: out, fullPage: true });
console.log(`saved ${out}`);
await browser.close();
