import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { buildGame, createGameServer } from "../../scripts/dev-game.mjs";
import { assertBounds, createArtworkFixture, installFixture, OWNER } from "../../scripts/browser-fixture.mjs";

const output = resolve("games/night-shift/.friendsdk");
const temporary = await mkdtemp(join(tmpdir(), "night-shift-onboarding-"));
let build, server, browser;
try {
  build = await buildGame("games/night-shift", { outdir: join(temporary, "dist") });
  server = createGameServer(build.outdir);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 960, height: 640 }, reducedMotion: "reduce" });
  await context.routeWebSocket("**/*", socket => socket.close());
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fixture = await installFixture(page, origin, { artworkCall: await createArtworkFixture() });
  await page.goto(origin);
  await assertBounds(page);
  const picker = page.getByRole("dialog", { name: "Choose your Friend" });
  await picker.waitFor({ state: "visible" });
  const connectButton = page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ });
  await connectButton.waitFor({ state: "visible" });
  const openingCopy = await page.locator(".rf-frame-menu-body > p:first-child").evaluate(element => getComputedStyle(element, "::after").content);
  assert.match(openingCopy, /Something is wrong with this building tonight/);
  await page.locator(".rf-frame-scrim").screenshot({ path: join(output, "night-shift-connect-960.png") });

  await connectButton.click();
  const friend = page.getByRole("button", { name: /^Friend #7730\b/ });
  await friend.waitFor({ state: "visible" });
  await page.locator(".rf-frame-scrim").screenshot({ path: join(output, "night-shift-connected-960.png") });
  await friend.click();
  const game = page.frameLocator("iframe");
  await game.locator(".ns-title-screen").waitFor({ state: "visible" });
  await game.locator('.ns-friend-portrait[data-friend-id="7730"]').waitFor({ state: "visible" });
  assert.deepEqual(await page.evaluate(() => window.__friendWalletTest.state.accounts), [OWNER]);
  assert(fixture.ownerReads >= 2, "Friend choice must follow real runtime ownership verification.");
  await page.locator(".rf-game-frame").screenshot({ path: join(output, "night-shift-title-960.png") });
  console.log(`PASS onboarding: wallet connected, owned Friend #7730 selected and verified; screenshots in ${output}`);
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await build?.close();
  await rm(temporary, { recursive: true, force: true });
}