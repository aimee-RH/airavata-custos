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

import type { UserActivityAnalytics, UserActivityRow } from "./schemas";

export function activityStatus(user: UserActivityRow, windowDays: number) {
  if (user.last_login === null) return "never";
  if (user.inactive_days === null) return "unknown";
  return user.inactive_days < windowDays ? "active" : "dormant";
}
export function formatLastLogin(user: UserActivityRow) {
  if (user.last_login === null) return "Never";
  if (user.inactive_days === null) return "Date unavailable";
  if (user.inactive_days <= 0) return "Today";
  if (user.inactive_days === 1) return "Yesterday";
  return `${user.inactive_days} days ago`;
}
export const statusMeta = {
  active: { label: "Active", color: "var(--custos-green-500)" },
  dormant: { label: "Dormant", color: "var(--custos-amber-500)" },
  never: { label: "Never signed in", color: "var(--custos-red-500)" },
} as const;

/** Fill calendar-date gaps without interpreting user-local bucket labels in the browser timezone. */
export function completeActivityTrend(analytics: UserActivityAnalytics) {
  const points = new Map(analytics.trend.map((point) => [point.date, point]));
  const end = new Date(analytics.generated_at);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - analytics.window_days + 1);
  // Mixed user timezones can produce boundary dates outside the nominal UTC window.
  // Preserve every server bucket instead of clipping real activity at either edge.
  for (const point of analytics.trend) {
    const date = new Date(`${point.date}T00:00:00Z`);
    if (date < start) start.setTime(date.getTime());
    if (date > end) end.setTime(date.getTime());
  }
  const result: UserActivityAnalytics["trend"] = [];
  for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    result.push(points.get(date) ?? { date, active_users: 0, login_count: 0 });
  }
  return result;
}
