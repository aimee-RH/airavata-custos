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

import { http, HttpResponse } from "msw";
import activityFixture from "@/features/core/users/activity/__fixtures__/activity.json";

export const userActivityHandlers = [
  http.get("*/api/v1/users/activity", ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? activityFixture.items.length);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const items = activityFixture.items.slice(offset, offset + limit);
    return HttpResponse.json({ items, total: activityFixture.total });
  }),
];
