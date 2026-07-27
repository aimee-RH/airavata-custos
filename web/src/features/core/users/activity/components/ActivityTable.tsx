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
import { Input } from "@/shared/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Flame } from "lucide-react";
import * as React from "react";
import { formatLastLogin, sortActivityRows } from "../lib";
import type { ActivitySortKey, SortDirection, UserActivityRow } from "../schemas";

type Column = {
  key: ActivitySortKey;
  label: string;
};

const COLUMNS: Column[] = [
  { key: "name", label: "Name" },
  { key: "last_login", label: "Last Login" },
  { key: "login_count", label: "Total Logins" },
  { key: "current_streak", label: "Login Streak" },
];

function ActivityStatus({ row }: { row: UserActivityRow }) {
  if (row.last_login === null) {
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        Never logged in
      </span>
    );
  }
  if (row.inactive_days !== null && row.inactive_days >= 7) {
    return (
      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        Inactive {row.inactive_days}d
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
      Active
    </span>
  );
}

function SortIcon({
  column,
  sortKey,
  direction,
}: {
  column: ActivitySortKey;
  sortKey: ActivitySortKey;
  direction: SortDirection;
}) {
  if (column !== sortKey) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" aria-hidden />;
  return direction === "asc" ? (
    <ArrowUp className="ml-1 h-3 w-3" aria-hidden />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3" aria-hidden />
  );
}

export function ActivityTable({
  rows,
  now,
  search: controlledSearch,
  sortKey: controlledSortKey,
  sortDir: controlledSortDir,
  page = 1,
  pageSize = Math.max(1, rows.length),
  total = rows.length,
  onSearchChange,
  onSortChange,
  onPageChange = () => undefined,
  onViewAnalytics,
}: {
  rows: UserActivityRow[];
  now: Date;
  inactiveDays?: number;
  search?: string;
  sortKey?: ActivitySortKey;
  sortDir?: SortDirection;
  page?: number;
  pageSize?: number;
  total?: number;
  onSearchChange?: (value: string) => void;
  onSortChange?: (key: ActivitySortKey, direction: SortDirection) => void;
  onPageChange?: (page: number) => void;
  onViewAnalytics?: (user: UserActivityRow) => void;
}) {
  const [localSearch, setLocalSearch] = React.useState("");
  const [localSortKey, setLocalSortKey] = React.useState<ActivitySortKey>("last_login");
  const [localSortDir, setLocalSortDir] = React.useState<SortDirection>("desc");
  const search = controlledSearch ?? localSearch;
  const sortKey = controlledSortKey ?? localSortKey;
  const sortDir = controlledSortDir ?? localSortDir;

  function handleSort(key: ActivitySortKey) {
    if (key === sortKey) {
      const next = sortDir === "asc" ? "desc" : "asc";
      if (onSortChange) onSortChange(key, next);
      else setLocalSortDir(next);
    } else if (onSortChange) {
      onSortChange(key, "asc");
    } else {
      setLocalSortKey(key);
      setLocalSortDir("asc");
    }
  }

  const serverControlled = Boolean(onSearchChange || onSortChange);
  const displayedRows = React.useMemo(() => {
    if (serverControlled) return rows;
    const normalized = search.trim().toLowerCase();
    const filtered = normalized
      ? rows.filter(
          (row) =>
            row.name.toLowerCase().includes(normalized) ||
            row.email.toLowerCase().includes(normalized),
        )
      : rows;
    return sortActivityRows(filtered, sortKey, sortDir, now);
  }, [serverControlled, rows, search, sortKey, sortDir, now]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) =>
          onSearchChange ? onSearchChange(e.target.value) : setLocalSearch(e.target.value)
        }
        className="max-w-xs"
        aria-label="Search users"
      />

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    "cursor-pointer select-none whitespace-nowrap",
                    sortKey === col.key && "text-foreground",
                  )}
                  aria-sort={
                    sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  <span className="inline-flex items-center">
                    {col.label}
                    <SortIcon column={col.key} sortKey={sortKey} direction={sortDir} />
                  </span>
                </TableHead>
              ))}
              <TableHead>Status</TableHead>
              {onViewAnalytics ? <TableHead className="text-right">Audit</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMNS.length + 1 + (onViewAnalytics ? 1 : 0)}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No user activity to display.
                </TableCell>
              </TableRow>
            ) : (
              displayedRows.map((row) => {
                const streak = serverControlled ? row.current_streak : row.consecutive_logins;
                return (
                  <TableRow key={row.user_id}>
                    {/* Name */}
                    <TableCell>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    </TableCell>

                    {/* Last Login */}
                    <TableCell className="text-sm">
                      {row.last_login === null ? (
                        <span className="text-muted-foreground">Never</span>
                      ) : (
                        formatLastLogin(row.last_login, now)
                      )}
                    </TableCell>

                    <TableCell className="text-sm">{row.login_count}</TableCell>
                    <TableCell>
                      {streak > 0 ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium">
                          <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden />
                          {streak}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ActivityStatus row={row} />
                    </TableCell>
                    {onViewAnalytics ? (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewAnalytics(row)}
                          aria-label={`View analytics for ${row.name}`}
                        >
                          <BarChart3 className="mr-1.5 h-4 w-4" aria-hidden />
                          View analytics
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total === 0
            ? "No users"
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
