import assert from "node:assert/strict";
import { resolve } from "node:path";
import { testGame } from "../../scripts/testing.mjs";
import { project } from "../../dist/friend-world.js";

const readStat = async (game, index) => Number((await game.locator(".ns-stat-label strong").nth(index).innerText()).replace(/\D/g, ""));

async function verifyPlay({ page, game, friendId }) {
  assert.equal(friendId, 7730n, "The test harness should pass its selected fixture ID unchanged.");
  assert.equal(await page.getByRole("button", { name: "Choose Friend" }).innerText(), "Friend #7730", "The SDK picker selection must be the runtime Friend.");
  assert.deepEqual(await page.evaluate(() => window.__friendWalletTest.state.accounts), ["0x1111111111111111111111111111111111111111"], "The browser fixture must connect the wallet before Friend selection.");
  await game.locator('.ns-friend-portrait[data-friend-id="7730"]').waitFor({ state: "visible" });
  assert.match(await game.getByText("Friend #7730", { exact: true }).first().innerText(), /7730/);
  await game.locator(".ns-title-screen").screenshot({ path: resolve("games/night-shift/.friendsdk/night-shift-title-960.png") });

  await game.getByRole("button", { name: "Start shift" }).click();
  const canvas = game.locator(".ns-map-stage canvas");
  await canvas.waitFor({ state: "visible" });
  await canvas.evaluate(element => element.focus());
  const startY = await canvas.getAttribute("data-y");
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(180);
  await page.keyboard.up("ArrowUp");
  const keyboardY = await canvas.getAttribute("data-y");
  assert.notEqual(keyboardY, startY, "Arrow-key movement must move the SDK Friend actor.");

  const pause = game.getByRole("button", { name: "Pause and settings" });
  await pause.click();
  const settings = game.getByRole("dialog");
  const reducedMotion = settings.getByRole("checkbox", { name: /Reduced motion/ });
  assert.equal(await reducedMotion.isChecked(), true, "The test browser requests reduced motion.");
  await reducedMotion.click();
  assert.equal(await reducedMotion.isChecked(), false);
  await reducedMotion.click();
  assert.equal(await reducedMotion.isChecked(), true);
  await settings.getByRole("button", { name: "Enable sound" }).click();
  await settings.getByRole("button", { name: "Mute sound" }).click();
  await settings.getByRole("button", { name: "Resume shift", exact: true }).click();

  const touchBefore = await canvas.getAttribute("data-y");
  await game.getByRole("button", { name: "Move up" }).click();
  await page.waitForTimeout(220);
  assert.notEqual(await canvas.getAttribute("data-y"), touchBefore, "On-screen directional control must move the Friend.");

  await pause.click();
  await game.getByRole("dialog").getByRole("button", { name: "Restart shift" }).click();

  const doorPrompt = game.getByRole("button", { name: /Main door/ });
  await doorPrompt.waitFor({ state: "visible" });
  await doorPrompt.click();
  await game.getByRole("button", { name: /Stay away from the door/ }).click();
  assert.equal(await readStat(game, 0), 92, "The careful choice consumes meaningful Energy.");
  assert.equal(await readStat(game, 1), 100, "Safety clamps at 100 after the first choice.");
  await game.locator(".ns-stat-delta").getByText("ENERGY −8", { exact: true }).waitFor();
  await game.getByText("Your Friend keeps a safe distance. The knocking fades into the rain.", { exact: true }).waitFor();
  await game.getByText("The lights go out", { exact: true }).waitFor();

  await game.getByRole("button", { name: "Pause and settings" }).click();
  await game.getByRole("dialog").getByRole("button", { name: "Restart shift" }).click();
  await game.getByRole("button", { name: /Main door/ }).click();
  await game.getByRole("button", { name: /Ask who is there/ }).click();
  assert.equal(await readStat(game, 0), 98, "The risky response preserves more Energy than the careful choice.");
  assert.equal(await readStat(game, 1), 78, "The risky response sharply reduces Safety.");
  assert.equal(await readStat(game, 2), 8, "The risky response changes Suspicion differently from the careful choice.");
  await game.getByText("Your Friend calls out. The knocks answer from somewhere inside.", { exact: true }).waitFor();
  await game.getByText("The lights go out", { exact: true }).waitFor();

  await game.getByRole("button", { name: "Pause and settings" }).click();
  await game.getByRole("dialog").getByRole("button", { name: "Restart shift" }).click();
  await canvas.waitFor({ state: "visible" });
  await game.getByText("INCIDENT 01", { exact: false }).waitFor();
  await game.getByRole("button", { name: /Main door/ }).click();
  await game.getByRole("button", { name: /Stay away from the door/ }).waitFor({ state: "visible" });
  const walkToStation = async (worldPoint, label) => {
    const box = await canvas.boundingBox();
    assert(box, "The SDK world canvas must have a visible interactive area.");
    const [screenX, screenY] = project(...worldPoint);
    await canvas.click({ position: {
      x: Math.max(1, Math.min(box.width - 1, (screenX - 320) * box.width / 960)),
      y: Math.max(1, Math.min(box.height - 1, (screenY - 330) * box.height / 640)),
    } });
    const prompt = game.getByRole("button", { name: new RegExp(label, "i") });
    try { await prompt.waitFor({ state: "visible", timeout: 12_000 }); }
    catch (error) {
      console.error("Could not reach station", label, "from world position", await canvas.evaluate(element => ({ x: element.getAttribute("data-x"), y: element.getAttribute("data-y") })));
      throw error;
    }
    await prompt.click();
  };

  const targetPositions = {
    door: [[475, 205], "Main door"], desk: [[165, 140], "Night desk"],
    monitor: [[410, 130], "Security monitor"], phone: [[190, 250], "Desk phone"],
    storage: [[405, 330], "Storage room"],
  };
  const answerIncident = async (station, choiceName) => {
    const [point, label] = targetPositions[station];
    const prompt = game.getByRole("button", { name: new RegExp(label, "i") });
    if (await prompt.isVisible().catch(() => false)) await prompt.click();
    else await walkToStation(point, label);
    await game.getByRole("button", { name: new RegExp(choiceName, "i") }).click();
  };

  // Loud responses protect the Friend physically but draw enough attention to fail by Suspicion.
  await game.getByRole("button", { name: /Ask who is there/ }).click();
  await game.getByText("The lights go out", { exact: true }).waitFor();
  await answerIncident("desk", "Wait in the dark");
  await game.getByText("Movement on camera", { exact: true }).waitFor();
  await answerIncident("monitor", "Switch off the monitor");
  await game.getByText("The phone rings", { exact: true }).waitFor();
  await answerIncident("phone", "Answer the phone");
  await game.getByText("A noise in storage", { exact: true }).waitFor();
  await answerIncident("storage", "Secure the storage door");
  await game.getByText("A figure in the hallway", { exact: true }).waitFor();
  await answerIncident("monitor", "Sound the alarm");
  await game.getByText("The room answers back", { exact: true }).waitFor();
  await answerIncident("storage", "Call for backup");
  await game.getByRole("heading", { name: "They know you're here." }).waitFor();
  await game.getByText("FINAL STATS", { exact: true }).waitFor();
  assert.equal(await game.getByText("SHIFT FAILED", { exact: true }).count(), 1);
  await game.locator(".ns-result-screen.is-loss").screenshot({ path: resolve("games/night-shift/.friendsdk/night-shift-failed-960.png") });

  // Intrusive solo actions must fail because Safety reaches zero before Suspicion does.
  await game.getByRole("button", { name: "Try again" }).click();
  await game.getByText("INCIDENT 01", { exact: false }).waitFor();
  await answerIncident("door", "Ask who is there");
  await game.getByText("The lights go out", { exact: true }).waitFor();
  await answerIncident("desk", "Wait in the dark");
  await game.getByText("Movement on camera", { exact: true }).waitFor();
  await answerIncident("monitor", "Switch off the monitor");
  await game.getByText("The phone rings", { exact: true }).waitFor();
  await answerIncident("phone", "Answer the phone");
  await game.getByText("A noise in storage", { exact: true }).waitFor();
  await answerIncident("storage", "Look inside");
  await game.getByText("A figure in the hallway", { exact: true }).waitFor();
  await answerIncident("monitor", "Keep watching");
  await game.getByText("The room answers back", { exact: true }).waitFor();
  await answerIncident("storage", "Check the room alone");
  await game.getByRole("heading", { name: "Something got inside before you could react." }).waitFor();
  await game.locator(".ns-result-screen.is-loss").screenshot({ path: resolve("games/night-shift/.friendsdk/night-shift-safety-failed-960.png") });

  // Deliberate, careful but exhausting work can also end in a stat-driven Energy failure.
  await game.getByRole("button", { name: "Try again" }).click();
  await game.getByText("INCIDENT 01", { exact: false }).waitFor();
  await answerIncident("door", "Stay away from the door");
  await game.getByText("The lights go out", { exact: true }).waitFor();
  await answerIncident("desk", "Switch on the desk lamp");
  await game.getByText("Movement on camera", { exact: true }).waitFor();
  await answerIncident("monitor", "Review the camera feed");
  await game.getByText("The phone rings", { exact: true }).waitFor();
  await answerIncident("phone", "Answer the phone");
  await game.getByText("A noise in storage", { exact: true }).waitFor();
  await answerIncident("storage", "Secure the storage door");
  await game.getByText("A figure in the hallway", { exact: true }).waitFor();
  await answerIncident("monitor", "Sound the alarm");
  await game.getByText("The room answers back", { exact: true }).waitFor();
  await answerIncident("storage", "Call for backup");
  await game.getByText("First light", { exact: true }).waitFor();
  await answerIncident("desk", "Log the final report");
  await game.getByRole("heading", { name: "You couldn't stay awake until morning." }).waitFor();
  await game.locator(".ns-result-screen.is-loss").screenshot({ path: resolve("games/night-shift/.friendsdk/night-shift-energy-failed-960.png") });

  // Retry and use the measured recovery choices to survive every incident.
  await game.getByRole("button", { name: "Try again" }).click();
  await game.getByText("INCIDENT 01", { exact: false }).waitFor();
  await answerIncident("door", "Stay away from the door");
  await game.getByText("The lights go out", { exact: true }).waitFor();
  await answerIncident("desk", "Switch on the desk lamp");
  await game.getByText("Movement on camera", { exact: true }).waitFor();
  await answerIncident("monitor", "Review the camera feed");
  await game.getByText("The phone rings", { exact: true }).waitFor();
  await answerIncident("phone", "Let it ring out");
  await game.getByText("A noise in storage", { exact: true }).waitFor();
  await answerIncident("storage", "Secure the storage door");
  await game.getByText("A figure in the hallway", { exact: true }).waitFor();
  await answerIncident("monitor", "Sound the alarm");
  await game.getByText("The room answers back", { exact: true }).waitFor();
  await answerIncident("storage", "Call for backup");
  await game.getByText("First light", { exact: true }).waitFor();
  await answerIncident("desk", "Log the final report");
  await game.getByRole("heading", { name: "You made it through the night." }).waitFor();
  await game.getByText("06:00 AM", { exact: true }).waitFor();
  await game.getByText("FINAL STATS", { exact: true }).waitFor();
  await game.locator(".ns-result-screen.is-win").screenshot({ path: resolve("games/night-shift/.friendsdk/night-shift-complete-960.png") });
  await game.getByRole("button", { name: "Work another shift" }).click();
  await game.getByText("INCIDENT 01", { exact: false }).waitFor();
}

const screenshot = resolve(process.argv[2] ?? "games/night-shift/.friendsdk/night-shift-960.png");
const result = await testGame("games/night-shift", { width: 960, height: 640, screenshot, check: verifyPlay });
console.log(`PASS interactive Night Shift: Friend #${result.friendId}, ${result.width}px; screenshot ${result.screenshot}`);