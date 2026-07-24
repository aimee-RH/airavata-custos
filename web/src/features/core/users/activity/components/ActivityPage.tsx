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

import { useAbility } from "@/shared/casl/AbilityProvider";
import { ErrorState } from "@/shared/ui/ErrorState";
import { Skeleton } from "@/shared/ui/skeleton";
import * as React from "react";
import { INACTIVITY_THRESHOLD_DAYS } from "../lib";
import { useInactiveUsers, useUserActivity, useUserActivityAnalytics } from "../queries";
import type { ActivitySortKey, SortDirection, UserActivityRow } from "../schemas";
import { ActivityAnalytics } from "./ActivityAnalytics";
import { ActivityTable } from "./ActivityTable";
import { InactiveUsersPanel } from "./InactiveUsersPanel";
import { InactivityFilter } from "./InactivityFilter";
import { UserAnalyticsDrawer } from "./UserAnalyticsDrawer";

const PAGE_SIZE = 25;
const INACTIVE_PAGE_SIZE = 25;

export function ActivityPage() {
  const ability = useAbility();
  const now = React.useMemo(() => new Date(), []);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [sort, setSort] = React.useState<ActivitySortKey>("last_login");
  const [direction, setDirection] = React.useState<SortDirection>("desc");
  const [page, setPage] = React.useState(1);
  const [inactiveDays, setInactiveDays] = React.useState(INACTIVITY_THRESHOLD_DAYS);
  const [analyticsWindow, setAnalyticsWindow] = React.useState<7 | 30 | 90>(30);
  const [selectedUser, setSelectedUser] = React.useState<UserActivityRow | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const activity = useUserActivity({
    query: debouncedQuery,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    sort,
    direction,
  });
  const inactive = useInactiveUsers({
    days: inactiveDays,
    query: debouncedQuery || undefined,
    limit: INACTIVE_PAGE_SIZE,
  });
  const analytics = useUserActivityAnalytics(analyticsWindow);

  if (ability.cannot("read", "UserActivity")) return <ErrorState message="Not permitted." />;
  if (activity.isLoading || inactive.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (activity.error || inactive.error) {
    return (
      <ErrorState
        message="We couldn't load user activity."
        onRetry={() => {
          activity.refetch();
          inactive.refetch();
        }}
      />
    );
  }

  const activityData = activity.data;
  const inactivePages = inactive.data?.pages ?? [];
  const inactiveData = inactivePages[0];
  const inactiveUsers = Array.from(
    new Map(
      inactivePages.flatMap((pageData) => pageData.items).map((user) => [user.user_id, user]),
    ).values(),
  );
  return (
    <div className="space-y-6">
      {analytics.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : analytics.error ? (
        <ErrorState
          message="We couldn't load engagement analytics."
          onRetry={() => analytics.refetch()}
        />
      ) : analytics.data ? (
        <ActivityAnalytics
          data={analytics.data}
          windowDays={analytics.data.window_days as 7 | 30 | 90}
          onWindowChange={setAnalyticsWindow}
        />
      ) : null}
      <div className="flex items-center justify-between">
        <InactivityFilter value={inactiveDays} onChange={setInactiveDays} />
      </div>
      <InactiveUsersPanel
        inactiveUsers={inactiveUsers}
        total={inactiveData?.total ?? 0}
        inactiveDays={inactiveDays}
        hasMore={inactive.hasNextPage}
        isLoadingMore={inactive.isFetchingNextPage}
        onShowMore={() => inactive.fetchNextPage()}
      />
      <ActivityTable
        rows={activityData?.items ?? []}
        now={now}
        search={query}
        sortKey={sort}
        sortDir={direction}
        page={page}
        pageSize={PAGE_SIZE}
        total={activityData?.total ?? 0}
        onSearchChange={setQuery}
        onSortChange={(key, nextDirection) => {
          setSort(key);
          setDirection(nextDirection);
          setPage(1);
        }}
        onPageChange={setPage}
        onViewAnalytics={setSelectedUser}
      />
      <UserAnalyticsDrawer
        user={selectedUser}
        onOpenChange={(open) => {
          if (!open) setSelectedUser(null);
        }}
      />
    </div>
  );
}
