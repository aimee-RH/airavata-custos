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
	"context"
	"database/sql"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/apache/airavata-custos/internal/store"
)

type loginSummary struct {
	LastLogin          time.Time `db:"last_login"`
	LastLoginLocalDate string    `db:"last_login_local_date"`
	LoginCount         uint64    `db:"login_count"`
	LoginDayCount      uint64    `db:"login_day_count"`
	LoginStreak        uint64    `db:"login_streak"`
}

func TestRecordLoginEventLifecycleIntegration(t *testing.T) {
	database := setupTestDB(t)
	userID := seedUser(t, database, "login-activity@example.org")
	if _, err := database.Exec(`UPDATE users SET timezone = 'America/New_York' WHERE id = ?`, userID); err != nil {
		t.Fatal(err)
	}
	svc := newTestService(database)
	ctx := context.Background()

	record := func(key, timestamp string) *RecordLoginEventResult {
		t.Helper()
		occurredAt, err := time.Parse(time.RFC3339, timestamp)
		if err != nil {
			t.Fatal(err)
		}
		result, err := svc.RecordLoginEvent(ctx, userID, RecordLoginEventInput{EventKey: key, OccurredAt: occurredAt, Provider: "keycloak", SessionID: key})
		if err != nil {
			t.Fatalf("record %s: %v", key, err)
		}
		return result
	}

	if !record("event-1", "2026-07-01T14:00:00Z").Recorded {
		t.Fatal("first event should be recorded")
	}
	if !record("event-2", "2026-07-01T20:00:00Z").Recorded {
		t.Fatal("second same-day event should be recorded")
	}
	if !record("event-3", "2026-07-02T14:00:00Z").Recorded {
		t.Fatal("next-day event should be recorded")
	}
	if !record("event-4", "2026-07-04T14:00:00Z").Recorded {
		t.Fatal("post-gap event should be recorded")
	}
	if record("event-4", "2026-07-04T14:00:00Z").Recorded {
		t.Fatal("duplicate event should be idempotent")
	}
	if !record("late-event", "2026-06-30T14:00:00Z").Recorded {
		t.Fatal("late unique event should be recorded")
	}

	var got loginSummary
	if err := database.Get(&got, `SELECT last_login, DATE_FORMAT(last_login_local_date, '%Y-%m-%d') AS last_login_local_date, login_count, login_day_count, login_streak FROM users WHERE id = ?`, userID); err != nil {
		t.Fatal(err)
	}
	wantLast, _ := time.Parse(time.RFC3339, "2026-07-04T14:00:00Z")
	if !got.LastLogin.Equal(wantLast) || got.LastLoginLocalDate != "2026-07-04" || got.LoginCount != 5 || got.LoginDayCount != 4 || got.LoginStreak != 1 {
		t.Fatalf("summary = %+v, want last=%v local=2026-07-04 count=5 days=4 streak=1", got, wantLast)
	}

	var dailyCount uint64
	if err := database.Get(&dailyCount, `SELECT login_count FROM user_login_daily WHERE user_id = ? AND local_date = '2026-07-01'`, userID); err != nil {
		t.Fatal(err)
	}
	if dailyCount != 2 {
		t.Fatalf("same-day login count = %d, want 2", dailyCount)
	}
}

func TestRecordLoginEventConcurrentEventsRemainConsistentIntegration(t *testing.T) {
	database := setupTestDB(t)
	userID := seedUser(t, database, "concurrent-login@example.org")
	svc := newTestService(database)
	occurredAt, err := time.Parse(time.RFC3339, "2026-07-01T14:00:00Z")
	if err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, key := range []string{"concurrent-1", "concurrent-2"} {
		key := key
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			result, recordErr := svc.RecordLoginEvent(context.Background(), userID, RecordLoginEventInput{
				EventKey: key, OccurredAt: occurredAt, Provider: "oidc", SessionID: key,
			})
			if recordErr == nil && !result.Recorded {
				recordErr = sql.ErrNoRows
			}
			errs <- recordErr
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	for recordErr := range errs {
		if recordErr != nil {
			t.Fatalf("concurrent record failed: %v", recordErr)
		}
	}

	var eventCount, dailyCount uint64
	if err := database.Get(&eventCount, `SELECT COUNT(*) FROM user_login_events WHERE user_id = ?`, userID); err != nil {
		t.Fatal(err)
	}
	if err := database.Get(&dailyCount, `SELECT login_count FROM user_login_daily WHERE user_id = ?`, userID); err != nil {
		t.Fatal(err)
	}
	var summary loginSummary
	if err := database.Get(&summary, `SELECT last_login, DATE_FORMAT(last_login_local_date, '%Y-%m-%d') AS last_login_local_date, login_count, login_day_count, login_streak FROM users WHERE id = ?`, userID); err != nil {
		t.Fatal(err)
	}
	if eventCount != 2 || dailyCount != 2 || summary.LoginCount != 2 || summary.LoginDayCount != 1 || summary.LoginStreak != 1 {
		t.Fatalf("facts and summary diverged: events=%d daily=%d summary=%+v", eventCount, dailyCount, summary)
	}
}

func TestLoginActivityTransactionRollbackLeavesNoPartialWritesIntegration(t *testing.T) {
	database := setupTestDB(t)
	userID := seedUser(t, database, "rollback-login@example.org")
	activityStore := store.NewLoginActivityStore(database)
	tx, err := database.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	recorded, err := activityStore.Record(context.Background(), tx, store.LoginEvent{
		ID: uuid.NewString(), EventKey: "rollback-event", UserID: userID,
		OccurredAt: time.Date(2026, 7, 1, 14, 0, 0, 0, time.UTC),
		LocalDate:  "2026-07-01", Timezone: "UTC", Provider: "oidc", SessionID: "rollback-event",
	})
	if err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if !recorded {
		_ = tx.Rollback()
		t.Fatal("new event should be recorded inside transaction")
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}

	var eventCount, dailyCount uint64
	if err := database.Get(&eventCount, `SELECT COUNT(*) FROM user_login_events WHERE user_id = ?`, userID); err != nil {
		t.Fatal(err)
	}
	if err := database.Get(&dailyCount, `SELECT COUNT(*) FROM user_login_daily WHERE user_id = ?`, userID); err != nil {
		t.Fatal(err)
	}
	var summary struct {
		LoginCount    uint64 `db:"login_count"`
		LoginDayCount uint64 `db:"login_day_count"`
		LoginStreak   uint64 `db:"login_streak"`
	}
	if err := database.Get(&summary, `SELECT login_count, login_day_count, login_streak FROM users WHERE id = ?`, userID); err != nil {
		t.Fatal(err)
	}
	if eventCount != 0 || dailyCount != 0 || summary.LoginCount != 0 || summary.LoginDayCount != 0 || summary.LoginStreak != 0 {
		t.Fatalf("rollback left partial writes: events=%d daily=%d summary=%+v", eventCount, dailyCount, summary)
	}
}
