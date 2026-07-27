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
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/apache/airavata-custos/internal/store"
	"github.com/apache/airavata-custos/pkg/models"
)

type fakeUserStore struct {
	listActivityFn func(context.Context, store.UserActivityFilter) ([]store.UserActivityRow, int, error)
	analyticsFn    func(context.Context, time.Time, int) (*store.UserActivityAnalytics, error)
}

func (f *fakeUserStore) FindByID(context.Context, string) (*models.User, error)    { return nil, nil }
func (f *fakeUserStore) FindByEmail(context.Context, string) (*models.User, error) { return nil, nil }
func (f *fakeUserStore) List(context.Context, int, int) ([]models.User, int, error) {
	return nil, 0, nil
}
func (f *fakeUserStore) GetUserByOIDCSub(context.Context, string) (*models.User, error) {
	return nil, nil
}
func (f *fakeUserStore) FindByOrganization(context.Context, string) ([]models.User, error) {
	return nil, nil
}
func (f *fakeUserStore) Create(context.Context, *sql.Tx, *models.User) error { return nil }
func (f *fakeUserStore) Update(context.Context, *sql.Tx, *models.User) error { return nil }
func (f *fakeUserStore) UpdateStatus(context.Context, *sql.Tx, string, models.UserStatus) error {
	return nil
}
func (f *fakeUserStore) Delete(context.Context, *sql.Tx, string) error { return nil }
func (f *fakeUserStore) GetActivityAnalytics(ctx context.Context, now time.Time, days int) (*store.UserActivityAnalytics, error) {
	if f.analyticsFn == nil {
		return &store.UserActivityAnalytics{}, nil
	}
	return f.analyticsFn(ctx, now, days)
}
func (f *fakeUserStore) GetUserActivityAnalytics(ctx context.Context, _ string, now time.Time, days int) (*store.UserActivityAnalytics, error) {
	if f.analyticsFn == nil {
		return &store.UserActivityAnalytics{}, nil
	}
	return f.analyticsFn(ctx, now, days)
}

func (f *fakeUserStore) ListActivity(ctx context.Context, filter store.UserActivityFilter) ([]store.UserActivityRow, int, error) {
	if f.listActivityFn == nil {
		return nil, 0, nil
	}
	return f.listActivityFn(ctx, filter)
}

func TestListUserActivityValidatesFilter(t *testing.T) {
	tests := []struct {
		name   string
		filter store.UserActivityFilter
	}{
		{name: "zero limit", filter: store.UserActivityFilter{Limit: 0}},
		{name: "limit over maximum", filter: store.UserActivityFilter{Limit: 201}},
		{name: "negative offset", filter: store.UserActivityFilter{Limit: 50, Offset: -1}},
		{name: "negative inactive days", filter: store.UserActivityFilter{Limit: 50, InactiveDays: -1}},
		{name: "inactive days over maximum", filter: store.UserActivityFilter{Limit: 50, InactiveDays: 3651}},
		{name: "invalid sort", filter: store.UserActivityFilter{Limit: 50, Sort: "password"}},
		{name: "invalid direction", filter: store.UserActivityFilter{Limit: 50, Direction: "sideways"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &Service{users: &fakeUserStore{}}
			_, _, err := svc.ListUserActivity(t.Context(), tt.filter)
			if !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("error = %v, want ErrInvalidInput", err)
			}
		})
	}
}

func TestListUserActivityDefaultsAndDerivesMetrics(t *testing.T) {
	lastDate := "2026-07-23"
	var captured store.UserActivityFilter
	fake := &fakeUserStore{listActivityFn: func(_ context.Context, filter store.UserActivityFilter) ([]store.UserActivityRow, int, error) {
		captured = filter
		return []store.UserActivityRow{{
			UserID: "u-1", EffectiveTimezone: "America/New_York", LastLoginLocalDate: &lastDate,
			LoginCount: 5, LoginDayCount: 2, StoredLoginStreak: 4,
		}}, 1, nil
	}}
	now := time.Date(2026, 7, 24, 3, 0, 0, 0, time.UTC) // Still July 23 in New York.
	rows, total, err := (&Service{users: fake}).ListUserActivity(t.Context(), store.UserActivityFilter{
		Query: "  ALICE  ", Limit: 50, Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || captured.Query != "ALICE" || captured.Sort != "last_login" || captured.Direction != "desc" {
		t.Fatalf("unexpected query delegation: total=%d filter=%+v", total, captured)
	}
	if rows[0].CurrentStreak != 4 {
		t.Fatalf("current streak = %d, want 4", rows[0].CurrentStreak)
	}
	if rows[0].AverageLoginsPerActiveDay == nil || *rows[0].AverageLoginsPerActiveDay != 2.5 {
		t.Fatalf("average = %v, want 2.5", rows[0].AverageLoginsPerActiveDay)
	}
}

func TestListUserActivityExpiresOldStreakAndKeepsZeroDayAverageNull(t *testing.T) {
	lastDate := "2026-07-20"
	fake := &fakeUserStore{listActivityFn: func(context.Context, store.UserActivityFilter) ([]store.UserActivityRow, int, error) {
		return []store.UserActivityRow{{
			EffectiveTimezone: "UTC", LastLoginLocalDate: &lastDate, StoredLoginStreak: 9,
		}}, 1, nil
	}}
	rows, _, err := (&Service{users: fake}).ListUserActivity(t.Context(), store.UserActivityFilter{
		Limit: 50, Now: time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatal(err)
	}
	if rows[0].CurrentStreak != 0 || rows[0].AverageLoginsPerActiveDay != nil {
		t.Fatalf("unexpected derived metrics: %+v", rows[0])
	}
}

func TestListUserActivityWrapsStoreError(t *testing.T) {
	storeErr := errors.New("db is down")
	fake := &fakeUserStore{listActivityFn: func(context.Context, store.UserActivityFilter) ([]store.UserActivityRow, int, error) {
		return nil, 0, storeErr
	}}
	_, _, err := (&Service{users: fake}).ListUserActivity(t.Context(), store.UserActivityFilter{Limit: 50})
	if !errors.Is(err, storeErr) {
		t.Fatalf("error = %v, want wrapped store error", err)
	}
}

func TestUserActivityAnalyticsAcceptsCustomWindowAndRejectsOutOfRange(t *testing.T) {
	var captured int
	svc := &Service{users: &fakeUserStore{analyticsFn: func(_ context.Context, _ time.Time, days int) (*store.UserActivityAnalytics, error) {
		captured = days
		return &store.UserActivityAnalytics{WindowDays: days}, nil
	}}}

	if _, err := svc.GetUserActivityAnalytics(t.Context(), 14); err != nil {
		t.Fatal(err)
	}
	if captured != 14 {
		t.Fatalf("window = %d, want 14", captured)
	}
	for _, days := range []int{0, 366} {
		if _, err := svc.GetUserActivityAnalytics(t.Context(), days); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("window %d error = %v, want ErrInvalidInput", days, err)
		}
	}
}
