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

"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  type InactiveUserParams,
  type UserActivityParams,
  getInactiveUsers,
  getSelectedUserActivityAnalytics,
  getUserActivity,
  getUserActivityAnalytics,
} from "./api";

export const activityKeys = {
  all: ["user-activity"] as const,
  list: (params: UserActivityParams) => [...activityKeys.all, "list", params] as const,
  inactive: (params: InactiveUserParams) => [...activityKeys.all, "inactive", params] as const,
  analytics: (days: number) => [...activityKeys.all, "analytics", days] as const,
  userAnalytics: (userID: string, days: number) =>
    [...activityKeys.all, "user-analytics", userID, days] as const,
};

const DEFAULTS = {
  staleTime: 60_000,
  gcTime: 300_000,
  refetchOnWindowFocus: false,
  placeholderData: keepPreviousData,
} as const;

export function useUserActivity(params: UserActivityParams = {}) {
  const { status } = useSession();
  return useQuery({
    queryKey: activityKeys.list(params),
    queryFn: () => getUserActivity(params),
    enabled: status === "authenticated",
    ...DEFAULTS,
  });
}

export function useUserActivityAnalytics(windowDays: number) {
  const { status } = useSession();
  return useQuery({
    queryKey: activityKeys.analytics(windowDays),
    queryFn: () => getUserActivityAnalytics(windowDays),
    enabled: status === "authenticated",
    staleTime: DEFAULTS.staleTime,
    gcTime: DEFAULTS.gcTime,
    refetchOnWindowFocus: DEFAULTS.refetchOnWindowFocus,
  });
}

export function useSelectedUserActivityAnalytics(userID: string | null, windowDays: number) {
  const { status } = useSession();
  return useQuery({
    queryKey: activityKeys.userAnalytics(userID ?? "", windowDays),
    queryFn: () => getSelectedUserActivityAnalytics(userID as string, windowDays),
    enabled: status === "authenticated" && userID !== null,
    staleTime: DEFAULTS.staleTime,
    gcTime: DEFAULTS.gcTime,
    refetchOnWindowFocus: DEFAULTS.refetchOnWindowFocus,
  });
}

export function useInactiveUsers(params: InactiveUserParams, enabled = true) {
  const { status } = useSession();
  return useQuery({
    queryKey: activityKeys.inactive(params),
    queryFn: () => getInactiveUsers(params),
    enabled: status === "authenticated" && enabled,
    staleTime: DEFAULTS.staleTime,
    gcTime: DEFAULTS.gcTime,
    refetchOnWindowFocus: DEFAULTS.refetchOnWindowFocus,
    placeholderData: DEFAULTS.placeholderData,
  });
}
