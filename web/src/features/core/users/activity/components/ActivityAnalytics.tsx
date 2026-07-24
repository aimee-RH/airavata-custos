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
import { Download } from "lucide-react";
import type { UserActivityAnalytics } from "../schemas";

type WindowDays = 7 | 30 | 90;

function escapeCSV(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function analyticsCSV(data: UserActivityAnalytics): string {
  const summary: Array<[string, string | number | null]> = [
    ["window_days", data.window_days],
    ["total_users", data.total_users],
    ["users_ever_logged_in", data.users_ever_logged_in],
    ["active_users", data.active_users],
    ["window_login_count", data.window_login_count],
    ["window_active_days", data.window_active_days],
    ["average_logins_per_active_day", data.average_logins_per_active_day],
    ["monthly_active_users", data.monthly_active_users],
    ["monthly_login_count", data.monthly_login_count],
    ["monthly_active_days", data.monthly_active_days],
    ["lifetime_login_count", data.lifetime_login_count],
    ["lifetime_active_days", data.lifetime_active_days],
  ];
  const rows: Array<Array<string | number | null>> = [
    ["summary_metric", "value"],
    ...summary,
    [],
    ["date", "active_users", "login_count"],
    ...data.trend.map((point) => [point.date, point.active_users, point.login_count]),
  ];
  return rows.map((row) => row.map(escapeCSV).join(",")).join("\n");
}

function exportCSV(data: UserActivityAnalytics, subjectName?: string) {
  const blob = new Blob([analyticsCSV(data)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const subject = subjectName
    ? subjectName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")
    : "all-users";
  anchor.download = `user-activity-${subject}-${data.window_days}d.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">
        {value === null
          ? "—"
          : label === "Avg / active day"
            ? value.toFixed(2)
            : value.toLocaleString()}
      </p>
    </div>
  );
}

function LoginTrend({ data, windowDays }: { data: UserActivityAnalytics; windowDays: WindowDays }) {
  const maxLogins = Math.max(1, ...data.trend.map((point) => point.login_count));
  const labelEvery = Math.max(1, Math.ceil(data.trend.length / 7));
  return (
    <section
      className="rounded-lg border bg-card p-4"
      aria-label={`Login trend for ${windowDays} days`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Daily login trend</h3>
          <p className="text-xs text-muted-foreground">
            Login sessions by user-local calendar date
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
            Logins
          </span>
          <span>Hover a bar for active-user count</span>
        </div>
      </div>
      {data.trend.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
          No login activity in this window.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="relative flex h-40 items-end gap-1 border-b border-l pl-2" role="img">
              <span className="absolute -left-1 top-0 -translate-x-full text-[10px] text-muted-foreground">
                {maxLogins}
              </span>
              <span className="absolute -left-1 bottom-0 -translate-x-full text-[10px] text-muted-foreground">
                0
              </span>
              {data.trend.map((point) => (
                <div
                  key={point.date}
                  className="group relative flex h-full min-w-2 flex-1 items-end"
                >
                  <div
                    className="w-full rounded-t bg-primary transition-colors hover:bg-primary/80"
                    style={{ height: `${Math.max(3, (point.login_count / maxLogins) * 100)}%` }}
                    title={`${point.date}: ${point.login_count} logins, ${point.active_users} active users`}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1 pl-2">
              {data.trend.map((point, index) => (
                <div
                  key={point.date}
                  className="min-w-2 flex-1 pt-1 text-center text-[10px] text-muted-foreground"
                >
                  {index % labelEvery === 0 || index === data.trend.length - 1
                    ? point.date.slice(5)
                    : ""}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function ActivityAnalytics({
  data,
  windowDays,
  onWindowChange,
  subjectName,
  compact = false,
}: {
  data: UserActivityAnalytics;
  windowDays: WindowDays;
  onWindowChange: (days: WindowDays) => void;
  subjectName?: string;
  compact?: boolean;
}) {
  const isSystemWide = !subjectName;
  const metricGroups = [
    {
      title: `${data.window_days}-day window`,
      metrics: [
        [
          isSystemWide ? "Active users" : "Was active",
          isSystemWide ? data.active_users : data.active_users > 0 ? 1 : 0,
        ],
        ["Logins", data.window_login_count],
        ["Active days", data.window_active_days],
        ["Avg / active day", data.average_logins_per_active_day],
      ],
    },
    {
      title: "Current month",
      metrics: [
        [
          isSystemWide ? "Active users" : "Was active",
          isSystemWide ? data.monthly_active_users : data.monthly_active_users > 0 ? 1 : 0,
        ],
        ["Logins", data.monthly_login_count],
        ["Active days", data.monthly_active_days],
      ],
    },
    {
      title: "Lifetime",
      metrics: isSystemWide
        ? [
            ["Total users", data.total_users],
            ["Ever logged in", data.users_ever_logged_in],
            ["Logins", data.lifetime_login_count],
            ["Active days", data.lifetime_active_days],
          ]
        : [
            ["Logins", data.lifetime_login_count],
            ["Active days", data.lifetime_active_days],
          ],
    },
  ] as Array<{ title: string; metrics: Array<[string, number | null]> }>;

  return (
    <section
      className="space-y-4"
      aria-label={
        isSystemWide
          ? "System-wide user engagement analytics"
          : `${subjectName} engagement analytics`
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {isSystemWide ? "All Custos users" : "Individual user audit"}
          </div>
          <h2 className={compact ? "text-base font-semibold" : "text-lg font-semibold"}>
            {isSystemWide ? "System-wide engagement" : `${subjectName} engagement`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isSystemWide
              ? "Aggregated usage across every user in this Custos deployment—not the signed-in admin."
              : "Login activity for this user only."}
          </p>
        </div>
        <div className="flex gap-2">
          {([7, 30, 90] as const).map((days) => (
            <Button
              key={days}
              type="button"
              size="sm"
              variant={days === windowDays ? "default" : "outline"}
              onClick={() => onWindowChange(days)}
            >
              {days}d
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => exportCSV(data, subjectName)}
          >
            <Download className="mr-1.5 h-4 w-4" aria-hidden /> Export CSV
          </Button>
        </div>
      </header>

      <div className={`grid gap-4 ${compact ? "lg:grid-cols-1" : "xl:grid-cols-3"}`}>
        {metricGroups.map((group) => (
          <section
            key={group.title}
            aria-label={group.title}
            className="rounded-lg border bg-card p-4"
          >
            <h3 className="mb-3 text-sm font-semibold">{group.title}</h3>
            <div className="grid grid-cols-2 gap-3">
              {group.metrics.map(([label, value]) => (
                <Metric key={label} label={label} value={value} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <LoginTrend data={data} windowDays={windowDays} />
    </section>
  );
}
