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
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

// LoginEvent is the trusted, normalized event persisted for a portal login.
type LoginEvent struct {
	ID         string
	EventKey   string
	UserID     string
	OccurredAt time.Time
	LocalDate  string
	Timezone   string
	Provider   string
	SessionID  string
}

// LoginActivityStore persists login facts and their user summary in one transaction.
type LoginActivityStore interface {
	Record(ctx context.Context, tx *sql.Tx, event LoginEvent) (bool, error)
}

type mysqlLoginActivityStore struct {
	db *sqlx.DB
}

// NewLoginActivityStore returns a MySQL-backed login activity store.
func NewLoginActivityStore(db *sqlx.DB) LoginActivityStore {
	return &mysqlLoginActivityStore{db: db}
}

func (s *mysqlLoginActivityStore) Record(ctx context.Context, tx *sql.Tx, event LoginEvent) (bool, error) {
	var summary struct {
		LastLogin          sql.NullTime
		LastLoginLocalDate sql.NullString
		LoginCount         uint64
		LoginDayCount      uint64
		LoginStreak        uint64
	}
	if err := tx.QueryRowContext(ctx, `
		SELECT last_login, DATE_FORMAT(last_login_local_date, '%Y-%m-%d'),
		       login_count, login_day_count, login_streak
		FROM users WHERE id = ? FOR UPDATE`, event.UserID).Scan(
		&summary.LastLogin, &summary.LastLoginLocalDate, &summary.LoginCount,
		&summary.LoginDayCount, &summary.LoginStreak,
	); err != nil {
		return false, fmt.Errorf("lock login user: %w", err)
	}

	result, err := tx.ExecContext(ctx, `
		INSERT INTO user_login_events
		  (id, event_key, user_id, occurred_at, local_date, timezone, provider, session_id)
		VALUES (?, ?, ?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''))`,
		event.ID, event.EventKey, event.UserID, event.OccurredAt.UTC(), event.LocalDate,
		event.Timezone, event.Provider, event.SessionID,
	)
	if err != nil {
		var mysqlErr *mysql.MySQLError
		if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
			var existingUserID string
			if lookupErr := tx.QueryRowContext(ctx, `SELECT user_id FROM user_login_events WHERE event_key = ?`, event.EventKey).Scan(&existingUserID); lookupErr != nil {
				return false, fmt.Errorf("verify duplicate login event: %w", lookupErr)
			}
			if existingUserID != event.UserID {
				return false, fmt.Errorf("event key belongs to another user")
			}
			return false, nil
		}
		return false, fmt.Errorf("insert login event: %w", err)
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		return false, fmt.Errorf("insert login event affected %d rows: %w", affected, err)
	}

	var dayAlreadyExists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(
		SELECT 1 FROM user_login_daily WHERE user_id = ? AND local_date = ?
	)`, event.UserID, event.LocalDate).Scan(&dayAlreadyExists); err != nil {
		return false, fmt.Errorf("check login day: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO user_login_daily
		  (user_id, local_date, timezone, login_count, first_login_at, last_login_at)
		VALUES (?, ?, ?, 1, ?, ?)
		ON DUPLICATE KEY UPDATE
		  login_count = login_count + 1,
		  first_login_at = LEAST(first_login_at, VALUES(first_login_at)),
		  last_login_at = GREATEST(last_login_at, VALUES(last_login_at))`,
		event.UserID, event.LocalDate, event.Timezone, event.OccurredAt.UTC(), event.OccurredAt.UTC(),
	); err != nil {
		return false, fmt.Errorf("upsert login day: %w", err)
	}

	// The normal path is O(1): a strictly newer event whose local date does not
	// move backwards can update the materialized summary incrementally. Late,
	// tied, or timezone-shifted events fall back to an authoritative fact rebuild.
	if !summary.LastLogin.Valid || (event.OccurredAt.After(summary.LastLogin.Time) &&
		(!summary.LastLoginLocalDate.Valid || event.LocalDate >= summary.LastLoginLocalDate.String)) {
		loginDayCount := summary.LoginDayCount
		streak := summary.LoginStreak
		if !dayAlreadyExists {
			loginDayCount++
			if summary.LastLoginLocalDate.Valid {
				previous, parseErr := time.Parse("2006-01-02", summary.LastLoginLocalDate.String)
				current, currentErr := time.Parse("2006-01-02", event.LocalDate)
				if parseErr != nil || currentErr != nil {
					return false, fmt.Errorf("parse incremental login date: previous=%v current=%v", parseErr, currentErr)
				}
				if previous.AddDate(0, 0, 1).Equal(current) {
					streak++
				} else {
					streak = 1
				}
			} else {
				streak = 1
			}
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE users SET last_login = ?, last_login_local_date = ?,
			  login_count = ?, login_day_count = ?, login_streak = ?
			WHERE id = ?`, event.OccurredAt.UTC(), event.LocalDate,
			summary.LoginCount+1, loginDayCount, streak, event.UserID); err != nil {
			return false, fmt.Errorf("increment login summary: %w", err)
		}
		return true, nil
	}

	return rebuildLoginSummary(ctx, tx, event.UserID)
}

func rebuildLoginSummary(ctx context.Context, tx *sql.Tx, userID string) (bool, error) {
	var loginCount uint64
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_login_events WHERE user_id = ?`, userID).Scan(&loginCount); err != nil {
		return false, fmt.Errorf("count login events: %w", err)
	}

	rows, err := tx.QueryContext(ctx, `SELECT DATE_FORMAT(local_date, '%Y-%m-%d') FROM user_login_daily WHERE user_id = ? ORDER BY local_date DESC`, userID)
	if err != nil {
		return false, fmt.Errorf("list login days: %w", err)
	}
	var dates []string
	for rows.Next() {
		var date string
		if err := rows.Scan(&date); err != nil {
			_ = rows.Close()
			return false, fmt.Errorf("scan login day: %w", err)
		}
		dates = append(dates, date)
	}
	if err := rows.Close(); err != nil {
		return false, fmt.Errorf("close login days: %w", err)
	}
	if err := rows.Err(); err != nil {
		return false, fmt.Errorf("iterate login days: %w", err)
	}

	streak, err := streakFromDescendingDates(dates)
	if err != nil {
		return false, err
	}

	var latestAt time.Time
	var latestDate string
	if err := tx.QueryRowContext(ctx, `
		SELECT occurred_at, DATE_FORMAT(local_date, '%Y-%m-%d')
		FROM user_login_events
		WHERE user_id = ?
		ORDER BY occurred_at DESC, id DESC
		LIMIT 1`, userID).Scan(&latestAt, &latestDate); err != nil {
		return false, fmt.Errorf("select latest login: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE users SET
		  last_login = ?, last_login_local_date = ?, login_count = ?,
		  login_day_count = ?, login_streak = ?
		WHERE id = ?`, latestAt.UTC(), latestDate, loginCount, len(dates), streak, userID); err != nil {
		return false, fmt.Errorf("update login summary: %w", err)
	}
	return true, nil
}

func streakFromDescendingDates(dates []string) (uint64, error) {
	if len(dates) == 0 {
		return 0, nil
	}
	previous, err := time.Parse("2006-01-02", dates[0])
	if err != nil {
		return 0, fmt.Errorf("parse latest login date: %w", err)
	}
	streak := uint64(1)
	for _, value := range dates[1:] {
		current, err := time.Parse("2006-01-02", value)
		if err != nil {
			return 0, fmt.Errorf("parse login date: %w", err)
		}
		if !previous.AddDate(0, 0, -1).Equal(current) {
			break
		}
		streak++
		previous = current
	}
	return streak, nil
}
