// Records a scripted walkthrough of MentorSlot for the demo video.
// Abena is filmed; Kofi books off-camera to show the double-booking guard.
//
// Output (in OUT): frames/*.jpg from the Chrome DevTools screencast plus
// timeline.json (frame times, captions, freeze moments). e2e/video/build_video.py
// turns that into the finished video.
// Usage: node e2e/record-demo.js [outDir]   (local stack on :4174, see README)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://localhost:4174";
const OUT = process.argv[2] || "/tmp/claude-0/videos/mentorslot";
const ZOOM = 1.25; // laid out like 1536x744, drawn at 1920x930
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;
const timeline = { scale: 1, frames: [], captions: [], freezes: [] };

const CURSOR = `
(() => {
  const Z = ${ZOOM};
  const zoom = () => document.documentElement && (document.documentElement.style.zoom = String(Z));
  zoom();
  const mk = () => {
    zoom();
    if (document.getElementById("__dot")) return;
    const dot = document.createElement("div");
    dot.id = "__dot";
    dot.style.cssText = "position:fixed;left:-50px;top:-50px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.92);border:3px solid #2F5233;z-index:2147483647;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.35);transition:transform .12s";
    document.documentElement.append(dot);
    const pos = JSON.parse(sessionStorage.getItem("__pos") || "null");
    if (pos) { dot.style.left = pos.x / Z + "px"; dot.style.top = pos.y / Z + "px"; }
    addEventListener("mousemove", (e) => { dot.style.left = e.clientX / Z + "px"; dot.style.top = e.clientY / Z + "px"; try { sessionStorage.setItem("__pos", JSON.stringify({ x: e.clientX, y: e.clientY })); } catch {} }, true);
    addEventListener("mousedown", () => (dot.style.transform = "scale(.65)"), true);
    addEventListener("mouseup", () => (dot.style.transform = "scale(1)"), true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mk); else mk();
})();`;

// Optional: serve the Google Fonts the page asks for from local files (for
// machines that can't reach fonts.googleapis.com). FONTS_DIR must hold the
// unpacked @fontsource-variable/fraunces and @fontsource/ibm-plex-sans packages.
async function localGoogleFonts(ctx) {
  const dir = process.env.FONTS_DIR;
  if (!dir) return;
  const find = (pkg, file) => {
    const d = fs.readdirSync(dir).find((x) => x.startsWith(pkg) && !x.endsWith(".tgz"));
    return path.join(dir, d, "package", "files", file);
  };
  const files = {
    "fraunces.woff2": find("fontsource-variable-fraunces", "fraunces-latin-full-normal.woff2"),
    "fraunces-italic.woff2": find("fontsource-variable-fraunces", "fraunces-latin-full-italic.woff2"),
  };
  for (const w of [400, 500, 600, 700]) files[`plex-${w}.woff2`] = find("fontsource-ibm-plex-sans", `ibm-plex-sans-latin-${w}-normal.woff2`);
  const css = [
    `@font-face{font-family:'Fraunces';font-style:normal;font-weight:100 900;src:url(https://fonts.gstatic.com/local/fraunces.woff2) format('woff2')}`,
    `@font-face{font-family:'Fraunces';font-style:italic;font-weight:100 900;src:url(https://fonts.gstatic.com/local/fraunces-italic.woff2) format('woff2')}`,
    ...[400, 500, 600, 700].map((w) => `@font-face{font-family:'IBM Plex Sans';font-style:normal;font-weight:${w};src:url(https://fonts.gstatic.com/local/plex-${w}.woff2) format('woff2')}`),
  ].join("\n");
  await ctx.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: css }));
  await ctx.route("https://fonts.gstatic.com/local/*", (r) => {
    const name = r.request().url().split("/").pop();
    r.fulfill({ contentType: "font/woff2", body: fs.readFileSync(files[name]), headers: { "access-control-allow-origin": "*" } });
  });
}

const cap = (text) => timeline.captions.push({ t: now(), text });

async function moveTo(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
  await sleep(250);
}
async function pointAt(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width - 3, box.y + box.height + 3, { steps: 22 });
  await sleep(250);
}
async function click(page, locator) { await moveTo(page, locator); await locator.click(); }
async function type(page, locator, text) { await moveTo(page, locator); await locator.click(); await locator.pressSequentially(text, { delay: 65 }); }

