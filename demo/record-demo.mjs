// Automated, narrated walkthrough of the Clinical Trial Eligibility app.
//
// Drives the real UI against a running backend + frontend, overlays a visible cursor and
// captions, and writes:
//   output/demo.webm            raw Playwright recording
//   output/demo.mp4             H.264 copy (when ffmpeg is on PATH or FFMPEG_PATH is set)
//   output/screenshots/*.png    key screens in light and dark themes, desktop and mobile
//
// Prerequisites: backend seeded with `python -m scripts.seed --api-url <api> --analyze`,
// frontend served (npm run preview / npm run dev). All data shown is synthetic.
//
//   npm install && npm run install-ffmpeg && npm run demo            (headless)
//   npm run demo:watch                                               (visible browser)
//
// Environment: DEMO_BASE_URL (http://localhost:5173), DEMO_API_URL (http://localhost:8000),
// DEMO_BROWSER_CHANNEL (msedge | chrome | chromium), DEMO_OUT (./output), DEMO_PACE (1 = normal),
// DEMO_EMAIL / DEMO_PASSWORD (demo@example.org / demo-password-123), FFMPEG_PATH.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "..", "backend", "tests", "fixtures");
const BASE = (process.env.DEMO_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const API = (process.env.DEMO_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const CHANNEL = process.env.DEMO_BROWSER_CHANNEL ?? "msedge";
const OUT = path.resolve(process.env.DEMO_OUT ?? path.join(HERE, "output"));
const SHOTS = path.join(OUT, "screenshots");
const PACE = Number(process.env.DEMO_PACE ?? "1");
const EMAIL = process.env.DEMO_EMAIL ?? "demo@example.org";
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password-123";
const HEADED = process.argv.includes("--headed");
const SIZE = { width: 1440, height: 900 };

const RUN_TAG = new Date().toISOString().slice(11, 16).replace(":", "");
const UPLOAD_TITLE = `SYN-CARDIO-003 heart failure study (live upload ${RUN_TAG})`;
const WALK_IN_LABEL = `Synthetic patient K - demo walk-in ${RUN_TAG}`;

// ---------------------------------------------------------------- overlay (cursor + captions)

const OVERLAY = () => {
  const css = `
    #demo-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;
      transform:translate(-100px,-100px);transition:transform .06s linear;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}
    .demo-ripple{position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;z-index:2147483646;
      pointer-events:none;border:3px solid rgba(99,102,241,.9);animation:demo-ripple .55s ease-out forwards}
    @keyframes demo-ripple{to{transform:scale(4.2);opacity:0}}
    #demo-caption{position:fixed;left:50%;bottom:28px;z-index:2147483645;pointer-events:none;max-width:min(760px,92vw);
      transform:translate(-50%,16px);opacity:0;transition:opacity .35s ease,transform .35s ease;
      background:rgba(15,23,42,.88);color:#fff;border-radius:16px;padding:14px 22px;text-align:center;
      font:500 15px/1.45 "Inter Variable",Inter,system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35);
      border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(6px)}
    #demo-caption.on{opacity:1;transform:translate(-50%,0)}
    #demo-caption b{display:block;font-size:18px;font-weight:650;letter-spacing:-.01em}
    #demo-caption span{color:rgba(255,255,255,.78)}
    #demo-chapter{position:fixed;left:20px;top:84px;z-index:2147483645;pointer-events:none;opacity:0;
      transition:opacity .3s;background:linear-gradient(135deg,#4c6aeb,#7c3aed);color:#fff;border-radius:999px;
      padding:6px 14px;font:600 12px/1 "Inter Variable",Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;
      box-shadow:0 6px 20px rgba(76,106,235,.35)}
    #demo-chapter.on{opacity:1}`;
  const install = () => {
    if (document.getElementById("demo-cursor")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    cursor.innerHTML =
      '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9.2-6.6 1.5 3.9 7.6-2.9 1.4-3.9-7.7L4 18.8z" fill="#111827" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    const caption = document.createElement("div");
    caption.id = "demo-caption";
    document.body.appendChild(caption);
    const chapter = document.createElement("div");
    chapter.id = "demo-chapter";
    document.body.appendChild(chapter);
    const last = window.__demoMouse;
    if (last) cursor.style.transform = `translate(${last[0] - 4}px, ${last[1] - 2}px)`;
  };
  window.addEventListener("mousemove", (e) => {
    window.__demoMouse = [e.clientX, e.clientY];
    const c = document.getElementById("demo-cursor");
    if (c) c.style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 2}px)`;
  }, true);
  window.addEventListener("mousedown", (e) => {
    const r = document.createElement("div");
    r.className = "demo-ripple";
    r.style.left = `${e.clientX}px`;
    r.style.top = `${e.clientY}px`;
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }, true);
  window.__demoCaption = (title, sub) => {
    install();
    const el = document.getElementById("demo-caption");
    if (!title) return el.classList.remove("on");
    el.innerHTML = "";
    const b = document.createElement("b");
    b.textContent = title;
    el.appendChild(b);
    if (sub) {
      const s = document.createElement("span");
      s.textContent = sub;
      el.appendChild(s);
    }
    el.classList.add("on");
  };
  window.__demoChapter = (text) => {
    install();
    const el = document.getElementById("demo-chapter");
    el.textContent = text || "";
    el.classList.toggle("on", Boolean(text));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
};

// ---------------------------------------------------------------- helpers

const wait = (page, ms) => page.waitForTimeout(Math.round(ms * PACE));

async function caption(page, title, sub = "") {
  await page.evaluate(([t, s]) => window.__demoCaption?.(t, s), [title, sub]);
}

async function chapter(page, text) {
  await page.evaluate((t) => window.__demoChapter?.(t), text);
}

async function moveTo(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Element not visible: ${locator}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
  await wait(page, 250);
}

async function click(page, locator) {
  await moveTo(page, locator);
  await locator.click();
  await wait(page, 350);
}

async function typeInto(page, locator, text, delay = 35) {
  await click(page, locator);
  await locator.fill("");
  await locator.pressSequentially(text, { delay: Math.round(delay * PACE) });
}

async function smoothScroll(page, selector, block = "start") {
  await page.evaluate(
    ([sel, b]) => document.querySelector(sel)?.scrollIntoView({ behavior: "smooth", block: b }),
    [selector, block],
  );
  await wait(page, 1100);
}

async function scrollBy(page, dy, steps = 6) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(60);
  }
  await wait(page, 500);
}

async function shot(page, name) {
  await caption(page, "");
  await chapter(page, "");
  await page.evaluate(() => document.getElementById("demo-cursor")?.style.setProperty("visibility", "hidden"));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  await page.evaluate(() => document.getElementById("demo-cursor")?.style.removeProperty("visibility"));
}

async function setTheme(page, theme) {
  await click(page, page.getByRole("radio", { name: `${theme} theme` }).first());
  await wait(page, 500);
}

async function closeDrawer(page) {
  await page.keyboard.press("Escape");
  await wait(page, 400);
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) {
    await click(page, dialog.getByRole("button", { name: /close/i }).first());
  }
}

async function checkUp(url, what) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (err) {
    throw new Error(`${what} is not reachable at ${url} (${err.message}). Start it first; see demo/README.md.`);
  }
}

// ---------------------------------------------------------------- scenes

async function sceneLogin(page) {
  await page.goto(`${BASE}/login`);
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  await chapter(page, "1 · Sign in");
  await caption(page, "Clinical Trial Eligibility Support", "Agentic trial screening with page-cited evidence · all data is synthetic");
  await page.mouse.move(SIZE.width * 0.72, SIZE.height * 0.3, { steps: 10 });
  await wait(page, 3200);
  await shot(page, "01-login-light");
  await caption(page, "One-click demo account", "Fills in the synthetic demo credentials");
  await click(page, page.getByRole("button", { name: /Use the demo account/ }));
  await wait(page, 900);
  await click(page, page.getByRole("button", { name: "Sign in", exact: true }));
  await page.waitForURL("**/dashboard");
}

async function sceneDashboard(page) {
  await chapter(page, "2 · Dashboard");
  await caption(page, "Your eligibility workspace", "Protocols, synthetic patients and every assessment at a glance");
  await page.getByText("Recent assessments").waitFor();
  await wait(page, 2600);
  await shot(page, "02-dashboard-light");
  await chapter(page, "2 · Dashboard");
  for (const label of ["Protocols", "Patients", "Assessments", "Need follow-up"]) {
    await moveTo(page, page.locator("p.eyebrow", { hasText: label }).first());
    await wait(page, 250);
  }
  await caption(page, "Outcomes at a glance", "Eligible · Not eligible · More information required");
  await moveTo(page, page.getByRole("img", { name: /Distribution of assessment outcomes/ }));
  await wait(page, 1800);

  await caption(page, "Filter assessments by outcome", "Click any row to open its full, cited result");
  await smoothScroll(page, "#runs-h", "center");
  await click(page, page.getByRole("tab", { name: /^Not eligible/ }));
  await wait(page, 1300);
  await click(page, page.getByRole("tab", { name: /^More info required/ }));
  await wait(page, 1300);
  await click(page, page.getByRole("tab", { name: /^All/ }));

  await caption(page, "Quick search", "Filter patients as you type");
  await smoothScroll(page, "#patients-h", "center");
  const search = page.getByLabel("Filter patients");
  await typeInto(page, search, "heart", 90);
  await wait(page, 1500);
  await search.fill("");
  await wait(page, 500);
  await smoothScroll(page, "body", "start");
}

async function sceneThemes(page) {
  await chapter(page, "3 · Themes");
  await caption(page, "Light, dark or system", "Pick a theme; the choice is remembered on this device");
  await setTheme(page, "Dark");
  await wait(page, 1800);
  await shot(page, "03-dashboard-dark");
  await chapter(page, "3 · Themes");
  await caption(page, "System mode follows the operating system", "Switching the OS to light or dark updates the app live");
  await setTheme(page, "System");
  await page.emulateMedia({ colorScheme: "dark" });
  await wait(page, 1500);
  await page.emulateMedia({ colorScheme: "light" });
  await wait(page, 1500);
  await setTheme(page, "Light");
}

async function sceneUpload(page) {
  await chapter(page, "4 · Upload a protocol");
  await click(page, page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Upload protocol" }));
  await caption(page, "Upload a protocol PDF", "Drag and drop, or choose a file. This one is a synthetic heart-failure protocol.");
  await page.locator("#protocol-file").setInputFiles(path.join(FIXTURES, "protocol_cardio.pdf"));
  await wait(page, 1200);
  await typeInto(page, page.locator("#trial-title"), UPLOAD_TITLE, 28);
  await wait(page, 500);
  await click(page, page.getByRole("button", { name: "Upload and extract" }));
  await page.locator("#extracted-h").waitFor({ timeout: 90_000 });
  await caption(page, "Criteria extracted automatically", "Each criterion becomes a machine-readable rule cited to its protocol page");
  await smoothScroll(page, "#extracted-h", "start");
  await wait(page, 1500);
  await shot(page, "04-protocol-extracted");
  await chapter(page, "4 · Upload a protocol");
  await scrollBy(page, 500, 10);
  await wait(page, 1600);
}

async function scenePatient(page) {
  await chapter(page, "5 · Add a patient");
  await click(page, page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "New patient" }));
  await caption(page, "Add a synthetic patient", "Type the data in, or import a structured JSON profile");
  await wait(page, 1300);
  const fixture = JSON.parse(readFileSync(path.join(FIXTURES, "patient_cardio_recent_mi.json"), "utf8"));
  fixture.label = WALK_IN_LABEL;
  await click(page, page.getByRole("button", { name: "Load JSON" }));
  await page.locator("#json-input").fill(JSON.stringify(fixture, null, 2));
  await wait(page, 1200);
  await click(page, page.getByRole("button", { name: "Parse and load into form" }));
  await caption(page, "Profile loaded into the form", "Labs, diagnoses, medications and history, each with dates");
  await wait(page, 1200);
  await scrollBy(page, 700, 10);
  await wait(page, 900);
  await scrollBy(page, 700, 10);
  await wait(page, 900);
  await click(page, page.getByRole("button", { name: "Create patient" }));
  await page.locator("#saved-h").waitFor({ timeout: 30_000 });
  await smoothScroll(page, "#saved-h", "start");
  await caption(page, "Saved and checked", "Data quality flags appear instantly; now run an assessment");
  await wait(page, 1800);
  await shot(page, "05-patient-saved");
  await chapter(page, "5 · Add a patient");
  await moveTo(page, page.locator("#pf-trial"));
  await page.locator("#pf-trial").selectOption({ label: UPLOAD_TITLE });
  await wait(page, 900);
  await click(page, page.getByRole("button", { name: "Run assessment" }));
}

async function sceneAnalysis(page) {
  await page.waitForURL("**/analysis/**");
  await chapter(page, "6 · Six agents at work");
  await caption(page, "The agent workflow runs live", "Inclusion matching and exclusion detection run in parallel");
  await page.mouse.move(SIZE.width * 0.8, SIZE.height * 0.45, { steps: 15 });
  await wait(page, 700);
  await shot(page, "06-analysis-progress").catch(() => {});
  await chapter(page, "6 · Six agents at work");
  await caption(page, "The agent workflow runs live", "Inclusion matching and exclusion detection run in parallel");
  await page.waitForURL("**/results/**", { timeout: 120_000 });
}

async function sceneResults(page) {
  await chapter(page, "7 · Results");
  await page.locator("#summary-h").waitFor();
  const verdict = (await page.locator("#summary-h").textContent())?.trim() ?? "Result";
  await caption(page, verdict, "The overall recommendation, with counts and a plain-language explanation");
  await page.mouse.move(SIZE.width * 0.75, 260, { steps: 15 });
  await wait(page, 3500);
  await shot(page, "07-results-light");
  await chapter(page, "7 · Results");

  if (await page.locator("article[aria-labelledby^='set-']").count()) {
    await caption(page, "Silent exclusion trigger", "A hidden contradiction between findings, flagged for human review");
    await smoothScroll(page, "#set-h", "start");
    await wait(page, 3000);
  }
  await caption(page, "Every criterion, explained", "Status, rule, patient value, reasoning and the protocol page it came from");
  await smoothScroll(page, "#exclusion-criteria", "start");
  await wait(page, 2500);
  const evidence = page.locator("#exclusion-criteria").getByRole("button", { name: /Open protocol page/ }).filter({ visible: true }).first();
  await click(page, evidence);
  await page.getByRole("dialog").waitFor();
  await caption(page, "Evidence drawer", "The cited excerpt is highlighted on the protocol page");
  await wait(page, 3200);
  await shot(page, "08-evidence-drawer");
  await chapter(page, "7 · Results");
  await closeDrawer(page);

  await caption(page, "Jump between sections", "Sticky navigation for triggers, criteria, missing information and audit trail");
  await click(page, page.getByRole("navigation", { name: "Result sections" }).getByRole("link", { name: /Audit trail/ }));
  await wait(page, 1800);
  await click(page, page.getByRole("navigation", { name: "Result sections" }).getByRole("link", { name: /Inclusion/ }));
  await wait(page, 1500);

  await caption(page, "Comfortable in dark mode too", "Every status keeps its text label, never colour alone");
  await setTheme(page, "Dark");
  await smoothScroll(page, "body", "start");
  await wait(page, 2200);
  await shot(page, "09-results-dark");
  await chapter(page, "7 · Results");
}

async function sceneAcceptance(page) {
  await chapter(page, "8 · The renal case");
  await click(page, page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Dashboard" }));
  await page.getByText("Recent assessments").waitFor();
  await smoothScroll(page, "#runs-h", "start");
  await caption(page, "The headline case: age 69, eGFR 28", "Against SYN-RENAL-001, where 'severe renal impairment' is not defined");
  const row = page.getByRole("link", { name: /Synthetic patient A - age 69, eGFR 28 in SYN-RENAL-001 \(severe/ }).first();
  await click(page, row);
  await page.locator("#summary-h").waitFor();
  await wait(page, 2500);
  await caption(page, "Flagged, not guessed", "eGFR 28 fails inclusion, but renal impairment is not confirmed by eGFR alone");
  await smoothScroll(page, "#set-h", "start");
  await wait(page, 3500);
  await smoothScroll(page, "#exclusion-criteria", "start");
  const exc01 = page.locator("#exclusion-criteria tr", { hasText: "EXC-01" }).getByRole("button", { name: /Open protocol page/ }).first();
  await click(page, exc01);
  await page.getByRole("dialog").waitFor();
  await caption(page, "Protocol page 3", "“Severe renal impairment.” with no numeric definition, so a clinician must decide");
  await wait(page, 3500);
  await shot(page, "10-renal-evidence-dark");
  await closeDrawer(page);
  await setTheme(page, "Light");
  await smoothScroll(page, "body", "start");
  await chapter(page, "");
  await caption(page, "Decision support, not a decision", "Every result requires review by a qualified clinician or trial investigator");
  await wait(page, 4000);
  await caption(page, "");
  await wait(page, 600);
}

async function mobileShots(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/login`);
    await page.getByRole("button", { name: /Use the demo account/ }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.getByText("Recent assessments").waitFor();
    for (const b of await page.getByRole("button", { name: "Dismiss notification" }).all()) await b.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, "11-mobile-dashboard-dark.png") });
    await page.getByRole("link", { name: /Synthetic patient A - age 69, eGFR 28 in SYN-RENAL-001 \(severe/ }).first().click();
    await page.locator("#summary-h").waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS, "12-mobile-results-dark.png") });
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------- main

