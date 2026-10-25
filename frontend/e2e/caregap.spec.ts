import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://127.0.0.1:8000";

test.describe.configure({ mode: "serial" });

async function settle(page: Page, ms = 900) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(ms);
}

async function overviewFromApi(request: APIRequestContext) {
  const response = await request.get(
    `${API}/api/v1/overview?service=primary_care&threshold_minutes=30`,
  );
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("landing page shows a live analysis and no horizontal overflow", async ({ page, request }) => {
  const overview = await overviewFromApi(request);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Put care/ })).toBeVisible();
  await expect(page.getByText("Access scanner")).toBeVisible();
  await expect(page.getByText("Scanning the demo district")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("Synthetic demo district", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/outside threshold/i).first()).toBeVisible();
  await expect(
    page.getByText(overview.summary.coverage_percent.toFixed(1) + "%").first(),
  ).toBeVisible();

  await page.locator("#workspace").scrollIntoViewIfNeeded();
  await expect(page.getByAltText(/CareGap Overview workspace/)).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("overview loads a real map and computed access metrics", async ({ page, request }) => {
  const overview = await overviewFromApi(request);
  await page.goto("/app");
  await page.waitForSelector('[data-map-loaded="true"]', { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Access, mapped to the ward." })).toBeVisible();
  await expect(
    page.getByText(overview.summary.coverage_percent.toFixed(1) + "%").first(),
  ).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.getByText("Access legend")).toBeVisible();
  await expect(page.getByText("Area inspector", { exact: false })).toBeVisible();
  await settle(page);
  await expect(page.locator('[data-map-error="false"]').first()).toBeVisible();
});

test("explore ranks areas, updates the inspector, and exports CSV", async ({ page }) => {
  await page.goto("/app/explore");
  await expect(page.getByText("Ranked population areas")).toBeVisible();
  const table = page.locator("table").filter({ hasText: "Quadrant" }).first();
  await expect(table.locator("tbody tr").first()).toBeVisible();
  const rowCount = await table.locator("tbody tr").count();
  expect(rowCount).toBeGreaterThan(10);

  await page.getByLabel("Search population areas").fill("Ward 93");
  await expect(table.locator("tbody tr").first()).toContainText("Ward 93");
  await table.locator("tbody tr").first().getByRole("button", { name: "Inspect" }).click();
  await expect(page.getByText("AREA INSPECTOR · A093")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export area CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^caregap-access-primary_care-30min\.csv$/);
});

test("simulator places a facility, recalculates the API, and shows before/after", async ({
  page,
  request,
}) => {
  await page.goto("/app/simulator");
  await expect(page.getByText("Scenario setup")).toBeVisible();
  await page.getByRole("button", { name: "Suggested gap" }).click();
  await expect(page.getByText("1 proposed site")).toBeVisible();
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByText("Simulation result")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Proposed", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change", exact: true })).toBeVisible();

  const scenariosResponse = await request.get(`${API}/api/v1/scenarios`);
  expect(scenariosResponse.ok()).toBeTruthy();
  const scenarios = await scenariosResponse.json();
  expect(scenarios.total).toBeGreaterThan(0);
  const latest = scenarios.items[0];

  const simulationResponse = await request.get(
    `${API}/api/v1/scenarios/${latest.id}/simulate`,
  );
  expect(simulationResponse.ok()).toBeTruthy();
  const simulation = await simulationResponse.json();
  expect(simulation.delta.wards_worsened).toBe(0);
  expect(simulation.proposed.coverage_percent).toBeGreaterThanOrEqual(
    simulation.baseline.coverage_percent,
  );

  const formatted = new Intl.NumberFormat("en-IN").format(
    simulation.delta.newly_covered_population,
  );
  await expect(page.getByText(formatted).first()).toBeVisible();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await expect(page.getByText(/Change: newly covered/i)).toBeVisible();
  await page.getByText("Assumptions, warnings, and model limits").click();
  await expect(page.getByText(/Existing facilities remain available/i)).toBeVisible();
});

test("impact analytics recomputes the saved scenario", async ({ page }) => {
  await page.goto("/app/analytics");
  await expect(page.getByText("Newly covered population", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("Saved scenario")).not.toHaveValue("");
  await expect(page.getByText("Worst-served population", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Scenario access surface")).toBeVisible();
  await expect(page.getByText(/Before \/ after summary/i)).toBeVisible();
});

test("recommendations expose ranked, explainable candidates and strategy comparison", async ({
  page,
}) => {
  await page.goto("/app/recommendations");
  await expect(page.getByText("Ranked candidates")).toBeVisible({ timeout: 30_000 });
  const table = page.locator("table").filter({ hasText: "Person-min saved" }).first();
  await expect(table.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByText(/Candidate 01/).first()).toBeVisible();
  await expect(page.getByText("Score components").first()).toBeVisible();
  await expect(page.getByText("Strategy comparison")).toBeVisible();

  await page.getByRole("button", { name: "Maximum coverage" }).click();
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("Ranked candidates")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Maximum coverage").first()).toBeVisible();
});

test("data sources validates an upload and records the import", async ({ page }) => {
  await page.goto("/app/data-sources");
  await expect(page.getByText("Source register")).toBeVisible();
  const filename = `e2e-${Date.now()}.csv`;
  const facilityName = `E2E Clinic ${Date.now()}`;
  await page.setInputFiles("#import-file", {
    name: filename,
    mimeType: "text/csv",
    buffer: Buffer.from(
      `name,facility_type,lon,lat,services\n${facilityName},primary_health_centre,73.860,18.520,primary_care\n`,
    ),
  });
  await page.getByRole("button", { name: /Validate & import/i }).click();
  await expect(page.getByText("Import report")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("completed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(filename)).toBeVisible();
});

test("methodology documents the model invariants and limitations", async ({ page }) => {
  await page.goto("/app/methodology");
  await expect(
    page.getByRole("heading", { name: "A conclusion you can trace." }),
  ).toBeVisible();
  await expect(page.getByText("Mathematical invariant", { exact: true })).toBeVisible();
  await expect(page.getByText("Known limitations", { exact: true })).toBeVisible();
  await expect(page.getByText("Design record", { exact: true })).toBeVisible();
});

test.describe("mobile workspace", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("navigates the workspace without horizontal overflow", async ({ page }) => {
    await page.goto("/app");
    await page.waitForSelector('[data-map-loaded="true"]', { timeout: 30_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Open workspace navigation" }).click();
    await expect(page.getByRole("dialog", { name: "Workspace navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Impact analytics/ })).toBeVisible();
    await page.getByRole("button", { name: "Close workspace navigation" }).click();
    await expect(page.getByRole("dialog", { name: "Workspace navigation" })).toBeHidden();
  });
});
