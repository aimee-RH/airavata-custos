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

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UserActivityRow } from "../schemas";
import { ActivityTable } from "../components/ActivityTable";
import { InactiveUsersPanel } from "../components/InactiveUsersPanel";

const NOW = new Date("2026-07-23T12:00:00Z");

function row(overrides: Partial<UserActivityRow> = {}): UserActivityRow {
  return {
    user_id: "u1",
    name: "Alice Example",
    email: "alice@example.org",
    last_login: "2026-07-20T08:00:00Z",
    login_count: 10,
    consecutive_logins: 3,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// InactiveUsersPanel
// ─────────────────────────────────────────────
describe("InactiveUsersPanel", () => {
  it("renders nothing when there are no inactive users", () => {
    const { container } = render(<InactiveUsersPanel inactiveUsers={[]} now={NOW} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a count badge with the number of inactive users", () => {
    const users = [
      row({ user_id: "u1", last_login: "2026-07-10T00:00:00Z" }), // 13 days
      row({ user_id: "u2", last_login: null }),                      // never
    ];
    render(<InactiveUsersPanel inactiveUsers={users} now={NOW} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders each inactive user's name", () => {
    const users = [
      row({ user_id: "u1", name: "Alice", last_login: "2026-07-10T00:00:00Z" }),
      row({ user_id: "u2", name: "Bob",   last_login: null }),
    ];
    render(<InactiveUsersPanel inactiveUsers={users} now={NOW} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows 'Never logged in' for a user with null last_login", () => {
    const users = [row({ user_id: "u2", name: "Bob", last_login: null })];
    render(<InactiveUsersPanel inactiveUsers={users} now={NOW} />);
    expect(screen.getByText(/never logged in/i)).toBeInTheDocument();
  });

  it("shows the number of days since last login", () => {
    // 13 days ago
    const users = [row({ user_id: "u1", name: "Alice", last_login: "2026-07-10T00:00:00Z" })];
    render(<InactiveUsersPanel inactiveUsers={users} now={NOW} />);
    expect(screen.getByText(/13 days/i)).toBeInTheDocument();
  });

  it("applies a critical visual treatment for users inactive ≥ 14 days", () => {
    const users = [row({ user_id: "u1", name: "Alice", last_login: "2026-07-01T00:00:00Z" })]; // 22 days
    const { container } = render(<InactiveUsersPanel inactiveUsers={users} now={NOW} />);
    // The row element carries data-band="critical"
    expect(container.querySelector('[data-band="critical"]')).toBeInTheDocument();
  });

  it("applies a warning visual treatment for users inactive 7–13 days", () => {
    const users = [row({ user_id: "u1", name: "Alice", last_login: "2026-07-13T00:00:00Z" })]; // 10 days
    const { container } = render(<InactiveUsersPanel inactiveUsers={users} now={NOW} />);
    expect(container.querySelector('[data-band="warning"]')).toBeInTheDocument();
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
    render(<ActivityTable rows={rows} now={NOW} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("renders column headers: Name, Last Login, Streak, Total Logins", () => {
    render(<ActivityTable rows={rows} now={NOW} />);
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /last login/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /streak/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /total logins/i })).toBeInTheDocument();
  });

  it("shows '—' streak for a user with 0 consecutive logins", () => {
    render(<ActivityTable rows={[row({ consecutive_logins: 0 })]} now={NOW} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the streak count with a flame icon for active streaks", () => {
    render(<ActivityTable rows={[row({ consecutive_logins: 5 })]} now={NOW} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows 'Never' in the Last Login column for null last_login", () => {
    render(<ActivityTable rows={[row({ last_login: null })]} now={NOW} />);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("clicking the Name header toggles sort direction", () => {
    render(<ActivityTable rows={rows} now={NOW} />);
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
    render(<ActivityTable rows={[]} now={NOW} />);
    expect(screen.getByText(/no user activity/i)).toBeInTheDocument();
  });

  it("shows a search input that filters rows by name or email", () => {
    render(<ActivityTable rows={rows} now={NOW} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "bob" } });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("search is case-insensitive", () => {
    render(<ActivityTable rows={rows} now={NOW} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "CAROL" } });
    expect(screen.getByText("Carol")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("search matches on email as well as name", () => {
    render(<ActivityTable rows={rows} now={NOW} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "alice@example" } });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("shows 'no results' when search matches nothing", () => {
    render(<ActivityTable rows={rows} now={NOW} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "zzznomatch" } });
    expect(screen.getByText(/no user activity/i)).toBeInTheDocument();
  });
});
