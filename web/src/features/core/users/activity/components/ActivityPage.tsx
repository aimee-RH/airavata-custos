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
import { ErrorState } from "@/shared/ui/ErrorState";
import { Skeleton } from "@/shared/ui/skeleton";
import { filterInactiveUsers } from "../lib";
import { useUserActivity } from "../queries";
import { ActivityTable } from "./ActivityTable";
import { InactiveUsersPanel } from "./InactiveUsersPanel";

export function ActivityPage() {
  const { data, isLoading, error, refetch } = useUserActivity();
  const now = React.useMemo(() => new Date(), []);

  const rows = data?.items ?? [];
  const inactiveUsers = React.useMemo(() => filterInactiveUsers(rows, now), [rows, now]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        message="We couldn't load user activity."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <InactiveUsersPanel inactiveUsers={inactiveUsers} now={now} />
      <ActivityTable rows={rows} now={now} />
    </div>
  );
}
