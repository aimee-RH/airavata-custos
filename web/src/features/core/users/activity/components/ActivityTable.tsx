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
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { activityStatus, formatCount, formatLastLogin, formatLastLoginDate } from "../lib";
import type { ActivitySortKey, SortDirection, UserActivityRow } from "../schemas";
import { ActivityStatus } from "./ActivityStatus";

export function ActivityTable({
  rows,
  windowDays,
  page,
  pageSize,
  total,
  sort,
  direction,
  onSort,
  onPage,
  onPageSize,
  onSelect,
}: {
  rows: UserActivityRow[];
  windowDays: number;
  page: number;
  pageSize: number;
  total: number;
  sort: ActivitySortKey;
  direction: SortDirection;
  onSort: (key: ActivitySortKey) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onSelect: (user: UserActivityRow) => void;
}) {
  function sortHeader(key: ActivitySortKey, label: string, align?: "right") {
    const isSorted = sort === key;
    return (
      <th
        scope="col"
        aria-sort={isSorted ? (direction === "asc" ? "ascending" : "descending") : "none"}
        className={cn("px-4 py-3 font-medium", align === "right" && "text-right")}
      >
        <button
          type="button"
          onClick={() => onSort(key)}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            align === "right" && "flex-row-reverse",
          )}
        >
          <span>{label}</span>
          {isSorted ? (
            direction === "asc" ? (
              <ChevronUp className="h-3.5 w-3.5 text-foreground" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-foreground" aria-hidden />
            )
          ) : null}
        </button>
      </th>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">User login activity</caption>
          <thead className="bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              {sortHeader("name", "User")}
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              {sortHeader("last_login", "Last sign-in")}
              <th scope="col" className="px-4 py-3 text-right font-medium">
                In window
              </th>
              {sortHeader("login_count", "All time", "right")}
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No users match this view.
                </td>
              </tr>
            ) : (
              rows.map((user) => {
                const status = activityStatus(user, windowDays);
                const action = status === "dormant" ? "Review access" : "View";
                const actionLabel =
                  status === "dormant"
                    ? `Review access for ${user.name}`
                    : `View activity for ${user.name}`;
                const windowCount = formatCount(user.window_login_count);
                const lifetimeCount = formatCount(user.login_count);
                return (
                  <tr key={user.user_id} className="border-t border-border/60 bg-card">
                    <td className="px-4 py-3 align-middle">
                      <span className="block font-medium text-brand">{user.name}</span>
                      <span className="block text-xs text-muted-foreground">{user.email}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <ActivityStatus user={user} windowDays={windowDays} />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="block">{formatLastLogin(user)}</span>
                      <span className="block font-mono text-xs text-muted-foreground tabular-nums">
                        {formatLastLoginDate(user)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right align-middle tabular-nums">
                      {windowCount ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right align-middle tabular-nums text-muted-foreground">
                      {lifetimeCount ?? <span>—</span>}
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onSelect(user)}
                        aria-label={actionLabel}
                      >
                        {action}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border/60 bg-card px-4 py-3 text-xs text-muted-foreground">
        <span>{total === 0 ? "Showing 0–0 of 0" : `Showing ${start}–${end} of ${total}`}</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <div className="relative">
              <select
                className="h-8 appearance-none rounded-md border border-border bg-background pl-2 pr-8 text-xs"
                aria-label="Rows per page"
                value={pageSize}
                onChange={(event) => onPageSize(Number(event.target.value))}
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >
              Previous
            </Button>
            <span
              aria-current="page"
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-primary px-3 text-[0.8rem] font-semibold text-primary-foreground"
            >
              {page}
            </span>
            <span className="text-muted-foreground">of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
