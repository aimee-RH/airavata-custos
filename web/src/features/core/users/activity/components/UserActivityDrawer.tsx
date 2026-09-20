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
import { ErrorState } from "@/shared/ui/ErrorState";
import { KpiCard } from "@/shared/ui/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/ui/drawer";
import { Skeleton } from "@/shared/ui/skeleton";
import { Activity, CalendarDays, Flame, LogIn, X } from "lucide-react";
import * as React from "react";
import { formatLastLogin } from "../lib";
import { useUserActivityAnalytics } from "../queries";
import type { UserActivityRow } from "../schemas";
import { DailyLoginActivity } from "./ActivityOverview";
import { ActivityStatus } from "./ActivityStatus";
import { DaysRangePicker } from "./DaysRangePicker";

export function UserActivityDrawer({
  user,
  initialWindow,
  onClose,
}: {
  user: UserActivityRow;
  initialWindow: number;
  onClose: () => void;
}) {
  const [windowDays, setWindowDays] = React.useState(initialWindow);
  const analytics = useUserActivityAnalytics(windowDays, user.user_id);
  const last7 = useUserActivityAnalytics(7, user.user_id);
  const last30 = useUserActivityAnalytics(30, user.user_id);
  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      direction="right"
    >
      <DrawerContent className="w-[min(94vw,760px)] overflow-y-auto sm:max-w-[760px]">
        <DrawerHeader className="border-b pr-16">
          <DrawerTitle>User engagement audit</DrawerTitle>
          <DrawerDescription>
            {user.name} · {user.email}
          </DrawerDescription>
          <DrawerClose
            aria-label="Close user activity"
            className="absolute right-4 top-4 rounded-md p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DrawerClose>
        </DrawerHeader>
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl font-semibold">{user.name}</p>
              <p className="text-sm text-muted-foreground">Individual login analytics</p>
            </div>
            <ActivityStatus user={user} windowDays={initialWindow} />
          </div>
          {analytics.isPending ? (
            <Skeleton aria-label="Loading individual activity" className="h-64 w-full" />
          ) : analytics.error ? (
            <ErrorState
              message="We couldn't load this user's activity."
              onRetry={() => analytics.refetch()}
            />
          ) : analytics.data ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiCard title="Last login" value={formatLastLogin(user)} icon={CalendarDays} />
                <KpiCard
                  title={`Logins · ${windowDays}d`}
                  value={analytics.data.window_login_count}
                  icon={LogIn}
                />
                <KpiCard
                  title="Active days"
                  value={analytics.data.window_active_days}
                  icon={Activity}
                />
                <KpiCard
                  title="Current login streak"
                  value={`${user.current_streak}d`}
                  icon={Flame}
                />
              </div>
              <Card>
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>Daily login activity</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Login sessions for this user
                      </p>
                    </div>
                    <DaysRangePicker
                      value={windowDays}
                      onChange={setWindowDays}
                      label="User analytics date range"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <DailyLoginActivity
                    analytics={analytics.data}
                    userName={user.name}
                    neverLoggedIn={user.last_login === null}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Activity summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 text-sm tabular-nums">
                    <dt className="text-muted-foreground">Last 7 days</dt>
                    <dd>{last7.data ? `${last7.data.window_login_count} logins` : "—"}</dd>
                    <dt className="text-muted-foreground">Last 30 days</dt>
                    <dd>{last30.data ? `${last30.data.window_login_count} logins` : "—"}</dd>
                    <dt className="text-muted-foreground">Lifetime</dt>
                    <dd>{analytics.data.lifetime_login_count} logins</dd>
                    <dt className="text-muted-foreground">Dashboard activity window</dt>
                    <dd>{initialWindow} days</dd>
                  </dl>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
