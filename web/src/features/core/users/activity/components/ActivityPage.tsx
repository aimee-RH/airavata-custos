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
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { Search } from "lucide-react";
import * as React from "react";
import { statusMeta } from "../lib";
import { useUserActivity, useUserActivityAnalytics } from "../queries";
import type { ActivitySortKey, ActivityView, SortDirection, UserActivityRow } from "../schemas";
import { LoginTrend, StatusComposition, SummaryCard } from "./ActivityOverview";
import { ActivityTable } from "./ActivityTable";
import { DaysRangePicker } from "./DaysRangePicker";
import { UserActivityDrawer } from "./UserActivityDrawer";

export function ActivityPage() {
  const ability = useAbility();
  if (ability.cannot("read", "UserActivity")) {
    return (
      <ErrorState
        heading="Not permitted"
        message="Only site admins can access User Activity."
      />
    );
  }
  return <ActivityDashboard />;
}
function ActivityDashboard() {
  const [windowDays, setWindowDays] = React.useState(30);
  const [view, setView] = React.useState<ActivityView>("all");
  const [query, setQuery] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [sort, setSort] = React.useState<ActivitySortKey>("last_login");
  const [direction, setDirection] = React.useState<SortDirection>("desc");
  const [selectedUser, setSelectedUser] = React.useState<UserActivityRow | null>(null);
  React.useEffect(() => {
    if (query.trim() === search) return;
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);
  const users = useUserActivity({
    window: windowDays,
    status: view,
    query: search,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    sort,
    direction,
  });
  const analytics = useUserActivityAnalytics(windowDays);
  const data = analytics.data;
  const counts = data
    ? {
        active: data.active_users,
        dormant: data.users_ever_logged_in - data.active_users,
        never: data.total_users - data.users_ever_logged_in,
      }
    : null;
  function changeView(value: ActivityView) {
    setView(value);
    setPage(1);
  }
  return (
    <div className="space-y-4">
      <section aria-labelledby="activity-overview-heading">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="activity-overview-heading" className="font-display text-xl font-semibold">
            User activity overview
          </h2>
          <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
            OIDC-linked identities
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Sign-in activity for every identity in the portal. Pick a status below to filter the audit
          table.
        </p>
      </section>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex flex-wrap items-center gap-3 [&_fieldset>button]:font-bold">
            <span className="font-mono text-xs font-normal uppercase tracking-wide text-muted-foreground">
              Activity window
            </span>
            <DaysRangePicker
              value={windowDays}
              onChange={(days) => {
                setWindowDays(days);
                setPage(1);
                setSelectedUser(null);
              }}
              label="Activity window"
            />
          </div>
          <p className="max-w-sm text-xs text-muted-foreground">
            A user counts as{" "}
            <span className="font-medium text-[color:var(--custos-green-700)]">Active</span> if they
            signed in within this window. Every number, chart and row on this page follows it.
          </p>
        </CardContent>
      </Card>
      {analytics.isPending ? (
        <Skeleton aria-label="Loading activity overview" className="h-64 w-full" />
      ) : analytics.error ? (
        <ErrorState
          message="We couldn't load user activity summaries."
          onRetry={() => analytics.refetch()}
        />
      ) : data && counts ? (
        <>
          <fieldset
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="User activity summaries"
          >
            <SummaryCard
              title="All identities"
              value={data.total_users}
              detail="Provisioned through OIDC"
              color="var(--custos-blue-500)"
              selected={view === "all"}
              onClick={() => changeView("all")}
            />
            {(Object.keys(counts) as (keyof typeof counts)[]).map((status) => (
              <SummaryCard
                key={status}
                title={statusMeta[status].label}
                value={counts[status]}
                percent={
                  data.total_users ? Math.round((counts[status] / data.total_users) * 100) : 0
                }
                detail={
                  status === "active"
                    ? `Signed in the last ${windowDays} days`
                    : status === "dormant"
                      ? `No sign-in for ${windowDays}+ days`
                      : "Invited, no first sign-in"
                }
                color={statusMeta[status].color}
                selected={view === status}
                onClick={() => changeView(status)}
              />
            ))}
          </fieldset>
          <StatusComposition counts={counts} />
          <LoginTrend analytics={data} />
        </>
      ) : null}
      <Card className="gap-0" aria-labelledby="activity-audit-heading">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b pb-4">
          <CardTitle>
            <div className="flex items-baseline gap-2">
              <h2 id="activity-audit-heading" className="font-display text-lg font-semibold">
                User activity audit
              </h2>
              <span className="text-xs font-normal text-muted-foreground">
                {users.error
                  ? "Activity unavailable"
                  : users.data
                    ? `${users.data.total} of ${data?.total_users ?? users.data.total} identities`
                    : "Loading identities"}
              </span>
            </div>
          </CardTitle>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Filter users by status"
              value={view}
              onChange={(event) => changeView(event.target.value as ActivityView)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="dormant">Dormant</option>
              <option value="never">Never signed in</option>
            </select>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or email"
                aria-label="Search users"
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {users.isPending || query.trim() !== search ? (
            <Skeleton aria-label="Loading activity table" className="h-64 w-full" />
          ) : users.error ? (
            <ErrorState
              message="We couldn't load the selected users."
              onRetry={() => users.refetch()}
            />
          ) : users.data ? (
            <ActivityTable
              rows={users.data.items}
              total={users.data.total}
              windowDays={windowDays}
              page={page}
              pageSize={pageSize}
              sort={sort}
              direction={direction}
              onSort={(key) => {
                setSort(key);
                setDirection(sort === key && direction === "asc" ? "desc" : "asc");
                setPage(1);
              }}
              onPage={setPage}
              onPageSize={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              onSelect={setSelectedUser}
            />
          ) : null}
        </CardContent>
      </Card>
      {selectedUser ? (
        <UserActivityDrawer
          key={`${selectedUser.user_id}-${windowDays}`}
          user={selectedUser}
          initialWindow={windowDays}
          onClose={() => setSelectedUser(null)}
        />
      ) : null}
    </div>
  );
}
