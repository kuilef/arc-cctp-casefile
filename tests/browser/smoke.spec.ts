import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { appendCasefile } from "../../src/casefile";
import { fixture } from "../helpers";
let child: ChildProcess;
let url: string;
test.beforeAll(async () => {
  child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("server_start_timeout")),
      15000,
    );
    child.once("exit", (c) => {
      clearTimeout(timer);
      reject(Error(`server_exit_${c}`));
    });
    child.stdout?.on("data", (d) => {
      const match = String(d).match(/CASEFILE_URL=(http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
});
test.afterAll(() => {
  child?.kill();
});
test("offline replay exposes stages, fee, downloads and history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("button", { name: "Replay fixture" }).click();
  await expect(page.locator("#notice")).toContainText("SYNTHETIC FIXTURE");
  await expect(page.locator(".badge.observed")).toHaveText("observed");
  await expect(page.locator(".metrics")).toContainText("9999000 units6");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("arc-cctp-casefile.json");
  await page.locator("#sample").selectOption("unobserved");
  await page.getByRole("button", { name: "Replay fixture" }).click();
  await expect(page.locator("#evidence")).toContainText("unobserved");
  await expect(page.locator(".history-row")).toHaveCount(2);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/casefile-ui.png",
    fullPage: true,
  });
});
test("multiple messages do not silently pick first", async ({ page }) => {
  await page.goto(url);
  await page.locator("#sample").selectOption("multi");
  await page.getByRole("button", { name: "Replay fixture" }).click();
  await expect(page.locator("#evidence")).toContainText("selection_required");
  await expect(page.locator("#message-select")).toHaveValue("");
  await page.locator("#message-select").selectOption("1");
  await expect(page.locator(".badge.proven")).toHaveText("proven");
  await expect(page.locator(".history-row")).toHaveCount(2);
});
test("local import preserves timestamp and recomputes claims", async ({
  page,
}) => {
  const report = appendCasefile(
    fixture(),
    undefined,
    "2026-10-08T21:00:00.000Z",
  );
  await page.goto(url);
  await page.locator("#import").setInputFiles({
    name: "case.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(report)),
  });
  await expect(page.locator("#history")).toContainText(
    "2026-10-08T21:00:00.000Z",
  );
  await expect(page.locator("#notice")).toContainText("recomputed");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
