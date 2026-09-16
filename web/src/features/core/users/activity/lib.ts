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

import type { UserActivityRow } from "./schemas";

export function activityStatus(user: UserActivityRow, windowDays: number) {
  if (user.last_login === null) return "never";
  if (user.inactive_days === null) return "unknown";
  return user.inactive_days < windowDays ? "active" : "dormant";
}
export function formatLastLogin(user: UserActivityRow) {
  if (user.last_login === null) return "Never";
  if (user.inactive_days === null) return "Date unavailable";
  if (user.inactive_days === 0) return "Today";
  if (user.inactive_days === 1) return "Yesterday";
  return `${user.inactive_days} days ago`;
}
export const statusMeta = {
  active: { label: "Active", color: "var(--custos-green-500)" },
  dormant: { label: "Dormant", color: "var(--custos-amber-500)" },
  never: { label: "Never signed in", color: "var(--custos-red-500)" },
} as const;
