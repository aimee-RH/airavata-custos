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
import { ActivityAnalytics, analyticsCSV } from "../components/ActivityAnalytics";
import { InactivityFilter } from "../components/InactivityFilter";
import type { UserActivityAnalytics } from "../schemas";

const analytics: UserActivityAnalytics = {
  generated_at: "2026-07-24T12:00:00Z",
  window_days: 30,
  total_users: 20,
  users_ever_logged_in: 18,
  lifetime_login_count: 500,
  lifetime_active_days: 300,
  active_users: 12,
  window_login_count: 80,
  window_active_days: 50,
  monthly_active_users: 10,
  monthly_login_count: 70,
  monthly_active_days: 45,
  average_logins_per_active_day: 1.6,
  trend: [{ date: "2026-07-24", active_users: 4, login_count: 8 }],
};

describe("ActivityAnalytics", () => {
  it("renders rolling, monthly, and lifetime metrics", () => {
    render(<ActivityAnalytics data={analytics} windowDays={30} onWindowChange={() => undefined} />);
    expect(
      screen.getByRole("region", { name: "System-wide user engagement analytics" }),
    ).toHaveTextContent("All Custos users");
    expect(screen.getByText(/Aggregated usage across every user/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "30-day window" })).toHaveTextContent("50");
    expect(screen.getByRole("region", { name: "Current month" })).toHaveTextContent("70");
    expect(screen.getByRole("region", { name: "Lifetime" })).toHaveTextContent("500");
    expect(screen.getByText("1.60")).toBeInTheDocument();
  });

  it("renders a readable trend with date labels instead of an unlabelled block", () => {
    render(<ActivityAnalytics data={analytics} windowDays={30} onWindowChange={() => undefined} />);
    const trend = screen.getByRole("region", { name: "Login trend for 30 days" });
    expect(trend).toHaveTextContent("Daily login trend");
    expect(trend).toHaveTextContent("07-24");
    expect(trend.querySelector("[title*='8 logins']")).toBeInTheDocument();
  });

  it("labels a selected-user report as an individual audit", () => {
    render(
      <ActivityAnalytics
        data={analytics}
        windowDays={30}
        onWindowChange={() => undefined}
        subjectName="Alice Example"
      />,
    );
    expect(
      screen.getByRole("region", { name: "Alice Example engagement analytics" }),
    ).toHaveTextContent("Individual user audit");
    expect(screen.getByText("Login activity for this user only.")).toBeInTheDocument();
  });

  it("exports both summary and trend sections", () => {
    const csv = analyticsCSV(analytics);
    expect(csv).toContain("summary_metric,value");
    expect(csv).toContain("window_active_days,50");
    expect(csv).toContain("date,active_users,login_count");
    expect(csv).toContain("2026-07-24,4,8");
  });
});

describe("InactivityFilter", () => {
  it("accepts 3650 and rejects values outside the backend range", () => {
    const onChange = vi.fn();
    render(<InactivityFilter value={7} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const input = screen.getByLabelText("Custom inactivity days");
    expect(input).toHaveAttribute("max", "3650");

    fireEvent.change(input, { target: { value: "3650" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(3650);

    onChange.mockClear();
    fireEvent.change(input, { target: { value: "3651" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(7);
  });
});
