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
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { inactivityBand } from "../lib";
import type { UserActivityRow } from "../schemas";

const BAND_STYLES: Record<string, string> = {
  never:    "border-l-4 border-l-destructive bg-destructive/5",
  critical: "border-l-4 border-l-destructive bg-destructive/5",
  warning:  "border-l-4 border-l-amber-500 bg-amber-500/5",
};

const BADGE_STYLES: Record<string, string> = {
  never:    "bg-destructive/15 text-destructive",
  critical: "bg-destructive/15 text-destructive",
  warning:  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

/** Number of rows shown before the "Show more" toggle appears. */
const COLLAPSE_THRESHOLD = 5;

export function InactiveUsersPanel({
  inactiveUsers,
  inactiveDays,
  total = inactiveUsers.length,
  hasMore = false,
  isLoadingMore = false,
  onShowMore,
}: {
  inactiveUsers: UserActivityRow[];
  inactiveDays: number;
  total?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onShowMore?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  if (total === 0) return null;
  const localMode = onShowMore === undefined && total === inactiveUsers.length;
  const localHasMore = localMode && inactiveUsers.length > COLLAPSE_THRESHOLD;
  const effectiveHasMore = hasMore || localHasMore;
  const visible = localHasMore && !expanded ? inactiveUsers.slice(0, COLLAPSE_THRESHOLD) : inactiveUsers;
  const hiddenCount = localMode ? Math.max(0, inactiveUsers.length - COLLAPSE_THRESHOLD) : Math.max(0, total - inactiveUsers.length);

  return (
    <section
      aria-label="Inactive users"
      className="rounded-lg border border-border bg-card p-4 space-y-3"
    >
      <header className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
        <h2 className="text-sm font-semibold">
          Inactive Users
          <span className="ml-1.5 font-normal text-muted-foreground text-xs">
            (≥ {inactiveDays}d)
          </span>
        </h2>
        <span
          aria-label={`${total} inactive users`}
          className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground"
        >
          {total}
        </span>
      </header>

      <ul className="space-y-2">
        {visible.map((user) => {
          const days = user.inactive_days;
          const band = inactivityBand(days);

          return (
            <li
              key={user.user_id}
              data-band={band}
              className={cn(
                "flex items-center justify-between rounded px-3 py-2 text-sm",
                BAND_STYLES[band] ?? "",
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <span
                className={cn(
                  "ml-4 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  BADGE_STYLES[band] ?? "",
                )}
              >
                {band === "never" ? "Never logged in" : `${days} days ago`}
              </span>
            </li>
          );
        })}
      </ul>

      {effectiveHasMore && (
        <button
          type="button"
          onClick={localMode ? () => setExpanded((value) => !value) : onShowMore}
          className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          disabled={isLoadingMore}
        >
          {localMode && expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
          {isLoadingMore ? "Loading…" : localMode && expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </section>
  );
}
