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

import { apiFetch } from "@/shared/api/client";
import {
  type ActivitySortKey,
  type InactiveUserList,
  type SortDirection,
  type UserActivityAnalytics,
  type UserActivityList,
  inactiveUserListSchema,
  userActivityAnalyticsSchema,
  userActivityListSchema,
} from "./schemas";

export type UserActivityParams = {
  query?: string;
  limit?: number;
  offset?: number;
  sort?: ActivitySortKey;
  direction?: SortDirection;
};

export type InactiveUserParams = {
  days: number;
  query?: string;
  limit?: number;
  offset?: number;
};

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function getUserActivity(params: UserActivityParams): Promise<UserActivityList> {
  const raw = await apiFetch(`/users/activity${queryString(params)}`);
  return userActivityListSchema.parse(raw);
}

export async function getInactiveUsers(params: InactiveUserParams): Promise<InactiveUserList> {
  const raw = await apiFetch(`/users/inactive${queryString(params)}`);
  return inactiveUserListSchema.parse(raw);
}

export async function getUserActivityAnalytics(
  windowDays: 7 | 30 | 90,
): Promise<UserActivityAnalytics> {
  const raw = await apiFetch(`/users/activity/analytics?window=${windowDays}`);
  return userActivityAnalyticsSchema.parse(raw);
}

export async function getSelectedUserActivityAnalytics(
  userID: string,
  windowDays: 7 | 30 | 90,
): Promise<UserActivityAnalytics> {
  const raw = await apiFetch(
    `/users/${encodeURIComponent(userID)}/activity/analytics?window=${windowDays}`,
  );
  return userActivityAnalyticsSchema.parse(raw);
}
