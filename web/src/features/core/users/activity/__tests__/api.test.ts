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

import { afterEach, describe, expect, it, vi } from "vitest";
import { getUserActivity, getUserActivityAnalytics } from "../api";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

function mockResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function validPayload(overrides?: object) {
  return {
    items: [
      {
        user_id: "u-1",
        name: "Alice Example",
        email: "alice@example.org",
        last_login: "2026-07-20T08:00:00Z",
        login_count: 15,
        consecutive_logins: 4,
      },
    ],
    total: 1,
    ...overrides,
  };
}

afterEach(() => fetchMock.mockReset());

describe("getUserActivityAnalytics API", () => {
  it("requests and validates the selected rolling window", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {
      generated_at: "2026-07-24T00:00:00Z", window_days: 30,
      total_users: 2, users_ever_logged_in: 1, lifetime_login_count: 3, lifetime_active_days: 2,
      active_users: 1, window_login_count: 3, window_active_days: 2,
      monthly_active_users: 1, monthly_login_count: 3, monthly_active_days: 2,
      average_logins_per_active_day: 1.5,
      trend: [{ date: "2026-07-24", active_users: 1, login_count: 2 }],
    }));
    const result = await getUserActivityAnalytics(30);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("window=30");
    expect(result.trend[0]?.login_count).toBe(2);
  });
});

describe("getUserActivity API", () => {
  it("calls the correct endpoint", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, validPayload()));
    await getUserActivity({});
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/users/activity");
  });

  it("sends limit and offset as query params", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, validPayload()));
    await getUserActivity({ limit: 25, offset: 50 });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("limit=25");
    expect(url).toContain("offset=50");
  });

  it("omits limit/offset when not provided", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, validPayload()));
    await getUserActivity({});
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).not.toContain("limit=");
    expect(url).not.toContain("offset=");
  });

  it("parses and returns the typed response", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, validPayload()));
    const result = await getUserActivity({});
    expect(result.total).toBe(1);
    expect(result.items[0]?.user_id).toBe("u-1");
    expect(result.items[0]?.consecutive_logins).toBe(4);
  });

  it("handles a user with null last_login (never logged in)", async () => {
    const payload = validPayload({
      items: [
        {
          user_id: "u-new",
          name: "New User",
          email: "new@example.org",
          last_login: null,
          login_count: 0,
          consecutive_logins: 0,
        },
      ],
    });
    fetchMock.mockResolvedValueOnce(mockResponse(200, payload));
    const result = await getUserActivity({});
    expect(result.items[0]?.last_login).toBeNull();
  });

  it("throws when the server returns a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(403, { error: "forbidden" }));
    await expect(getUserActivity({})).rejects.toThrow();
  });

  it("throws when the response body fails schema validation", async () => {
    // 'login_count' is missing — schema should reject it
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        items: [{ user_id: "u-bad", name: "Bad", email: "bad@example.org" }],
        total: 1,
      }),
    );
    await expect(getUserActivity({})).rejects.toThrow();
  });
});
