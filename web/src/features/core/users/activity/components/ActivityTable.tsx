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

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/shared/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { formatLastLogin, sortActivityRows } from "../lib";
import type { ActivitySortKey, SortDirection, UserActivityRow } from "../schemas";

type Column = {
  key: ActivitySortKey;
  label: string;
};

const COLUMNS: Column[] = [
  { key: "name",              label: "Name" },
  { key: "last_login",        label: "Last Login" },
  { key: "consecutive_logins", label: "Streak" },
  { key: "login_count",       label: "Total Logins" },
];

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

export function ActivityTable({ rows, now }: { rows: UserActivityRow[]; now: Date }) {
  const [sortKey, setSortKey] = React.useState<ActivitySortKey>("last_login");
  const [sortDir, setSortDir] = React.useState<SortDirection>("desc");
  const [search, setSearch] = React.useState("");

  function handleSort(key: ActivitySortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const sorted = React.useMemo(
    () => sortActivityRows(filtered, sortKey, sortDir, now),
    [filtered, sortKey, sortDir, now],
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
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
                    sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <span className="inline-flex items-center">
                    {col.label}
                    <SortIcon column={col.key} sortKey={sortKey} direction={sortDir} />
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} className="py-10 text-center text-sm text-muted-foreground">
                  No user activity to display.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row) => (
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

                  {/* Streak */}
                  <TableCell>
                    {row.consecutive_logins > 0 ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium">
                        <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden />
                        {row.consecutive_logins}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Total Logins */}
                  <TableCell className="text-sm">{row.login_count}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
