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

test("activity dashboard, filters, pagination and drawer", async ({ page }) => {
  await signInAs(page, "admin");
  await page.goto("/admin/users/activity");
  await expect(page.getByText("1–10 of 225")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("11–20 of 225")).toBeVisible();
  await page.getByLabel("Filter users by status").selectOption("dormant");
  await expect(page.getByText("1–10 of 75")).toBeVisible();
  await page
    .getByRole("group", { name: "Activity window", exact: true })
    .getByRole("button", { name: "7 days", exact: true })
    .click();
  await expect(page.getByText("1–10 of 125")).toBeVisible();
  await page.getByLabel("Search users").fill("activity4@example.org");
  await expect(page.getByText("1–1 of 1")).toBeVisible();
  await page.getByRole("button", { name: "View activity for Activity User 004" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Lifetime active days")).toBeVisible();
  await page.getByLabel("Close user activity").click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("users:read alone cannot open activity or fetch its data", async ({ page }) => {
  await signInAs(page, "viewer");
  const activityRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/users/activity")) activityRequests.push(request.url());
  });
  await page.goto("/admin/users/activity");
  await expect(page.getByText("Not permitted.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Activity", exact: true })).not.toBeVisible();
  expect(activityRequests).toEqual([]);
});

test("review screenshot and responsive layout", async ({ page }) => {
  await signInAs(page, "admin");
  await page.setViewportSize({ width: 1440, height: 1700 });
  await page.goto("/admin/users/activity");
  await expect(page.getByText("1–10 of 225")).toBeVisible();
  await page.screenshot({ path: "test-results/user-activity-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeInViewport();
  const contentFits = await page
    .locator("main")
    .evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(contentFits).toBe(true);
  await page.screenshot({ path: "test-results/user-activity-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
