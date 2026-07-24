//go:build integration

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

package service

import (
	"fmt"
	"testing"
	"time"

	"github.com/apache/airavata-custos/internal/store"
)

func TestListUserActivitySearchSortAndDerivedFieldsIntegration(t *testing.T) {
	database := setupTestDB(t)
	aliceID := seedUser(t, database, "Alice.Search@example.org")
	bobID := seedUser(t, database, "bob@example.org")
	if _, err := database.Exec(`UPDATE users SET first_name = 'Alice', last_name = 'Zephyr', timezone = 'America/New_York', last_login = '2026-07-23 15:00:00', last_login_local_date = '2026-07-23', login_count = 5, login_day_count = 2, login_streak = 4 WHERE id = ?`, aliceID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`UPDATE users SET first_name = 'Bob', last_name = 'Alpha', timezone = 'Invalid/Zone', login_count = 0, login_day_count = 0, login_streak = 0 WHERE id = ?`, bobID); err != nil {
		t.Fatal(err)
	}

	now := time.Date(2026, 7, 24, 3, 0, 0, 0, time.UTC)
	rows, total, err := newTestService(database).ListUserActivity(t.Context(), store.UserActivityFilter{
		Query: "alice", Limit: 10, Sort: "login_count", Direction: "desc", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(rows) != 1 {
		t.Fatalf("search result total=%d rows=%d, want 1", total, len(rows))
	}
	got := rows[0]
	if got.UserID != aliceID || got.EffectiveTimezone != "America/New_York" || got.LastLoginLocalDate == nil || *got.LastLoginLocalDate != "2026-07-23" {
		t.Fatalf("unexpected activity row: %+v", got)
	}
	if got.LoginCount != 5 || got.LoginDayCount != 2 || got.CurrentStreak != 4 || got.AverageLoginsPerActiveDay == nil || *got.AverageLoginsPerActiveDay != 2.5 {
		t.Fatalf("unexpected metrics: %+v", got)
	}

	rows, total, err = newTestService(database).ListUserActivity(t.Context(), store.UserActivityFilter{
		Limit: 10, Sort: "name", Direction: "asc", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 || len(rows) != 2 || rows[0].Name != "Alice Zephyr" || rows[1].EffectiveTimezone != "UTC" {
		t.Fatalf("sorted rows = %+v", rows)
	}
}

func TestListInactiveUsersUsesLocalCalendarDaysIntegration(t *testing.T) {
	database := setupTestDB(t)
	now := time.Date(2026, 7, 24, 2, 0, 0, 0, time.UTC) // NY=Jul 23, Shanghai=Jul 24.
	seedActivitySummary := func(email, timezone, localDate string) string {
		t.Helper()
		id := seedUser(t, database, email)
		if _, err := database.Exec(`UPDATE users SET timezone = ?, last_login = '2026-07-20 12:00:00', last_login_local_date = ?, login_count = 1, login_day_count = 1, login_streak = 1 WHERE id = ?`, timezone, localDate, id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	neverID := seedUser(t, database, "never@example.org")
	sixDayID := seedActivitySummary("six@example.org", "UTC", "2026-07-18")
	sevenDayID := seedActivitySummary("seven@example.org", "UTC", "2026-07-17")
	eightDayID := seedActivitySummary("eight@example.org", "UTC", "2026-07-16")
	newYorkID := seedActivitySummary("new-york@example.org", "America/New_York", "2026-07-17") // 6 local days.
	shanghaiID := seedActivitySummary("shanghai@example.org", "Asia/Shanghai", "2026-07-17")   // 7 local days.

	rows, total, err := newTestService(database).ListUserActivity(t.Context(), store.UserActivityFilter{
		InactiveDays: 7, Limit: 50, Sort: "inactivity", Direction: "desc", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if total != 4 || len(rows) != 4 {
		t.Fatalf("inactive total=%d rows=%d, want 4", total, len(rows))
	}
	ids := make(map[string]bool, len(rows))
	inactiveDays := make(map[string]*int, len(rows))
	for _, row := range rows {
		ids[row.UserID] = true
		inactiveDays[row.UserID] = row.InactiveDays
	}
	if rows[0].UserID != neverID || !ids[sevenDayID] || !ids[eightDayID] || !ids[shanghaiID] || ids[sixDayID] || ids[newYorkID] {
		t.Fatalf("incorrect local-day inactivity rows: %+v", rows)
	}
	if inactiveDays[neverID] != nil || inactiveDays[sevenDayID] == nil || *inactiveDays[sevenDayID] != 7 || inactiveDays[eightDayID] == nil || *inactiveDays[eightDayID] != 8 || inactiveDays[shanghaiID] == nil || *inactiveDays[shanghaiID] != 7 {
		t.Fatalf("incorrect per-user inactive days: %+v", inactiveDays)
	}
}

func TestUserActivityAnalyticsFromDailyFactsIntegration(t *testing.T) {
	database := setupTestDB(t)
	now := time.Date(2026, 8, 1, 2, 0, 0, 0, time.UTC) // Shanghai=Aug 1, New York=Jul 31.
	aliceID := seedUser(t, database, "analytics-alice@example.org")
	bobID := seedUser(t, database, "analytics-bob@example.org")
	if _, err := database.Exec(`UPDATE users SET login_count = 4, login_day_count = 3 WHERE id = ?`, aliceID); err != nil {
		t.Fatal(err)
	}
	insertDaily := func(userID, localDate, timezone string, count int) {
		t.Helper()
		if _, err := database.Exec(`INSERT INTO user_login_daily
			(user_id, local_date, timezone, login_count, first_login_at, last_login_at)
			VALUES (?, ?, ?, ?, '2026-08-01 00:00:00', '2026-08-01 00:00:00')`,
			userID, localDate, timezone, count); err != nil {
			t.Fatal(err)
		}
	}
	insertDaily(aliceID, "2026-08-01", "Asia/Shanghai", 2)  // Shanghai local today and month.
	insertDaily(aliceID, "2026-07-26", "Asia/Shanghai", 1)  // Seven-day boundary, previous month.
	insertDaily(aliceID, "2026-07-25", "Asia/Shanghai", 1)  // Outside seven-day window.
	insertDaily(bobID, "2026-07-31", "America/New_York", 3) // New York local today and month.
	insertDaily(bobID, "2026-07-25", "America/New_York", 1) // Seven-day boundary.
	insertDaily(bobID, "2026-07-24", "America/New_York", 1) // Outside seven-day window.

	result, err := newTestService(database).users.GetActivityAnalytics(t.Context(), now, 7)
	if err != nil {
		t.Fatal(err)
	}
	if result.TotalUsers != 2 || result.UsersEverLoggedIn != 1 || result.ActiveUsers != 2 {
		t.Fatalf("unexpected analytics users: %+v", result)
	}
	if result.LifetimeLoginCount != 9 || result.LifetimeActiveDays != 6 || result.WindowLoginCount != 7 || result.WindowActiveDays != 4 {
		t.Fatalf("unexpected lifetime/window metrics: %+v", result)
	}
	if result.MonthlyActiveUsers != 2 || result.MonthlyLoginCount != 7 || result.MonthlyActiveDays != 4 {
		t.Fatalf("unexpected user-local month metrics: %+v", result)
	}
	if result.AverageLoginsPerDay == nil || *result.AverageLoginsPerDay != 1.75 {
		t.Fatalf("average = %v, want 1.75", result.AverageLoginsPerDay)
	}
	if len(result.Trend) != 4 || result.Trend[0].Date != "2026-07-25" || result.Trend[3].Date != "2026-08-01" {
		t.Fatalf("unexpected analytics trend: %+v", result.Trend)
	}
}

func TestSelectedUserActivityAnalyticsIsIsolatedIntegration(t *testing.T) {
	database := setupTestDB(t)
	now := time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC)
	aliceID := seedUser(t, database, "selected-alice@example.org")
	bobID := seedUser(t, database, "selected-bob@example.org")
	if _, err := database.Exec(`UPDATE users SET login_count = 3, login_day_count = 2 WHERE id = ?`, aliceID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`UPDATE users SET login_count = 9, login_day_count = 1 WHERE id = ?`, bobID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`INSERT INTO user_login_daily
		(user_id, local_date, timezone, login_count, first_login_at, last_login_at)
		VALUES (?, '2026-07-24', 'UTC', 2, '2026-07-24 08:00:00', '2026-07-24 09:00:00'),
		       (?, '2026-07-23', 'UTC', 1, '2026-07-23 08:00:00', '2026-07-23 08:00:00'),
		       (?, '2026-07-24', 'UTC', 9, '2026-07-24 07:00:00', '2026-07-24 10:00:00')`,
		aliceID, aliceID, bobID); err != nil {
		t.Fatal(err)
	}
	result, err := newTestService(database).users.GetUserActivityAnalytics(t.Context(), aliceID, now, 7)
	if err != nil {
		t.Fatal(err)
	}
	if result.TotalUsers != 1 || result.UsersEverLoggedIn != 1 || result.LifetimeLoginCount != 3 || result.LifetimeActiveDays != 2 {
		t.Fatalf("selected user metrics leaked another user: %+v", result)
	}
	if result.WindowLoginCount != 3 || result.WindowActiveDays != 2 || len(result.Trend) != 2 {
		t.Fatalf("unexpected selected user window: %+v", result)
	}
}

func TestUserActivityAnalyticsEmptyFactsIntegration(t *testing.T) {
	database := setupTestDB(t)
	seedUser(t, database, "analytics-never@example.org")
	result, err := newTestService(database).users.GetActivityAnalytics(
		t.Context(), time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC), 30,
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.TotalUsers != 1 || result.UsersEverLoggedIn != 0 || result.LifetimeLoginCount != 0 || result.WindowActiveDays != 0 {
		t.Fatalf("unexpected empty analytics: %+v", result)
	}
	if result.AverageLoginsPerDay != nil || len(result.Trend) != 0 {
		t.Fatalf("empty facts should have null average and empty trend: %+v", result)
	}
}

func TestListInactiveUsersAccurateTotalAndStablePaginationIntegration(t *testing.T) {
	database := setupTestDB(t)
	now := time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 55; i++ {
		id := seedUser(t, database, fmt.Sprintf("inactive-%02d@example.org", i))
		if _, err := database.Exec(`UPDATE users SET last_login = '2026-07-01 12:00:00', last_login_local_date = '2026-07-01', login_count = 1, login_day_count = 1, login_streak = 1 WHERE id = ?`, id); err != nil {
			t.Fatal(err)
		}
	}
	svc := newTestService(database)
	first, total, err := svc.ListUserActivity(t.Context(), store.UserActivityFilter{
		InactiveDays: 7, Limit: 50, Sort: "inactivity", Direction: "desc", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	second, secondTotal, err := svc.ListUserActivity(t.Context(), store.UserActivityFilter{
		InactiveDays: 7, Limit: 50, Offset: 50, Sort: "inactivity", Direction: "desc", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if total != 55 || secondTotal != 55 || len(first) != 50 || len(second) != 5 {
		t.Fatalf("pagination totals=(%d,%d) lengths=(%d,%d)", total, secondTotal, len(first), len(second))
	}
	seen := make(map[string]bool, 55)
	for _, row := range append(first, second...) {
		if seen[row.UserID] {
			t.Fatalf("duplicate user across pages: %s", row.UserID)
		}
		seen[row.UserID] = true
	}
	if len(seen) != 55 {
		t.Fatalf("unique users = %d, want 55", len(seen))
	}
}
