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
import { Button } from "@/shared/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatLastLogin } from "../lib";
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
  function sortHeader(key: ActivitySortKey, label: string) {
    return (
      <TableHead
        aria-sort={sort === key ? (direction === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded focus-visible:outline focus-visible:outline-2"
          onClick={() => onSort(key)}
        >
          {label}
          {sort === key ? (
            direction === "asc" ? (
              <ArrowUp size={12} aria-hidden />
            ) : (
              <ArrowDown size={12} aria-hidden />
            )
          ) : null}
        </button>
      </TableHead>
    );
  }
  return (
    <>
      <Table>
        <caption className="sr-only">User login activity</caption>
        <TableHeader>
          <TableRow>
            {sortHeader("name", "User")}
            <TableHead>Status</TableHead>
            {sortHeader("last_login", "Last sign-in")}
            <TableHead className="text-right">In window</TableHead>
            {sortHeader("login_count", "All time")}
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                No users match this view.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((user) => (
              <TableRow key={user.user_id}>
                <TableCell>
                  <p className="font-medium text-brand">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </TableCell>
                <TableCell>
                  <ActivityStatus user={user} windowDays={windowDays} />
                </TableCell>
                <TableCell>
                  <span className="block">{formatLastLogin(user)}</span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {user.last_login
                      ? `${new Date(user.last_login).toISOString().replace("T", " ").slice(0, 16)} UTC`
                      : "No recorded sign-in"}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{user.window_login_count}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {user.login_count}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSelect(user)}
                    aria-label={`View activity for ${user.name}`}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
        <span>
          {total === 0
            ? "No users"
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <label>
            Rows{" "}
            <select
              className="rounded border bg-background p-1"
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
            </select>
          </label>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * pageSize >= total}
            onClick={() => onPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
