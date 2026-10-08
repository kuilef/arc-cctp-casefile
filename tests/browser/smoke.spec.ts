import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { appendCasefile, serializeCasefile } from "../../src/casefile";
import { fixture } from "../helpers";
import { readFile } from "node:fs/promises";
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

test("oversized append preserves the imported prior history and raw evidence", async ({
  page,
}) => {
  const input = JSON.parse(await readFile("fixtures/multi.json", "utf8"));
  input.source.value.providerPadding = "x".repeat(600_000);
  let report = appendCasefile(input);
  report = appendCasefile(input, report);
  report = appendCasefile(input, report);
  await page.goto(url);
  await page.locator("#import").setInputFiles({
    name: "large-history.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeCasefile(report)),
  });
  await expect(page.locator(".history-row")).toHaveCount(3);
  await page.locator("#message-select").selectOption("1");
  await expect(page.locator("#notice")).toContainText("casefile_byte_limit");
  await expect(page.locator(".history-row")).toHaveCount(3);
  const pending = page.waitForEvent("download");
  await page.locator("#json").click();
  const stream = await (await pending).createReadStream();
  if (!stream) throw Error("Missing download stream");
  let output = "";
  for await (const chunk of stream) output += chunk.toString();
  const saved = JSON.parse(output);
  expect(saved.observations).toHaveLength(3);
  expect(saved.observations[0].recordedAt).toBe(
    report.observations[0].recordedAt,
  );
  expect(
    saved.observations.every(
      (o: any) =>
        o.origin === "imported-unverified" &&
        o.input.source.value.providerPadding.length === 600_000,
    ),
  ).toBe(true);
});

test("imported live claims remain visibly unverified after explicit selection and export", async ({
  page,
}) => {
  const input = JSON.parse(await readFile("fixtures/multi.json", "utf8"));
  input.mode = "live";
  const report = appendCasefile(input);
  (report.observations[0] as any).origin = "live-collected";
  await page.goto(url);
  await page.locator("#import").setInputFiles({
    name: "untrusted-live.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(report)),
  });
  await expect(page.locator("#notice")).toContainText("IMPORTED UNVERIFIED");
  await page.locator("#message-select").selectOption("1");
  await expect(page.locator("#notice")).toContainText("IMPORTED UNVERIFIED");
  await expect(page.locator("#notice")).not.toContainText(
    "PUBLIC PROVIDER OBSERVATION",
  );
  await expect(page.locator("#history")).toContainText("imported-unverified");
  const pending = page.waitForEvent("download");
  await page.locator("#json").click();
  const download = await pending;
  const stream = await download.createReadStream();
  if (!stream) throw Error("Missing download stream");
  let output = "";
  for await (const chunk of stream) output += chunk.toString();
  const exported = JSON.parse(output);
  expect(exported.observations).toHaveLength(2);
  expect(
    exported.observations.every((o: any) => o.origin === "imported-unverified"),
  ).toBe(true);
});