let freezeN = 0;
async function freeze(page, locator, title, body) {
  await locator.scrollIntoViewIfNeeded();
  await sleep(700);
  const b = await locator.boundingBox();
  const shot = path.join(OUT, `freeze${++freezeN}.png`);
  const t = now();
  await page.screenshot({ path: shot });
  timeline.freezes.push({ t, shot, title, body, box: [b.x, b.y, b.width, b.height] });
  await sleep(500);
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 930 } });
  await ctx.addInitScript(CURSOR);
  await localGoogleFonts(ctx);
  const page = await ctx.newPage();
  const kofiCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const kofi = await kofiCtx.newPage();

  const cdp = await ctx.newCDPSession(page);
  let n = 0;
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = path.join(OUT, "frames", `${String(++n).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    timeline.frames.push({ file, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });

  await page.goto(`${BASE}/`);
  await page.getByRole("link", { name: /Tech & IT/ }).waitFor();
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 930 });
  timeline.start = now();
  await sleep(600);

  // 1. Browse
  cap("Browse mentors by field. No sign-up needed.");
  await sleep(1800);
  await click(page, page.getByRole("link", { name: /Tech & IT/ }));
  await page.getByRole("link", { name: /Kwame Owusu/ }).waitFor();
  cap("Pick a mentor");
  await sleep(1200);
  await click(page, page.getByRole("link", { name: /Kwame Owusu/ }));
  await page.getByRole("group", { name: "Session length" }).waitFor();
  await page.locator(".slot").first().waitFor();

  // 2. Length and day
  cap("Choose a session length and a day");
  await sleep(800);
  const lengths = page.getByRole("group", { name: "Session length" });
  await pointAt(page, page.getByRole("button", { name: /60 min/ }));
  await freeze(page, lengths, "Mentors set their own session lengths",
    "Kwame offers 30- and 45-minute sessions. Lengths he doesn't offer still show, but can't be picked.");
  await click(page, page.getByRole("button", { name: /^45 min/ }));
  await sleep(900);
  const dayTabs = page.getByRole("group", { name: "Day" }).getByRole("button");
  await click(page, dayTabs.nth(1));
  await sleep(900);

  // 3. Pick a slot, but Kofi takes it first
  cap("Pick an open time");
  const grid = page.locator("ul.slot-grid");
  const target = grid.locator("button.slot").nth(2);
  await pointAt(page, target);
  await freeze(page, grid, "Only real openings",
    "Times are worked out live from Kwame's schedule. Anything that clashes with a booking, or falls in the 15-minute gap kept between sessions, never appears.");
  const slotLabel = await target.getAttribute("aria-label");
  const dayLabel = (await dayTabs.nth(1).textContent()).trim();
  await click(page, target);
  await page.getByRole("region", { name: "Confirm your booking" }).waitFor();
  await type(page, page.getByLabel("Your name"), "Abena Mensah");
  await type(page, page.getByLabel("Your email"), "abena@example.com");
  await sleep(500);

  cap("Meanwhile, someone else books that exact time…");
  await kofi.goto(page.url());
  await kofi.getByRole("button", { name: /^45 min/ }).click();
  await kofi.getByRole("group", { name: "Day" }).getByRole("button", { name: dayLabel }).click();
  await kofi.getByRole("button", { name: slotLabel }).click();
  await kofi.getByLabel("Your name").fill("Kofi Asare");
  await kofi.getByLabel("Your email").fill("kofi@example.com");
  await kofi.getByRole("button", { name: "Confirm booking" }).click();
  await kofi.getByText("Confirmed").first().waitFor();
  await sleep(1200);

  cap("Abena confirms a moment later");
  await click(page, page.getByRole("button", { name: "Confirm booking" }));
  const notice = page.locator(".error-banner", { hasText: "refreshed" });
  await notice.waitFor();
  await sleep(800);
  await pointAt(page, notice);
  await freeze(page, notice, "No double bookings, ever",
    "Kofi booked this exact time a moment earlier. The database itself refuses overlapping sessions, so two people can never both win the same slot.");

  // 4. Book another time
  cap("She picks another time. Her details are kept, so she just confirms");
  await page.locator("button.slot").first().waitFor();
  await click(page, grid.locator("button.slot").nth(3));
  await page.getByRole("region", { name: "Confirm your booking" }).waitFor();
  await sleep(1200); // her name and email are still filled in
  await click(page, page.getByRole("button", { name: "Confirm booking" }));
  await page.getByText("Your private link").waitFor().catch(async (e) => { await page.screenshot({ path: OUT + "/fail.png" }); throw e; });
  cap("Booked, with a private link to manage it");
  await sleep(1500);
  const link = page.locator("section.private-link");
  await pointAt(page, page.getByRole("button", { name: /Copy link/ }));
  await freeze(page, link, "No account needed",
    "Instead of a login, every booking gets its own private, signed link. It's shown here and emailed, and it's the only way to view or cancel the booking.");

  // 5. Manage and cancel
  cap("The private link opens the booking: view it or cancel it");
  await click(page, page.getByRole("link", { name: "Manage this booking" }));
  await page.getByRole("button", { name: "Cancel this session" }).waitFor();
  await sleep(1500);
  await click(page, page.getByRole("button", { name: "Cancel this session" }));
  const confirmBox = page.locator(".cancel-confirm");
  await confirmBox.waitFor();
  await pointAt(page, page.getByRole("button", { name: "Yes, cancel session" }));
  await freeze(page, confirmBox, "Cancelling frees the time",
    "Once she confirms, the slot goes straight back into Kwame's open times for someone else to book.");
  await click(page, page.getByRole("button", { name: "Yes, cancel session" }));
  await page.getByRole("heading", { name: "Session cancelled" }).waitFor();
  await sleep(2000);

  // 6. Lost link
  cap("Lost the link? Have it emailed again");
  await click(page, page.getByRole("link", { name: "Find my bookings" }).first());
  await page.getByLabel("Email you booked with").waitFor();
  await type(page, page.getByLabel("Email you booked with"), "abena@example.com");
  await sleep(300);
  await click(page, page.getByRole("button", { name: "Email me my links" }));
  const ok = page.locator(".success-banner");
  await ok.waitFor();
  await pointAt(page, ok);
  await freeze(page, page.locator(".page.page-narrow"), "Links go only to the inbox",
    "The links are sent to that email address, never shown on screen, and the reply is the same whether or not the address has bookings.");
  await sleep(2200);

  timeline.end = now();
  await cdp.send("Page.stopScreencast");
  await sleep(300);
  fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 1));
  await browser.close();
  console.log(`saved ${timeline.frames.length} frames, ${timeline.freezes.length} freezes, ${(timeline.end - timeline.start).toFixed(1)}s`);
})().catch(async (e) => { console.error(e); process.exit(1); });
