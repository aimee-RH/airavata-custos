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

import type { ReactNode } from "react";
import { UsersAdminProvider } from "@/shared/users-admin/UsersAdminContext";

export default function AdminUsersLayout({ children }: { children: ReactNode }) {
  return (
    <UsersAdminProvider>
      <div className="space-y-4">
        <header className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-1">
            <h1 className="font-display text-[28px] font-bold leading-tight">
              Users & Permissions
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage user identities, access permissions, and roles across the portal. Control who
              can access resources, configure role assignments, and audit identity records.
            </p>
          </div>
        </header>
        {children}
      </div>
    </UsersAdminProvider>
  );
}
