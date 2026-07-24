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

import { describe, expect, it } from "vitest";
import {
  computeDaysSince,
  inactivityBand,
  sortActivityRows,
  filterInactiveUsers,
  INACTIVITY_THRESHOLD_DAYS,
} from "../lib";
import type { UserActivityRow } from "../schemas";

const NOW = new Date("2026-07-23T12:00:00Z");

function row(overrides: Partial<UserActivityRow> = {}): UserActivityRow {
  return {
    user_id: "u1",
    name: "Alice Example",
    email: "alice@example.org",
    last_login: "2026-07-20T08:00:00Z",
    effective_timezone: "UTC",
    last_login_local_date: "2026-07-20",
    inactive_days: 3,
    login_count: 10,
    login_day_count: 5,
    current_streak: 3,
    consecutive_logins: 3,
    average_logins_per_active_day: 2,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// computeDaysSince
// ─────────────────────────────────────────────
describe("computeDaysSince", () => {
  it("returns 0 when the login was today", () => {
    expect(computeDaysSince("2026-07-23T00:01:00Z", NOW)).toBe(0);
  });

  it("returns 1 when the login was more than 24 hours ago but less than 48 hours ago", () => {
    // NOW is 2026-07-23T12:00Z; a login at 2026-07-22T11:00Z is ~25 hours ago → floor = 1
    expect(computeDaysSince("2026-07-22T11:00:00Z", NOW)).toBe(1);
  });

  it("returns the floor of full days elapsed", () => {
    expect(computeDaysSince("2026-07-16T12:00:00Z", NOW)).toBe(7);
  });

  it("handles a login timestamp in the future (clock skew) as 0", () => {
    expect(computeDaysSince("2026-07-25T00:00:00Z", NOW)).toBe(0);
  });

  it("returns null when last_login is null (never logged in)", () => {
    expect(computeDaysSince(null, NOW)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// inactivityBand
// ─────────────────────────────────────────────
describe("inactivityBand", () => {
  it("'active' when logged in today (0 days)", () => {
    expect(inactivityBand(0)).toBe("active");
  });

  it("'active' for 6 days since login", () => {
    expect(inactivityBand(6)).toBe("active");
  });

  it("'warning' at exactly the threshold (7 days)", () => {
    expect(inactivityBand(INACTIVITY_THRESHOLD_DAYS)).toBe("warning");
  });

  it("'warning' for 13 days since login", () => {
    expect(inactivityBand(13)).toBe("warning");
  });

  it("'critical' at 14 days since login", () => {
    expect(inactivityBand(14)).toBe("critical");
  });

  it("'critical' for very long absence (365 days)", () => {
    expect(inactivityBand(365)).toBe("critical");
  });

  it("'never' when days is null (user has never logged in)", () => {
    expect(inactivityBand(null)).toBe("never");
  });
});

// ─────────────────────────────────────────────
// filterInactiveUsers
// ─────────────────────────────────────────────
describe("filterInactiveUsers", () => {
  const active = row({ user_id: "u-active", last_login: "2026-07-22T10:00:00Z" }); // 1 day ago
  const warning = row({ user_id: "u-warning", last_login: "2026-07-13T10:00:00Z" }); // 10 days ago
  const critical = row({ user_id: "u-critical", last_login: "2026-07-01T10:00:00Z" }); // 22 days ago
  const never = row({ user_id: "u-never", last_login: null });

  const all = [active, warning, critical, never];

  it("excludes users who logged in recently", () => {
    const result = filterInactiveUsers(all, NOW);
    expect(result.find((r) => r.user_id === "u-active")).toBeUndefined();
  });

  it("includes users past the 7-day threshold", () => {
    const result = filterInactiveUsers(all, NOW);
    expect(result.find((r) => r.user_id === "u-warning")).toBeDefined();
    expect(result.find((r) => r.user_id === "u-critical")).toBeDefined();
  });

  it("includes users who have never logged in", () => {
    const result = filterInactiveUsers(all, NOW);
    expect(result.find((r) => r.user_id === "u-never")).toBeDefined();
  });

  it("returns empty array when everyone is active", () => {
    expect(filterInactiveUsers([active], NOW)).toHaveLength(0);
  });

  it("returns empty array on empty input", () => {
    expect(filterInactiveUsers([], NOW)).toHaveLength(0);
  });

  it("sorts result: never-logged-in first, then longest inactive first", () => {
    const result = filterInactiveUsers(all, NOW);
    // 'never' comes first, then critical (22 days), then warning (10 days)
    expect(result[0]?.user_id).toBe("u-never");
    expect(result[1]?.user_id).toBe("u-critical");
    expect(result[2]?.user_id).toBe("u-warning");
  });
});

// ─────────────────────────────────────────────
// sortActivityRows
// ─────────────────────────────────────────────
describe("sortActivityRows", () => {
  const rowA = row({ user_id: "u-a", name: "Alice", last_login: "2026-07-22T00:00:00Z", login_count: 50, consecutive_logins: 5 });
  const rowB = row({ user_id: "u-b", name: "Bob",   last_login: "2026-07-10T00:00:00Z", login_count: 30, consecutive_logins: 2 });
  const rowC = row({ user_id: "u-c", name: "Carol", last_login: null,                   login_count: 0,  consecutive_logins: 0 });

  const all = [rowB, rowC, rowA]; // deliberately shuffled

  it("sorts by last_login descending by default (most recent first)", () => {
    const sorted = sortActivityRows(all, "last_login", "desc", NOW);
    expect(sorted.map((r) => r.user_id)).toEqual(["u-a", "u-b", "u-c"]);
  });

  it("sorts by last_login ascending (oldest first, null last)", () => {
    const sorted = sortActivityRows(all, "last_login", "asc", NOW);
    // null (never logged in) sorts to the end in asc order
    expect(sorted[sorted.length - 1]?.user_id).toBe("u-c");
    expect(sorted[0]?.user_id).toBe("u-b");
  });

  it("sorts by consecutive_logins descending", () => {
    const sorted = sortActivityRows(all, "current_streak", "desc", NOW);
    expect(sorted[0]?.user_id).toBe("u-a");
    expect(sorted[1]?.user_id).toBe("u-b");
  });

  it("sorts by login_count descending", () => {
    const sorted = sortActivityRows(all, "login_count", "desc", NOW);
    expect(sorted[0]?.user_id).toBe("u-a");
    expect(sorted[1]?.user_id).toBe("u-b");
    expect(sorted[2]?.user_id).toBe("u-c");
  });

  it("sorts by name ascending (alphabetical)", () => {
    const sorted = sortActivityRows(all, "name", "asc", NOW);
    expect(sorted.map((r) => r.name)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("sorts by name descending", () => {
    const sorted = sortActivityRows(all, "name", "desc", NOW);
    expect(sorted.map((r) => r.name)).toEqual(["Carol", "Bob", "Alice"]);
  });

  it("two users with equal last_login break tie by name ascending", () => {
    const r1 = row({ user_id: "u-z", name: "Zoe",  last_login: "2026-07-20T00:00:00Z" });
    const r2 = row({ user_id: "u-m", name: "Mark", last_login: "2026-07-20T00:00:00Z" });
    const sorted = sortActivityRows([r1, r2], "last_login", "desc", NOW);
    expect(sorted[0]?.name).toBe("Mark");
    expect(sorted[1]?.name).toBe("Zoe");
  });

  it("returns empty array on empty input", () => {
    expect(sortActivityRows([], "last_login", "desc", NOW)).toHaveLength(0);
  });
});
