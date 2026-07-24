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

// Live smoke against the dev-ops/compose Keycloak + the backend on :8080.
// Picked up only by playwright.live.config.ts (`.spec.ts` pattern).
test.describe("OIDC smoke", () => {
  test("admin signs in and can read user activity end to end", async ({ page, request }) => {
    // /sign-in auto-redirects to the IdP when there is no ?error= param —
    // no button click needed. We just wait for the Keycloak login page.
    await page.goto("/sign-in");
    await page.waitForURL(/\/realms\/custos\/protocol\/openid-connect\/auth/);
    await page.getByLabel(/username or email/i).fill("admin");
    await page.locator("input#password").fill("admin");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL(
      (url: URL) => !url.pathname.startsWith("/sign-in") && !url.host.includes("8081"),
    );
    await expect(page.getByText("admin@custos.local")).toBeVisible();

    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
      .join("; ");

    // Verify the authenticated caller profile through the Next.js API proxy.
    const meRes = await request.get("/api/v1/me", {
      headers: { cookie: cookieHeader },
    });
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.user.email).toBe("admin@custos.local");

    // Verify the new backend activity endpoint and its frontend-facing contract.
    const activityRes = await request.get("/api/v1/users/activity?limit=200&offset=0", {
      headers: { cookie: cookieHeader },
    });
    expect(activityRes.status()).toBe(200);
    const activityBody = await activityRes.json();
    expect(activityBody.total).toBeGreaterThan(0);
    expect(Array.isArray(activityBody.items)).toBe(true);

    const admin = activityBody.items.find(
      (item: { email: string }) => item.email === "admin@custos.local",
    );
    expect(admin).toMatchObject({ name: "Admin Dev", email: "admin@custos.local" });
    const loginCountAfterSignIn = admin.login_count;
    expect(loginCountAfterSignIn).toBeGreaterThanOrEqual(1);
    expect(admin.consecutive_logins).toBeGreaterThanOrEqual(1);
    expect(admin.last_login).not.toBeNull();

    // Refreshing the portal and making ordinary authenticated API requests
    // must not create a second login fact for the same portal session.
    await page.reload();
    const refreshedActivityRes = await request.get("/api/v1/users/activity?limit=200&offset=0", {
      headers: { cookie: cookieHeader },
    });
    expect(refreshedActivityRes.status()).toBe(200);
    const refreshedActivityBody = await refreshedActivityRes.json();
    const refreshedAdmin = refreshedActivityBody.items.find(
      (item: { email: string }) => item.email === "admin@custos.local",
    );
    expect(refreshedAdmin.login_count).toBe(loginCountAfterSignIn);

    // The active admin must not appear in the dedicated seven-day inactivity result.
    const inactiveRes = await request.get("/api/v1/users/inactive?days=7&limit=200&offset=0", {
      headers: { cookie: cookieHeader },
    });
    expect(inactiveRes.status()).toBe(200);
    const inactiveBody = await inactiveRes.json();
    expect(
      inactiveBody.items.some((item: { email: string }) => item.email === "admin@custos.local"),
    ).toBe(false);

    // Phase 4 analytics must also be available through the authenticated proxy.
    const analyticsRes = await request.get("/api/v1/users/activity/analytics?window=7", {
      headers: { cookie: cookieHeader },
    });
    expect(analyticsRes.status()).toBe(200);
    const analyticsBody = await analyticsRes.json();
    expect(Array.isArray(analyticsBody.trend)).toBe(true);

    // Finally verify that the React activity page consumes the live response.
    await page.goto("/admin/users/activity");
    await expect(page.getByRole("columnheader", { name: /last login/i })).toBeVisible();
    const adminRow = page.getByRole("row").filter({ hasText: "admin@custos.local" });
    await expect(adminRow).toContainText("Admin Dev");
    await expect(adminRow.getByRole("cell", { name: "Today" })).toBeVisible();
  });

  test("operator sees their own account but cannot access user activity", async ({
    page,
    request,
  }) => {
    await page.goto("/sign-in");
    await page.waitForURL(/\/realms\/custos\/protocol\/openid-connect\/auth/);
    await page.getByLabel(/username or email/i).fill("operator");
    await page.locator("input#password").fill("operator");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL(
      (url: URL) => !url.pathname.startsWith("/sign-in") && !url.host.includes("8081"),
    );

    await expect(page.getByText("operator@custos.local")).toBeVisible();
    await expect(page.getByText("admin@custos.local")).toHaveCount(0);

    await page.goto("/admin/users/management");
    await expect(page.getByRole("link", { name: "User Management" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Activity" })).toHaveCount(0);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
      .join("; ");
    const activityRes = await request.get("/api/v1/users/activity", {
      headers: { cookie: cookieHeader },
    });
    expect(activityRes.status()).toBe(403);
  });
});
