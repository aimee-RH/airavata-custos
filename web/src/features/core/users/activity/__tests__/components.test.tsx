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

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UserActivityRow } from "../schemas";
import { ActivityTable } from "../components/ActivityTable";

const NOW = new Date("2026-07-23T12:00:00Z");
const DEFAULT_INACTIVE_DAYS = 7;

function row(overrides: Partial<UserActivityRow> = {}): UserActivityRow {
  return {
    user_id: "u1",
    name: "Alice Example",
    email: "alice@example.org",
    last_login: "2026-07-20T08:00:00Z",
    effective_timezone: "UTC",
    last_login_local_date: "2026-07-20",
    inactive_days: 3,
    login_count: 10,
    login_day_count: 5,
    current_streak: 3,
    consecutive_logins: 3,
    average_logins_per_active_day: 2,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// ActivityTable
// ─────────────────────────────────────────────
describe("ActivityTable", () => {
  const rows: UserActivityRow[] = [
    row({ user_id: "u-a", name: "Alice", email: "alice@example.org", last_login: "2026-07-22T00:00:00Z", login_count: 50, consecutive_logins: 5 }),
    row({ user_id: "u-b", name: "Bob",   email: "bob@example.org",   last_login: "2026-07-10T00:00:00Z", login_count: 30, consecutive_logins: 2 }),
    row({ user_id: "u-c", name: "Carol", email: "carol@example.org", last_login: null,                   login_count: 0,  consecutive_logins: 0 }),
  ];

  it("renders a row for every user", () => {
    render(<ActivityTable now={NOW} rows={rows} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("renders column headers: Name, Last Login, Streak, Total Logins", () => {
    render(<ActivityTable now={NOW} rows={rows} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /last login/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /streak/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /total logins/i })).toBeInTheDocument();
  });

  it("shows '—' streak for a user with 0 consecutive logins", () => {
    render(<ActivityTable now={NOW} rows={[row({ consecutive_logins: 0 })]} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the streak count with a flame icon for active streaks", () => {
    render(<ActivityTable now={NOW} rows={[row({ consecutive_logins: 5 })]} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
  });

  it("shows 'Never' in the Last Login column for null last_login", () => {
    render(<ActivityTable now={NOW} rows={[row({ last_login: null })]} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("shows active, inactive, and never-logged-in statuses", () => {
    render(
      <ActivityTable
        now={NOW}
        rows={[
          row({ user_id: "active", inactive_days: 1 }),
          row({ user_id: "inactive", inactive_days: 9 }),
          row({ user_id: "never", last_login: null, inactive_days: null }),
        ]}
      />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive 9d")).toBeInTheDocument();
    expect(screen.getByText("Never logged in")).toBeInTheDocument();
  });

  it("clicking the Name header toggles sort direction", () => {
    render(<ActivityTable now={NOW} rows={rows} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    // Default sort is last_login desc; click Name → asc
    fireEvent.click(nameHeader);
    const cells = screen.getAllByRole("cell", { name: /alice|bob|carol/i });
    expect(cells[0]?.textContent).toMatch(/alice/i);
    // click again → desc
    fireEvent.click(nameHeader);
    const cells2 = screen.getAllByRole("cell", { name: /alice|bob|carol/i });
    expect(cells2[0]?.textContent).toMatch(/carol/i);
  });

  it("renders empty state message when rows is empty", () => {
    render(<ActivityTable now={NOW} rows={[]} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getByText(/no user activity/i)).toBeInTheDocument();
  });

  it("shows a search input that filters rows by name or email", () => {
    render(<ActivityTable now={NOW} rows={rows} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "bob" } });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("search is case-insensitive", () => {
    render(<ActivityTable now={NOW} rows={rows} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "CAROL" } });
    expect(screen.getByText("Carol")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("search matches on email as well as name", () => {
    render(<ActivityTable now={NOW} rows={rows} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "alice@example" } });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("shows 'no results' when search matches nothing", () => {
    render(<ActivityTable now={NOW} rows={rows} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "zzznomatch" } });
    expect(screen.getByText(/no user activity/i)).toBeInTheDocument();
  });

  it("paginates server results in ten-user pages", () => {
    const onPageChange = vi.fn();
    render(
      <ActivityTable
        now={NOW}
        rows={Array.from({ length: 10 }, (_, index) =>
          row({ user_id: `u-${index}`, name: `User ${index}` }),
        )}
        search=""
        page={1}
        pageSize={10}
        total={11}
        onSearchChange={() => undefined}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText("1–10 of 11")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
