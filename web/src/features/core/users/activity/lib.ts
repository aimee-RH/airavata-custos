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

import type { ActivitySortKey, InactivityBand, SortDirection, UserActivityRow } from "./schemas";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Number of days without login that triggers the "warning" band.
 * Users inactive for exactly this many days are considered warning.
 */
export const INACTIVITY_THRESHOLD_DAYS = 7;

/**
 * Number of days without login that triggers the "critical" band.
 */
export const INACTIVITY_CRITICAL_DAYS = 14;

/**
 * Returns the number of whole days elapsed since `lastLogin`, relative to `now`.
 * Returns null if `lastLogin` is null (user has never logged in).
 * Returns 0 for future timestamps (clock skew).
 */
export function computeDaysSince(lastLogin: string | null, now: Date): number | null {
  if (lastLogin === null) return null;
  const diff = now.getTime() - new Date(lastLogin).getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / DAY_MS);
}

/**
 * Maps a days-since-login value to an urgency band.
 * - null  → "never"   (user has never logged in)
 * - 0–6   → "active"
 * - 7–13  → "warning"
 * - ≥14   → "critical"
 */
export function inactivityBand(daysSince: number | null): InactivityBand {
  if (daysSince === null) return "never";
  if (daysSince < INACTIVITY_THRESHOLD_DAYS) return "active";
  if (daysSince < INACTIVITY_CRITICAL_DAYS) return "warning";
  return "critical";
}

/**
 * Returns only the rows that are considered inactive (warning, critical, or never),
 * sorted with "never" first, then longest inactive first.
 *
 * @param thresholdDays - Users inactive for at least this many days are included.
 *   Defaults to INACTIVITY_THRESHOLD_DAYS. Users who have never logged in are
 *   always included regardless of the threshold.
 */
export function filterInactiveUsers(
  rows: UserActivityRow[],
  now: Date,
  thresholdDays: number = INACTIVITY_THRESHOLD_DAYS,
): UserActivityRow[] {
  return rows
    .filter((r) => {
      const days = computeDaysSince(r.last_login, now);
      // Never-logged-in users are always inactive
      if (days === null) return true;
      return days >= thresholdDays;
    })
    .sort((a, b) => {
      const daysA = computeDaysSince(a.last_login, now);
      const daysB = computeDaysSince(b.last_login, now);
      // null (never) always sorts first
      if (daysA === null && daysB === null) return a.name.localeCompare(b.name);
      if (daysA === null) return -1;
      if (daysB === null) return 1;
      // longest inactive first
      return daysB - daysA;
    });
}

/**
 * Sorts activity rows by the given key and direction.
 * Tie-breaks on name ascending to guarantee a stable order.
 * For last_login sort: null values (never logged in) are placed last in both
 * asc and desc directions.
 */
export function sortActivityRows(
  rows: UserActivityRow[],
  key: ActivitySortKey,
  direction: SortDirection,
  now: Date,
): UserActivityRow[] {
  const mult = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    let cmp = 0;

    switch (key) {
      case "last_login": {
        const daysA = computeDaysSince(a.last_login, now);
        const daysB = computeDaysSince(b.last_login, now);
        // null always sorts to the end regardless of direction
        if (daysA === null && daysB === null) break;
        if (daysA === null) return 1;
        if (daysB === null) return -1;
        // Fewer days = more recent. For desc ("most recent first"), a smaller
        // daysA should sort before a larger daysB, so we invert the subtraction.
        cmp = (daysB - daysA) * mult;
        break;
      }
      case "current_streak":
        cmp = (a.current_streak - b.current_streak) * mult;
        break;
      case "login_day_count":
        cmp = (a.login_day_count - b.login_day_count) * mult;
        break;
      case "login_count":
        cmp = (a.login_count - b.login_count) * mult;
        break;
      case "name":
        cmp = a.name.localeCompare(b.name) * mult;
        break;
    }

    // Stable tie-break: name ascending
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Formats a last_login ISO string into a human-readable relative label.
 * Returns "Today", "Yesterday", "N days ago", or "Never".
 */
export function formatLastLogin(lastLogin: string | null, now: Date): string {
  const days = computeDaysSince(lastLogin, now);
  if (days === null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
