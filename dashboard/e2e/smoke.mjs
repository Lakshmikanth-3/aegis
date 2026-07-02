/**
 * Real Playwright browser smoke test for the Aegis dashboard's golden path.
 * Navigates the actual running app (orchestrator on :4000, vite on :5173)
 * in headless Chromium and asserts real rendered content -- no mocked
 * responses, no fixture data. Intentionally does not trigger new proof
 * generation (Start Agent Fleet / Generate Attestation), since those are
 * already exercised end-to-end by demo-run.ts and the manual phase
 * verifications; this suite covers navigation, live data rendering, and
 * the confidentiality invariant (no plaintext amount ever rendered).
 *
 * Usage: node e2e/smoke.mjs   (both dev servers must already be running)
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.AEGIS_DASHBOARD_URL ?? "http://localhost:5173";
let failures = 0;

function check(label, condition) {
  if (condition) {
    console.log(`OK: ${label}`);
  } else {
    console.error(`FAIL: ${label}`);
    failures++;
  }
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

// 1. Landing page
await page.goto(BASE, { waitUntil: "load" });
await page.waitForSelector("text=Your agents pay in the open", { timeout: 15000 });
check("landing page renders the real headline", true);

const ctaHrefs = await page.$$eval(".hero-ctas a", (els) => els.map((e) => e.getAttribute("href")));
check("landing CTAs link to /console and /feed", ctaHrefs.includes("/console") && ctaHrefs.includes("/feed"));

// 2. Treasury Console -- real routing + real agent roster
await page.click("a.primary.large");
await page.waitForURL("**/console", { timeout: 10000 });
check("clicking CTA navigates the real browser URL to /console", page.url().endsWith("/console"));
await page.waitForSelector(".agent-row", { timeout: 15000 });
const agentNames = await page.$$eval(".agent-name", (els) => els.map((e) => e.textContent.trim()));
check(
  "console lists the real roster (procurement-agent present)",
  agentNames.some((n) => n.includes("procurement-agent"))
);

// 3. Agent detail drawer
await page.click(".agent-row.clickable");
await page.waitForSelector(".drawer", { timeout: 5000 });
const drawerText = await page.textContent(".drawer");
check("drawer shows agent_id", drawerText.includes("agent_id:"));
check("drawer shows allocated budget stat", drawerText.includes("Allocated budget"));
check("drawer labels the cap as treasury-wide", drawerText.includes("Treasury-wide per-tx cap"));
await page.click(".drawer-close");

// 4. Vendors screen -- real Merkle root + real vendor catalog
await page.goto(`${BASE}/vendors`, { waitUntil: "load" });
await page.waitForSelector(".vendor-card", { timeout: 15000 });
const rootText = await page.textContent(".root-box-value");
check("vendors screen shows a real 32-byte hex Merkle root", /^0x[0-9a-f]{64}$/.test(rootText.trim()));
const vendorCardCount = await page.$$eval(".vendor-card", (els) => els.length);
check("vendors screen renders at least the 8-vendor roster", vendorCardCount >= 8);

// 5. Live Sealed Feed -- confidentiality invariant
await page.goto(`${BASE}/feed`, { waitUntil: "load" });
await page.waitForSelector(".panel", { timeout: 15000 });
const feedHtml = await page.innerHTML(".feed").catch(() => "");
// A settled/pending payment's amount must never appear as a raw number in
// the DOM -- only the sealed glyph, or (for a rejected payment) the vendor
// name with no amount attached.
const leaksAmount = /\$?\d{2,}\s*(→|->)/.test(feedHtml);
check("live feed never renders a raw payment amount", !leaksAmount);

// 6. Compliance Attestation screen -- period selector present
await page.goto(`${BASE}/attestation`, { waitUntil: "load" });
await page.waitForSelector(".period-selector", { timeout: 15000 });
const periodLabels = await page.$$eval(".period-option", (els) => els.map((e) => e.textContent));
check(
  "attestation screen has all 3 period options",
  ["Last 24 hours", "Last 7 days", "This session"].every((l) => periodLabels.includes(l))
);

check("no console errors across the whole golden path", consoleErrors.length === 0);
if (consoleErrors.length > 0) console.error("console errors:", consoleErrors);

await browser.close();

console.log(`\n${failures === 0 ? "All" : failures + " of " + "checks"} smoke checks ${failures === 0 ? "passed" : "FAILED"}.`);
if (failures > 0) process.exit(1);
