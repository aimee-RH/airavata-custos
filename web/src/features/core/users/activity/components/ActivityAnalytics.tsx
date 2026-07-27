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
import { Input } from "@/shared/ui/input";
import { Download } from "lucide-react";
import * as React from "react";
import type { UserActivityAnalytics } from "../schemas";

const ANALYTICS_WINDOW_MAX_DAYS = 365;
const ANALYTICS_WINDOW_PRESETS = [7, 30, 90] as const;

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

function fillTrendWindow(data: UserActivityAnalytics, windowDays: number) {
  const end = new Date(data.generated_at);
  if (Number.isNaN(end.getTime())) return data.trend;

  const points = new Map(data.trend.map((point) => [point.date, point]));
  return Array.from({ length: windowDays }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (windowDays - index - 1));
    const key = date.toISOString().slice(0, 10);
    return points.get(key) ?? { date: key, active_users: 0, login_count: 0 };
  });
}

function LoginTrend({ data, windowDays }: { data: UserActivityAnalytics; windowDays: number }) {
  const trend = fillTrendWindow(data, windowDays);
  const maxValue = Math.max(
    1,
    ...trend.flatMap((point) => [point.login_count, point.active_users]),
  );
  const labelEvery = Math.max(1, Math.ceil(trend.length / 7));
  return (
    <section
      className="rounded-lg border border-border bg-card p-4"
      aria-label={`Login trend for ${windowDays} days`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Daily login trend</h3>
          <p className="text-xs text-muted-foreground">
            Last {windowDays} days · user-local calendar dates
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <ChartLegend color="var(--chart-1)" label="Login sessions" />
          <ChartLegend color="var(--chart-2)" label="Active users" />
        </div>
      </div>
      {data.trend.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
          No login activity in this window.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${Math.max(560, windowDays * 20)}px` }}>
            <div className="grid grid-cols-[24px_1fr] gap-2">
              <div className="flex h-48 flex-col justify-between pt-4 text-right text-[10px] tabular-nums text-muted-foreground">
                <span>{maxValue}</span>
                <span>{Math.round(maxValue / 2)}</span>
                <span>0</span>
              </div>
              <div
                className="relative h-48"
                role="img"
                aria-label="Daily login sessions and active users"
              >
                <div className="absolute inset-x-0 bottom-0 flex h-44 items-end gap-[3px] border-b border-border">
                  {trend.map((point, index) => {
                    const loginHeight =
                      point.login_count === 0
                        ? 0
                        : Math.max(3, (point.login_count / maxValue) * 100);
                    const userHeight =
                      point.active_users === 0
                        ? 0
                        : Math.max(3, (point.active_users / maxValue) * 100);
                    return (
                      <div
                        key={point.date}
                        className="group relative flex h-full min-w-2 flex-1 items-end gap-px group-hover:z-30"
                      >
                        <div
                          className="relative h-0 flex-1 rounded-t-[3px]"
                          style={{ height: `${loginHeight}%`, background: "var(--chart-1)" }}
                          data-series="logins"
                          aria-label={`${point.login_count} login sessions`}
                        >
                          {point.login_count > 0 && (
                            <span
                              className="absolute inset-x-0 -top-4 text-center text-[10px] font-semibold leading-none tabular-nums"
                              style={{ color: "var(--chart-1)" }}
                              data-value-label
                            >
                              {point.login_count}
                            </span>
                          )}
                        </div>
                        <div
                          className="relative h-0 flex-1 rounded-t-[3px]"
                          style={{ height: `${userHeight}%`, background: "var(--chart-2)" }}
                          data-series="active-users"
                          aria-label={`${point.active_users} active users`}
                        >
                          {point.active_users > 0 && (
                            <span
                              className="absolute inset-x-0 -top-4 text-center text-[10px] font-semibold leading-none tabular-nums"
                              style={{ color: "var(--chart-2)" }}
                              data-value-label
                            >
                              {point.active_users}
                            </span>
                          )}
                        </div>
                        <div
                          className={`pointer-events-none absolute top-2 z-40 hidden w-48 rounded-md border border-border bg-popover p-2 text-xs shadow-md group-hover:block ${
                            index < 4
                              ? "left-0"
                              : index >= trend.length - 4
                                ? "right-0"
                                : "left-1/2 -translate-x-1/2"
                          }`}
                          data-login-tooltip
                        >
                          <p className="mb-1.5 text-sm font-medium">{formatTrendDate(point.date)}</p>
                          <p className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 rounded-sm"
                                style={{ background: "var(--chart-1)" }}
                                aria-hidden
                              />
                              Login sessions
                            </span>
                            <span className="font-medium tabular-nums">{point.login_count}</span>
                          </p>
                          <p className="mt-0.5 flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 rounded-sm"
                                style={{ background: "var(--chart-2)" }}
                                aria-hidden
                              />
                              Active users
                            </span>
                            <span className="font-medium tabular-nums">{point.active_users}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="ml-8 flex gap-[3px]">
              {trend.map((point, index) => (
                <div
                  key={point.date}
                  className="min-w-2 flex-1 pt-1 text-center text-[10px] text-muted-foreground"
                >
                  {index % labelEvery === 0 || index === trend.length - 1
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

function formatTrendDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function ChartLegend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function AnalyticsWindowFilter({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  const [custom, setCustom] = React.useState(
    () => !ANALYTICS_WINDOW_PRESETS.some((days) => days === value),
  );
  const [draft, setDraft] = React.useState(String(value));
  const inputRef = React.useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const days = Number(raw);
    if (Number.isInteger(days) && days >= 1 && days <= ANALYTICS_WINDOW_MAX_DAYS) {
      onChange(days);
    } else {
      setDraft(String(value));
    }
  }

  return (
    <fieldset className="flex flex-wrap items-center gap-2" aria-label="Analytics date range">
      {ANALYTICS_WINDOW_PRESETS.map((days) => (
        <Button
          key={days}
          type="button"
          size="sm"
          variant={!custom && days === value ? "default" : "outline"}
          onClick={() => {
            setCustom(false);
            onChange(days);
          }}
        >
          {days}d
        </Button>
      ))}
      <Button
        type="button"
        size="sm"
        variant={custom ? "default" : "outline"}
        aria-pressed={custom}
        onClick={() => {
          setCustom(true);
          setDraft(String(value));
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        Custom
      </Button>
      {custom && (
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            type="number"
            min={1}
            max={ANALYTICS_WINDOW_MAX_DAYS}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commit((event.target as HTMLInputElement).value);
                (event.target as HTMLInputElement).blur();
              }
            }}
            className="h-9 w-20"
            aria-label="Custom analytics days"
          />
          <span className="text-xs text-muted-foreground">days</span>
        </div>
      )}
    </fieldset>
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
  windowDays: number;
  onWindowChange: (days: number) => void;
  subjectName?: string;
  compact?: boolean;
}) {
  const isSystemWide = !subjectName;
  const metricGroups = [
    {
      title: `${data.window_days}-day window`,
      accent: "var(--chart-1)",
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
      accent: "var(--chart-2)",
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
      accent: "var(--chart-3)",
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
  ] as Array<{ title: string; accent: string; metrics: Array<[string, number | null]> }>;

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
            {isSystemWide ? "OIDC users" : "Individual user audit"}
          </div>
          <h2 className={compact ? "text-base font-semibold" : "text-lg font-semibold"}>
            {isSystemWide ? "System-wide engagement" : `${subjectName} engagement`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isSystemWide
              ? "Aggregated login activity across users with an OIDC identity."
              : "Login activity for this user only."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AnalyticsWindowFilter value={windowDays} onChange={onWindowChange} />
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
            className="rounded-lg border border-t-[3px] bg-card p-4"
            style={{ borderTopColor: group.accent }}
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
