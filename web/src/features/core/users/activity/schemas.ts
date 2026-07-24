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

import { z } from "zod";

export const userActivityRowSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  email: z.string(),
  /** ISO-8601 timestamp of the most recent login, or null if the user has never logged in. */
  last_login: z.string().nullable(),
  effective_timezone: z.string().default("UTC"),
  last_login_local_date: z.string().nullable().default(null),
  /** User-local calendar days since the last login; null when the user never logged in. */
  inactive_days: z.number().nullable().default(null),
  /** Total number of unique login sessions ever recorded. */
  login_count: z.number(),
  /** Total number of distinct user-local login dates. */
  login_day_count: z.number().default(0),
  /** Current streak, or zero after more than one missed local date. */
  current_streak: z.number().default(0),
  /** Deprecated compatibility alias used until the Phase 3 table migration. */
  consecutive_logins: z.number(),
  average_logins_per_active_day: z.number().nullable().default(null),
});
export type UserActivityRow = z.infer<typeof userActivityRowSchema>;

export const userActivityListSchema = z.object({
  items: z
    .array(userActivityRowSchema)
    .nullish()
    .transform((v) => v ?? []),
  total: z.number(),
  limit: z.number().default(50),
  offset: z.number().default(0),
});
export type UserActivityList = z.infer<typeof userActivityListSchema>;

export const inactiveUserListSchema = userActivityListSchema.extend({ days: z.number() });
export type InactiveUserList = z.infer<typeof inactiveUserListSchema>;

export type ActivitySortKey =
  | "last_login"
  | "login_count"
  | "login_day_count"
  | "current_streak"
  | "name";
export type SortDirection = "asc" | "desc";

export const activityTrendPointSchema = z.object({
  date: z.string(),
  active_users: z.number(),
  login_count: z.number(),
});

export const userActivityAnalyticsSchema = z.object({
  generated_at: z.string(),
  window_days: z.number(),
  total_users: z.number(),
  users_ever_logged_in: z.number(),
  lifetime_login_count: z.number(),
  lifetime_active_days: z.number(),
  active_users: z.number(),
  window_login_count: z.number(),
  window_active_days: z.number(),
  monthly_active_users: z.number(),
  monthly_login_count: z.number(),
  monthly_active_days: z.number(),
  average_logins_per_active_day: z.number().nullable(),
  trend: z.array(activityTrendPointSchema),
});
export type UserActivityAnalytics = z.infer<typeof userActivityAnalyticsSchema>;

/** Visual urgency band for a user's inactivity status. */
export type InactivityBand = "active" | "warning" | "critical" | "never";
