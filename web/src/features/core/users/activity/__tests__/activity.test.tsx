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

import { activityAnalytics, activityList } from "@/mocks/handlers/user-activity";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserActivity } from "../api";
import { StatusComposition } from "../components/ActivityOverview";
import { ActivityPage } from "../components/ActivityPage";
import { DaysRangePicker } from "../components/DaysRangePicker";
import { activityStatus } from "../lib";

const state = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/shared/casl/AbilityProvider", () => ({
  useAbility: () => ({ can: () => state.allowed, cannot: () => !state.allowed }),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});
const fetcher = vi.fn();
beforeEach(() => {
  state.allowed = true;
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockImplementation(async (input: string) => {
    const url = new URL(input, "http://localhost");
    const body = url.pathname.endsWith("analytics")
      ? activityAnalytics(
          Number(url.searchParams.get("window")),
          url.pathname.match(/users\/(activity-\d+)\//)?.[1],
        )
      : activityList(url);
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  });
});
afterEach(() => {
  fetcher.mockReset();
  vi.unstubAllGlobals();
});
function dashboard() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ActivityPage />
    </QueryClientProvider>,
  );
}

describe("activity dashboard", () => {
  it("uses server totals and requests page 21 without a 200-user ceiling", async () => {
    dashboard();
    expect(await screen.findByText("1–10 of 225")).toBeInTheDocument();
    for (let page = 2; page <= 21; page++) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByText(`${(page - 1) * 10 + 1}–${page * 10} of 225`);
    }
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("offset=200"))).toBe(true);
  });
  it("sends status, window and debounced search to the server and resets pagination", async () => {
    dashboard();
    await screen.findByText("1–10 of 225");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("11–20 of 225");
    fireEvent.change(screen.getByLabelText("Filter users by status"), {
      target: { value: "dormant" },
    });
    await screen.findByText("1–10 of 75");
    fireEvent.click(
      within(screen.getByRole("group", { name: "Activity window" })).getByRole("button", {
        name: "7 days",
      }),
    );
    await screen.findByText("1–10 of 125");
    fireEvent.change(screen.getByLabelText("Search users"), {
      target: { value: "activity4@example.org" },
    });
    await screen.findByText("1–1 of 1");
    expect(screen.getByText("Activity User 004")).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes(
          "window=7&status=dormant&query=activity4%40example.org&limit=10&offset=0",
        ),
      ),
    ).toBe(true);
  });
  it("opens individual analytics and requests its independent range", async () => {
    dashboard();
    await screen.findByText("1–10 of 225");
    fireEvent.click(screen.getAllByRole("button", { name: /View activity for/ })[0]!);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("group", { name: "User analytics date range" })).getByRole("button", {
        name: "90 days",
      }),
    );
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) =>
          /users\/activity-\d+\/activity\/analytics\?window=90/.test(String(url)),
        ),
      ).toBe(true),
    );
  });
  it("denies direct navigation without making activity requests", () => {
    state.allowed = false;
    dashboard();
    expect(screen.getByText("Not permitted.")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps controls available after failure and retries", async () => {
    fetcher.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    dashboard();
    await screen.findByText("We couldn't load the selected users.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("1–10 of 225");
  });
  it("does not show previous-window rows while the next request is pending", async () => {
    dashboard();
    await screen.findByText("1–10 of 225");
    fetcher.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Activity window" })).getByRole("button", {
        name: "90 days",
      }),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Loading activity table")).toBeInTheDocument();
  });
  it("shows an empty search result", async () => {
    dashboard();
    await screen.findByText("1–10 of 225");
    fireEvent.change(screen.getByLabelText("Search users"), {
      target: { value: "no-such-person" },
    });
    await screen.findByText("No users match this view.");
  });
});
it("rejects an older backend that ignores the requested status/window", async () => {
  const result = activityList(new URL("http://localhost?window=30&status=all"));
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } }),
  );
  await expect(
    getUserActivity({
      window: 7,
      status: "active",
      query: "",
      limit: 10,
      offset: 0,
      sort: "name",
      direction: "asc",
    }),
  ).rejects.toThrow(/filters/);
});
it("rejects missing window counts instead of inventing zeros", async () => {
  const result = activityList(new URL("http://localhost?window=30&status=all"));
  const { window_login_count, ...oldRow } = result.items[0]!;
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ ...result, items: [oldRow] }), {
      headers: { "content-type": "application/json" },
    }),
  );
  await expect(
    getUserActivity({
      window: 30,
      status: "all",
      query: "",
      limit: 10,
      offset: 0,
      sort: "name",
      direction: "asc",
    }),
  ).rejects.toThrow();
});
it("uses server-local calendar days at the exact inactivity boundary", () => {
  const user = activityList(new URL("http://localhost")).items[0]!;
  expect(activityStatus({ ...user, inactive_days: 6 }, 7)).toBe("active");
  expect(activityStatus({ ...user, inactive_days: 7 }, 7)).toBe("dormant");
  expect(activityStatus({ ...user, last_login: null, inactive_days: null }, 7)).toBe("never");
});
it("validates custom days without submitting invalid values", () => {
  const onChange = vi.fn();
  render(<DaysRangePicker value={30} onChange={onChange} label="Window" />);
  fireEvent.click(screen.getByRole("button", { name: "Custom" }));
  const input = screen.getByLabelText("Window custom days");
  for (const value of ["0", "366", "1.5", ""]) {
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  }
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "365" } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenCalledWith(365);
});
it("renders zero-user composition without NaN or Infinity", () => {
  const { container } = render(<StatusComposition counts={{ active: 0, dormant: 0, never: 0 }} />);
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
});
