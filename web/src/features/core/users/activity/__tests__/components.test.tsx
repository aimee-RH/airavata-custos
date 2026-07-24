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
import { describe, expect, it } from "vitest";
import type { UserActivityRow } from "../schemas";
import { ActivityTable } from "../components/ActivityTable";
import { InactiveUsersPanel } from "../components/InactiveUsersPanel";

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
// InactiveUsersPanel
// ─────────────────────────────────────────────
describe("InactiveUsersPanel", () => {
  it("renders nothing when there are no inactive users", () => {
    const { container } = render(
      <InactiveUsersPanel inactiveUsers={[]} inactiveDays={DEFAULT_INACTIVE_DAYS} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows a count badge with the number of inactive users", () => {
    const users = [
      row({ user_id: "u1", last_login: "2026-07-10T00:00:00Z", inactive_days: 13 }), // 13 days
      row({ user_id: "u2", last_login: null, inactive_days: null }),                      // never
    ];
    render(<InactiveUsersPanel inactiveUsers={users} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders each inactive user's name", () => {
    const users = [
      row({ user_id: "u1", name: "Alice", last_login: "2026-07-10T00:00:00Z", inactive_days: 13 }),
      row({ user_id: "u2", name: "Bob", last_login: null, inactive_days: null }),
    ];
    render(<InactiveUsersPanel inactiveUsers={users} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows 'Never logged in' for a user with null last_login", () => {
    const users = [row({ user_id: "u2", name: "Bob", last_login: null, inactive_days: null })];
    render(<InactiveUsersPanel inactiveUsers={users} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getByText(/never logged in/i)).toBeInTheDocument();
  });

  it("shows the number of days since last login", () => {
    // 13 days ago
    const users = [row({ user_id: "u1", name: "Alice", last_login: "2026-07-10T00:00:00Z", inactive_days: 13 })];
    render(<InactiveUsersPanel inactiveUsers={users} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getByText(/13 days/i)).toBeInTheDocument();
  });

  it("applies a critical visual treatment for users inactive ≥ 14 days", () => {
    const users = [row({ user_id: "u1", name: "Alice", last_login: "2026-07-01T00:00:00Z", inactive_days: 22 })]; // 22 days
    const { container } = render(
      <InactiveUsersPanel inactiveUsers={users} inactiveDays={DEFAULT_INACTIVE_DAYS} />,
    );
    expect(container.querySelector('[data-band="critical"]')).toBeInTheDocument();
  });

  it("applies a warning visual treatment for users inactive 7–13 days", () => {
    const users = [row({ user_id: "u1", name: "Alice", last_login: "2026-07-13T00:00:00Z", inactive_days: 10 })]; // 10 days
    const { container } = render(
      <InactiveUsersPanel inactiveUsers={users} inactiveDays={DEFAULT_INACTIVE_DAYS} />,
    );
    expect(container.querySelector('[data-band="warning"]')).toBeInTheDocument();
  });

  it("shows 'Show N more' button when users exceed the collapse threshold", () => {
    // Create 6 users (threshold is 5)
    const users = Array.from({ length: 6 }, (_, i) =>
      row({ user_id: `u${i}`, name: `User ${i}`, last_login: null, inactive_days: null }),
    );
    render(<InactiveUsersPanel inactiveUsers={users} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    expect(screen.getByRole("button", { name: /show 1 more/i })).toBeInTheDocument();
  });

  it("expands to show all users when 'Show more' is clicked", () => {
    const users = Array.from({ length: 6 }, (_, i) =>
      row({ user_id: `u${i}`, name: `User ${i}`, last_login: null, inactive_days: null }),
    );
    render(<InactiveUsersPanel inactiveUsers={users} inactiveDays={DEFAULT_INACTIVE_DAYS} />);
    fireEvent.click(screen.getByRole("button", { name: /show 1 more/i }));
    expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();
    // All 6 users should be visible
    for (let i = 0; i < 6; i++) {
      expect(screen.getByText(`User ${i}`)).toBeInTheDocument();
    }
  });
});

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
});