function toMp4(webm, mp4) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: "inherit" });
  if (r.error || r.status !== 0) {
    console.warn(`MP4 conversion skipped (${r.error ? r.error.message : `ffmpeg exit ${r.status}`}). The WebM recording is still available.`);
    return false;
  }
  return true;
}

async function main() {
  await checkUp(`${API}/api/health`, "Backend API");
  await checkUp(`${BASE}/login`, "Frontend");
  mkdirSync(SHOTS, { recursive: true });
  const videoTmp = path.join(OUT, ".video-tmp");
  rmSync(videoTmp, { recursive: true, force: true });

  const browser = await chromium.launch({ channel: CHANNEL === "chromium" ? undefined : CHANNEL, headless: !HEADED });
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: videoTmp, size: SIZE }, colorScheme: "light" });
  await context.addInitScript(OVERLAY);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("cte.theme", "light");
    } catch {}
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const started = Date.now();
  let failed = null;
  try {
    for (const [name, scene] of [
      ["login", sceneLogin],
      ["dashboard", sceneDashboard],
      ["themes", sceneThemes],
      ["upload", sceneUpload],
      ["patient", scenePatient],
      ["analysis", sceneAnalysis],
      ["results", sceneResults],
      ["acceptance", sceneAcceptance],
    ]) {
      console.log(`scene: ${name}`);
      await scene(page);
    }
  } catch (err) {
    failed = err;
    console.error(`Demo stopped: ${err.message}`);
    await page.screenshot({ path: path.join(OUT, "failure.png") }).catch(() => {});
  }
  const video = page.video();
  await context.close();
  if (!failed) await mobileShots(browser);
  await browser.close();

  const webm = path.join(OUT, "demo.webm");
  if (video) {
    renameSync(await video.path(), webm);
    rmSync(videoTmp, { recursive: true, force: true });
    const mp4 = path.join(OUT, "demo.mp4");
    const ok = toMp4(webm, mp4);
    console.log(`\nVideo: ${ok && existsSync(mp4) ? mp4 : webm}`);
  }
  console.log(`Screenshots: ${SHOTS}`);
  console.log(`Duration: ${Math.round((Date.now() - started) / 1000)} s`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
