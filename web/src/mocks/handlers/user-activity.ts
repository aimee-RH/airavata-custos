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

import activityFixture from "@/features/core/users/activity/__fixtures__/activity.json";
import { http, HttpResponse } from "msw";

type FixtureRow = (typeof activityFixture.items)[number];

function filteredRows(url: URL): FixtureRow[] {
  const query = (url.searchParams.get("query") ?? "").trim().toLocaleLowerCase();
  const sort = url.searchParams.get("sort") ?? "last_login";
  const direction = url.searchParams.get("direction") === "asc" ? 1 : -1;
  const rows = activityFixture.items.filter(
    (row) =>
      !query ||
      row.name.toLocaleLowerCase().includes(query) ||
      row.email.toLocaleLowerCase().includes(query),
  );
  return rows.toSorted((left, right) => {
    const values: Record<string, [string | number | null, string | number | null]> = {
      name: [left.name, right.name],
      last_login: [left.last_login, right.last_login],
      login_count: [left.login_count, right.login_count],
      login_day_count: [left.login_day_count, right.login_day_count],
      current_streak: [left.current_streak, right.current_streak],
    };
    const [a, b] = values[sort] ?? [left.last_login, right.last_login];
    if (a === b) return left.name.localeCompare(right.name);
    if (a === null) return 1;
    if (b === null) return -1;
    return (a < b ? -1 : 1) * direction;
  });
}

function page<T>(items: T[], url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
}

export const userActivityHandlers = [
  http.get("*/api/v1/users/activity", ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(page(filteredRows(url), url));
  }),

  http.get("*/api/v1/users/inactive", ({ request }) => {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? 7);
    const items = filteredRows(url)
      .filter((row) => row.inactive_days === null || row.inactive_days >= days)
      .toSorted((left, right) => {
        if (left.inactive_days === null) return -1;
        if (right.inactive_days === null) return 1;
        return right.inactive_days - left.inactive_days || left.name.localeCompare(right.name);
      });
    return HttpResponse.json({ ...page(items, url), days });
  }),

  http.get("*/api/v1/users/activity/analytics", ({ request }) => {
    const windowDays = Number(new URL(request.url).searchParams.get("window") ?? 30);
    return HttpResponse.json({
      generated_at: "2026-07-24T12:00:00Z",
      window_days: windowDays,
      total_users: activityFixture.total,
      users_ever_logged_in: 6,
      lifetime_login_count: 306,
      lifetime_active_days: 190,
      active_users: windowDays === 7 ? 3 : 6,
      window_login_count: windowDays === 7 ? 18 : 74,
      window_active_days: windowDays === 7 ? 12 : 45,
      monthly_active_users: 6,
      monthly_login_count: 74,
      monthly_active_days: 45,
      average_logins_per_active_day: 1.64,
      trend: [
        { date: "2026-07-22", active_users: 2, login_count: 5 },
        { date: "2026-07-23", active_users: 3, login_count: 8 },
        { date: "2026-07-24", active_users: 2, login_count: 5 },
      ],
    });
  }),

  http.get("*/api/v1/users/:id/activity/analytics", ({ params, request }) => {
    const windowDays = Number(new URL(request.url).searchParams.get("window") ?? 30);
    const user = activityFixture.items.find((item) => item.user_id === params.id);
    const lifetimeLogins = user?.login_count ?? 0;
    const lifetimeDays = user?.login_day_count ?? 0;
    const active = lifetimeLogins > 0 ? 1 : 0;
    return HttpResponse.json({
      generated_at: "2026-07-24T12:00:00Z",
      window_days: windowDays,
      total_users: user ? 1 : 0,
      users_ever_logged_in: active,
      lifetime_login_count: lifetimeLogins,
      lifetime_active_days: lifetimeDays,
      active_users: active,
      window_login_count: Math.min(lifetimeLogins, windowDays),
      window_active_days: Math.min(lifetimeDays, windowDays),
      monthly_active_users: active,
      monthly_login_count: Math.min(lifetimeLogins, 30),
      monthly_active_days: Math.min(lifetimeDays, 30),
      average_logins_per_active_day: user?.average_logins_per_active_day ?? null,
      trend: active ? [{ date: "2026-07-23", active_users: 1, login_count: 2 }] : [],
    });
  }),
];
