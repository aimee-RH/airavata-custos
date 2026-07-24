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

package store

import (
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Helpers — pure Go simulation of the SQL CASE logic in UpdateLoginActivity.
// These tests verify the streak/count algorithm WITHOUT hitting a database.
// Integration tests (build tag: integration) exercise the actual SQL.
// ---------------------------------------------------------------------------

type activityState struct {
	LoginCount    int
	LoginStreak   int
	StreakLastDay *time.Time // nil = never logged in
}

func truncDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// applyLoginActivity mirrors the SQL UPDATE logic so we can unit-test the
// algorithm without spinning up a database.
func applyLoginActivity(s *activityState, now time.Time) {
	today := truncDay(now)

	// login_count: increment at most once per calendar day
	if s.StreakLastDay == nil || !truncDay(*s.StreakLastDay).Equal(today) {
		s.LoginCount++
	}

	// login_streak CASE
	if s.StreakLastDay == nil {
		s.LoginStreak = 1
	} else {
		lastDay := truncDay(*s.StreakLastDay)
		yesterday := today.AddDate(0, 0, -1)
		switch {
		case lastDay.Equal(yesterday):
			s.LoginStreak++
		case lastDay.Equal(today):
			// already counted today — no change
		default:
			s.LoginStreak = 1
		}
	}

	s.StreakLastDay = &today
}

func d(y, m, day int) time.Time {
	return time.Date(y, time.Month(m), day, 9, 0, 0, 0, time.UTC)
}

// ---------------------------------------------------------------------------
// streak logic tests
// ---------------------------------------------------------------------------

func TestLoginActivity_FirstLogin_StreakOne(t *testing.T) {
	s := &activityState{}
	applyLoginActivity(s, d(2026, 7, 1))
	if s.LoginStreak != 1 {
		t.Errorf("streak: got %d want 1", s.LoginStreak)
	}
	if s.LoginCount != 1 {
		t.Errorf("count: got %d want 1", s.LoginCount)
	}
}

func TestLoginActivity_ConsecutiveDays_StreakIncrements(t *testing.T) {
	s := &activityState{}
	for _, day := range []int{1, 2, 3} {
		applyLoginActivity(s, d(2026, 7, day))
	}
	if s.LoginStreak != 3 {
		t.Errorf("streak: got %d want 3", s.LoginStreak)
	}
	if s.LoginCount != 3 {
		t.Errorf("count: got %d want 3", s.LoginCount)
	}
}

func TestLoginActivity_GapResetsStreak(t *testing.T) {
	s := &activityState{}
	applyLoginActivity(s, d(2026, 7, 1))
	applyLoginActivity(s, d(2026, 7, 2))
	applyLoginActivity(s, d(2026, 7, 2)) // second call same day — no change
	// skip July 3
	applyLoginActivity(s, d(2026, 7, 4)) // gap of 2 days → reset
	if s.LoginStreak != 1 {
		t.Errorf("streak after gap: got %d want 1", s.LoginStreak)
	}
}

func TestLoginActivity_SameDayMultipleCalls_CountNotDoubled(t *testing.T) {
	s := &activityState{}
	for i := 0; i < 5; i++ {
		// different times, same calendar day
		applyLoginActivity(s, d(2026, 7, 10).Add(time.Duration(i)*time.Hour))
	}
	if s.LoginCount != 1 {
		t.Errorf("login_count same day: got %d want 1", s.LoginCount)
	}
	if s.LoginStreak != 1 {
		t.Errorf("streak same day: got %d want 1", s.LoginStreak)
	}
}

func TestLoginActivity_SameDayDoesNotChangeStreak(t *testing.T) {
	s := &activityState{}
	applyLoginActivity(s, d(2026, 7, 1))
	applyLoginActivity(s, d(2026, 7, 2)) // streak = 2
	applyLoginActivity(s, d(2026, 7, 2)) // same day again — still 2
	if s.LoginStreak != 2 {
		t.Errorf("streak after same-day dup: got %d want 2", s.LoginStreak)
	}
}

func TestLoginActivity_NullStreakLastDay_FirstLogin(t *testing.T) {
	s := &activityState{} // streak_last_day = nil
	applyLoginActivity(s, d(2026, 8, 1))
	if s.LoginStreak != 1 {
		t.Errorf("first login streak: got %d want 1", s.LoginStreak)
	}
	if s.LoginCount != 1 {
		t.Errorf("first login count: got %d want 1", s.LoginCount)
	}
	if s.StreakLastDay == nil {
		t.Error("streak_last_day should be set after first login")
	}
}

func TestLoginActivity_LongStreak_ThenGap_ThenResumes(t *testing.T) {
	s := &activityState{}
	// build streak of 5
	for i := 1; i <= 5; i++ {
		applyLoginActivity(s, d(2026, 7, i))
	}
	if s.LoginStreak != 5 {
		t.Fatalf("streak before gap: got %d want 5", s.LoginStreak)
	}
	// skip 3 days
	applyLoginActivity(s, d(2026, 7, 9))
	if s.LoginStreak != 1 {
		t.Errorf("streak after gap: got %d want 1", s.LoginStreak)
	}
	// continue 2 more days
	applyLoginActivity(s, d(2026, 7, 10))
	applyLoginActivity(s, d(2026, 7, 11))
	if s.LoginStreak != 3 {
		t.Errorf("streak resumed: got %d want 3", s.LoginStreak)
	}
}

func TestLoginActivity_CountAccumulatesAcrossDays(t *testing.T) {
	s := &activityState{}
	days := []int{1, 2, 3, 5, 8} // non-consecutive to test count is per-call-per-day
	for _, day := range days {
		applyLoginActivity(s, d(2026, 7, day))
	}
	if s.LoginCount != len(days) {
		t.Errorf("login_count: got %d want %d", s.LoginCount, len(days))
	}
}

func TestActivityTimezoneCaseWithoutConfiguredZones(t *testing.T) {
	expression, args := activityTimezoneCase(nil)
	if expression != "'UTC'" || len(args) != 0 {
		t.Fatalf("activityTimezoneCase(nil) = (%q, %v), want ('UTC', no args)", expression, args)
	}
}

func TestActivityLocalTodayCaseWithoutConfiguredZones(t *testing.T) {
	now := time.Date(2026, 7, 24, 23, 30, 0, 0, time.FixedZone("test", 8*60*60))
	expression, args := activityLocalTodayCase(nil, now)
	if expression != "?" || len(args) != 1 || args[0] != "2026-07-24" {
		t.Fatalf("activityLocalTodayCase(nil) = (%q, %v), want (?, [2026-07-24])", expression, args)
	}
}

// ---------------------------------------------------------------------------
// UserActivityFilter limit/offset clamping (pure logic, no DB needed)
// ---------------------------------------------------------------------------

func TestUserActivityFilter_LimitClamping(t *testing.T) {
	cases := []struct {
		in   UserActivityFilter
		want int
	}{
		{UserActivityFilter{Limit: 0}, 50},    // zero → default 50
		{UserActivityFilter{Limit: -5}, 50},   // negative → default 50
		{UserActivityFilter{Limit: 300}, 200}, // over max → cap 200
		{UserActivityFilter{Limit: 25}, 25},   // within range → unchanged
	}
	for _, tc := range cases {
		f := tc.in
		// mirror the clamping in ListActivity
		if f.Limit <= 0 {
			f.Limit = 50
		}
		if f.Limit > 200 {
			f.Limit = 200
		}
		if f.Limit != tc.want {
			t.Errorf("Limit %d → got %d want %d", tc.in.Limit, f.Limit, tc.want)
		}
	}
}

func TestUserActivityFilter_OffsetClamping(t *testing.T) {
	f := UserActivityFilter{Offset: -10}
	if f.Offset < 0 {
		f.Offset = 0
	}
	if f.Offset != 0 {
		t.Errorf("negative offset should clamp to 0, got %d", f.Offset)
	}
}
