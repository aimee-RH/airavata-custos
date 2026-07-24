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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/ui/drawer";
import { Skeleton } from "@/shared/ui/skeleton";
import * as React from "react";
import { useSelectedUserActivityAnalytics } from "../queries";
import type { UserActivityRow } from "../schemas";
import { ActivityAnalytics } from "./ActivityAnalytics";

export function UserAnalyticsDrawer({
  user,
  onOpenChange,
}: {
  user: UserActivityRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [windowDays, setWindowDays] = React.useState<7 | 30 | 90>(30);
  const analytics = useSelectedUserActivityAnalytics(user?.user_id ?? null, windowDays);

  React.useEffect(() => {
    if (user) setWindowDays(30);
  }, [user]);

  return (
    <Drawer open={user !== null} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="w-[min(92vw,760px)] overflow-y-auto sm:max-w-[760px]">
        <DrawerHeader className="border-b">
          <DrawerTitle>User engagement audit</DrawerTitle>
          <DrawerDescription>
            {user ? `${user.name} · ${user.email}` : "Select a user to inspect engagement."}
          </DrawerDescription>
        </DrawerHeader>
        <div className="p-5">
          {analytics.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          ) : analytics.error ? (
            <ErrorState
              message="We couldn't load this user's engagement analytics."
              onRetry={() => analytics.refetch()}
            />
          ) : analytics.data && user ? (
            <ActivityAnalytics
              data={analytics.data}
              windowDays={analytics.data.window_days as 7 | 30 | 90}
              onWindowChange={setWindowDays}
              subjectName={user.name}
              compact
            />
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
