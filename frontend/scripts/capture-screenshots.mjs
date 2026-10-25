// Capture landing-page screenshots from a running CareGap stack.
// Usage (from frontend/): start the API and `npm run dev`, then:
//   PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome node scripts/capture-screenshots.mjs
// The screenshots are written to public/screenshots and are captured from the
// real workspace, not mocked up.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
async function settle(ms = 1200) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(ms);
}
await page.goto("http://localhost:3000/app");
await page.waitForSelector('[data-map-loaded="true"]', { timeout: 30000 });
await settle(2500);
await page.screenshot({ path: "public/screenshots/overview.png" });

await page.goto("http://localhost:3000/app/simulator");
await settle(1500);
await page.getByRole("button", { name: "Suggested gap" }).click();
await page.getByRole("button", { name: "Run scenario" }).click();
await page.getByText("Simulation result").waitFor({ timeout: 30000 });
await settle(1500);
await page.screenshot({ path: "public/screenshots/simulator.png" });

await page.goto("http://localhost:3000/app/recommendations");
await page.getByText("Ranked candidates").waitFor({ timeout: 30000 });
await settle(2000);
await page.screenshot({ path: "public/screenshots/recommendations.png" });
await browser.close();
console.log("screenshots written");
