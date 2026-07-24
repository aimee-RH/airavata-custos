// Licensed to the Apache Software Foundation (ASF) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The ASF licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { expect, test } from "@playwright/test";
import { signInAs } from "./fixtures/auth";

// Use serial mode so each test gets a fresh page and the session cookie
// injected by signInAs is not shared across concurrent browser contexts.
test.describe.configure({ mode: "serial" });

test.describe("User Activity page", () => {
  test("Activity tab is visible in Users & Permissions nav", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/admin/users/management");
    await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();
  });

  test("navigating to /admin/users/activity renders the page heading", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/admin/users/activity");
    await expect(page.getByRole("heading", { name: "Users & Permissions" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("columnheader", { name: /name/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /last login/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /streak/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /total logins/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /active days/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /avg \/ active day/i })).toBeVisible();
  });

  test("shows users from the mock fixture", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/admin/users/activity");
    await expect(page.getByText("Alice Chen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Frank Lee")).toBeVisible();
    await expect(page.getByRole("table").getByText("Eve Johnson")).toBeVisible();
  });

  test("inactive users panel appears for users with no recent login", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/admin/users/activity");
    await expect(page.locator("section[aria-label='Inactive users']")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("never-logged-in users show 'Never logged in' badge", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/admin/users/activity");
    await expect(page.getByText(/never logged in/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("search filters the table", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/admin/users/activity");
    await expect(page.getByText("Alice Chen")).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder(/search/i).fill("frank");
    await expect(page.getByText("Frank Lee")).toBeVisible();
    await expect(page.getByText("Alice Chen")).toBeHidden();
  });

  test("analytics exposes complete metrics and switches windows", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/admin/users/activity");
    const analytics = page.getByRole("region", { name: "System-wide user engagement analytics" });
    await expect(analytics).toBeVisible({ timeout: 15_000 });
    await expect(analytics.getByRole("region", { name: "30-day window" })).toContainText("45");
    await expect(analytics.getByRole("region", { name: "Current month" })).toContainText("74");
    await expect(analytics.getByRole("region", { name: "Lifetime" })).toContainText("306");
    await expect(analytics).toContainText("All Custos users");
    await expect(analytics.getByRole("region", { name: "Login trend for 30 days" })).toContainText(
      "Daily login trend",
    );
    await analytics.getByRole("button", { name: "7d" }).click();
    await expect(analytics.getByRole("region", { name: "7-day window" })).toContainText("18");
  });

  test("admin can drill down into one user's engagement audit", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/admin/users/activity");
    await page.getByRole("button", { name: "View analytics for Alice Chen" }).click();
    await expect(page.getByText("User engagement audit")).toBeVisible();
    const audit = page.getByRole("region", { name: "Alice Chen engagement analytics" });
    await expect(audit).toContainText("Individual user audit");
    await expect(audit).toContainText("Login activity for this user only");
  });

  test("custom inactivity threshold supports the backend maximum", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/admin/users/activity");
    await page.getByRole("button", { name: "Custom" }).click();
    const input = page.getByLabel("Custom inactivity days");
    await expect(input).toHaveAttribute("max", "3650");
    await input.fill("3650");
    await input.press("Enter");
    await expect(page.getByText("(≥ 3650d)")).toBeVisible();
  });

  test("clicking a column header sorts the table", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/admin/users/activity");
    await expect(page.getByText("Alice Chen")).toBeVisible({ timeout: 15_000 });

    // Click "Name" → ascending alphabetical order.
    await page.getByRole("columnheader", { name: /name/i }).click();
    await expect(page.getByRole("cell").first()).toContainText("Alice");

    // Click again → descending; Alice should not be first.
    await page.getByRole("columnheader", { name: /name/i }).click();
    await expect(page.getByRole("cell").first()).not.toContainText("Alice");
  });
});
