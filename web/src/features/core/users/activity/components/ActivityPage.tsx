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
import { ClockAlert, UserRoundX, Users } from "lucide-react";
import * as React from "react";
import { useInactiveUsers, useUserActivity, useUserActivityAnalytics } from "../queries";
import type { ActivitySortKey, SortDirection, UserActivityRow } from "../schemas";
import { ActivityAnalytics } from "./ActivityAnalytics";
import { ActivityTable } from "./ActivityTable";
import { UserAnalyticsDrawer } from "./UserAnalyticsDrawer";

const PAGE_SIZE = 10;
const INACTIVE_DAYS = 7;
type ActivityView = "all" | "inactive" | "never";

export function ActivityPage() {
  const ability = useAbility();
  const now = React.useMemo(() => new Date(), []);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [sort, setSort] = React.useState<ActivitySortKey>("last_login");
  const [direction, setDirection] = React.useState<SortDirection>("desc");
  const [page, setPage] = React.useState(1);
  const [view, setView] = React.useState<ActivityView>("all");
  const [analyticsWindow, setAnalyticsWindow] = React.useState(30);
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
  const inactiveSummary = useInactiveUsers({
    days: INACTIVE_DAYS,
    limit: 1,
    offset: 0,
  });
  const filteredActivity = useInactiveUsers(
    {
      days: INACTIVE_DAYS,
      never: view === "never" || undefined,
      query: debouncedQuery || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      sort,
      direction,
    },
    view !== "all",
  );
  const analytics = useUserActivityAnalytics(analyticsWindow);
  const tableQuery = view === "all" ? activity : filteredActivity;

  function changeView(next: ActivityView) {
    setView(next);
    setPage(1);
  }

  if (ability.cannot("read", "UserActivity")) return <ErrorState message="Not permitted." />;
  if (activity.isLoading || inactiveSummary.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (activity.error || inactiveSummary.error) {
    return (
      <ErrorState
        message="We couldn't load user activity."
        onRetry={() => {
          activity.refetch();
          inactiveSummary.refetch();
        }}
      />
    );
  }

  const tableData = tableQuery.data;
  const summaryCards = [
    {
      view: "all" as const,
      label: "All users",
      count: analytics.data?.total_users ?? activity.data?.total ?? 0,
      detail: "Complete activity history",
      icon: Users,
      accent: "border-t-primary",
    },
    {
      view: "inactive" as const,
      label: "Inactive users",
      count: inactiveSummary.data?.total ?? 0,
      detail: "No login for 7+ days",
      icon: ClockAlert,
      accent: "border-t-amber-500",
    },
    {
      view: "never" as const,
      label: "Never logged in",
      count: analytics.data
        ? analytics.data.total_users - analytics.data.users_ever_logged_in
        : null,
      detail: "Accounts with no login",
      icon: UserRoundX,
      accent: "border-t-destructive",
    },
  ];

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
          windowDays={analytics.data.window_days}
          onWindowChange={setAnalyticsWindow}
        />
      ) : null}

      <section className="space-y-3" aria-labelledby="user-activity-heading">
        <div>
          <h2 id="user-activity-heading" className="text-lg font-semibold">
            User activity
          </h2>
          <p className="text-sm text-muted-foreground">
            Select a summary to filter the audit table.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            const selected = view === card.view;
            return (
              <button
                key={card.view}
                type="button"
                aria-pressed={selected}
                onClick={() => changeView(card.view)}
                className={`rounded-lg border border-t-[3px] bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${card.accent} ${
                  selected ? "bg-accent/40 shadow-sm" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{card.label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {card.count ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
                  </div>
                  <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {tableQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : tableQuery.error ? (
        <ErrorState
          message="We couldn't load the selected users."
          onRetry={() => tableQuery.refetch()}
        />
      ) : (
        <ActivityTable
          rows={tableData?.items ?? []}
          now={now}
          search={query}
          sortKey={sort}
          sortDir={direction}
          page={page}
          pageSize={PAGE_SIZE}
          total={tableData?.total ?? 0}
          onSearchChange={setQuery}
          onSortChange={(key, nextDirection) => {
            setSort(key);
            setDirection(nextDirection);
            setPage(1);
          }}
          onPageChange={setPage}
          onViewAnalytics={setSelectedUser}
        />
      )}
      <UserAnalyticsDrawer
        user={selectedUser}
        onOpenChange={(open) => {
          if (!open) setSelectedUser(null);
        }}
      />
    </div>
  );
}
