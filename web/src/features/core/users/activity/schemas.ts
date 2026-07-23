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
  /** Total number of logins ever recorded. */
  login_count: z.number(),
  /** Number of consecutive days (ending today or yesterday) the user has logged in. */
  consecutive_logins: z.number(),
});
export type UserActivityRow = z.infer<typeof userActivityRowSchema>;

export const userActivityListSchema = z.object({
  items: z
    .array(userActivityRowSchema)
    .nullish()
    .transform((v) => v ?? []),
  total: z.number(),
});
export type UserActivityList = z.infer<typeof userActivityListSchema>;

export type ActivitySortKey = "last_login" | "consecutive_logins" | "login_count" | "name";
export type SortDirection = "asc" | "desc";

/** Visual urgency band for a user's inactivity status. */
export type InactivityBand = "active" | "warning" | "critical" | "never";
