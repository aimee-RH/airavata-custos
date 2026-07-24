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
	"strings"
	"time"

	"github.com/jmoiron/sqlx"

	"github.com/apache/airavata-custos/pkg/models"
)

type mysqlUserStore struct {
	db *sqlx.DB
}

// NewUserStore returns a MySQL-backed UserStore.
func NewUserStore(db *sqlx.DB) UserStore {
	return &mysqlUserStore{db: db}
}

const userColumns = `id, organization_id, first_name, last_name, middle_name, email, status, type, timezone, last_login, last_login_local_date, login_count, login_day_count, login_streak`

func (s *mysqlUserStore) FindByID(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	err := s.db.GetContext(ctx, &u,
		`SELECT `+userColumns+` FROM users WHERE id = ?`, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (s *mysqlUserStore) List(ctx context.Context, limit, offset int) ([]models.User, int, error) {
	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM users`); err != nil {
		return nil, 0, err
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	var rows []models.User
	if err := s.db.SelectContext(ctx, &rows,
		`SELECT `+userColumns+` FROM users ORDER BY email LIMIT ? OFFSET ?`, limit, offset); err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func (s *mysqlUserStore) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := s.db.GetContext(ctx, &u,
		`SELECT `+userColumns+` FROM users WHERE email = ?`, email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

// GetUserByOIDCSub returns the user owning the user_identities row whose
// oidc_sub matches. Returns nil when the OIDC subject is empty or no row
// links it to a Custos user.
func (s *mysqlUserStore) GetUserByOIDCSub(ctx context.Context, oidcSub string) (*models.User, error) {
	if oidcSub == "" {
		return nil, nil
	}
	var u models.User
	err := s.db.GetContext(ctx, &u,
		`SELECT `+prefixed("u", userColumns)+`
		 FROM users u
		 JOIN user_identities ui ON ui.user_id = u.id
		 WHERE ui.oidc_sub = ?`, oidcSub)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

// prefixed returns the comma-separated column list with each bare column
// prefixed by alias. Used to disambiguate joined queries.
func prefixed(alias, columns string) string {
	parts := strings.Split(columns, ", ")
	for i, p := range parts {
		parts[i] = alias + "." + p
	}
	return strings.Join(parts, ", ")
}

func (s *mysqlUserStore) FindByOrganization(ctx context.Context, organizationID string) ([]models.User, error) {
	var users []models.User
	err := s.db.SelectContext(ctx, &users,
		`SELECT `+userColumns+` FROM users WHERE organization_id = ?`, organizationID)
	if err != nil {
		return nil, err
	}
	return users, nil
}

func (s *mysqlUserStore) Create(ctx context.Context, tx *sql.Tx, u *models.User) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO users (id, organization_id, first_name, last_name, middle_name, email, status, type)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		u.ID, u.OrganizationID, u.FirstName, u.LastName, u.MiddleName, u.Email, u.Status, u.Type)
	return err
}

func (s *mysqlUserStore) Update(ctx context.Context, tx *sql.Tx, u *models.User) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE users SET organization_id = ?, first_name = ?, last_name = ?, middle_name = ?, email = ?, status = ?, type = ?
		 WHERE id = ?`,
		u.OrganizationID, u.FirstName, u.LastName, u.MiddleName, u.Email, u.Status, u.Type, u.ID)
	return err
}

func (s *mysqlUserStore) UpdateStatus(ctx context.Context, tx *sql.Tx, id string, status models.UserStatus) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE users SET status = ? WHERE id = ?`,
		status, id)
	return err
}

func (s *mysqlUserStore) Delete(ctx context.Context, tx *sql.Tx, id string) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	return err
}

// ListActivity returns a deterministically ordered page and an accurate filtered total.
func (s *mysqlUserStore) ListActivity(ctx context.Context, f UserActivityFilter) ([]UserActivityRow, int, error) {
	zones, err := s.activityTimezones(ctx)
	if err != nil {
		return nil, 0, err
	}
	effectiveZoneSQL, effectiveZoneArgs := activityTimezoneCase(zones)
	localTodaySQL, localTodayArgs := activityLocalTodayCase(zones, f.Now)
	search := "%" + escapeLike(strings.ToLower(f.Query)) + "%"
	where := `WHERE (? = '' OR LOWER(email) LIKE ? ESCAPE '\\' OR LOWER(TRIM(CONCAT_WS(' ', first_name, middle_name, last_name))) LIKE ? ESCAPE '\\')`
	whereArgs := []any{f.Query, search, search}
	if f.InactiveDays > 0 {
		where += ` AND (last_login_local_date IS NULL OR DATEDIFF(` + localTodaySQL + `, last_login_local_date) >= ?)`
		whereArgs = append(whereArgs, localTodayArgs...)
		whereArgs = append(whereArgs, f.InactiveDays)
	}

	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM users u `+where, whereArgs...); err != nil {
		return nil, 0, err
	}

	orderSQL, orderArgs := activityOrder(f, localTodaySQL, localTodayArgs)
	inactiveDaysSQL := "NULL"
	inactiveDaysArgs := []any(nil)
	if f.InactiveDays > 0 {
		inactiveDaysSQL = `CASE WHEN u.last_login_local_date IS NULL THEN NULL ELSE DATEDIFF(` + localTodaySQL + `, u.last_login_local_date) END`
		inactiveDaysArgs = append(inactiveDaysArgs, localTodayArgs...)
	}
	query := `SELECT
		u.id AS user_id,
		COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS name,
		u.email,
		` + effectiveZoneSQL + ` AS effective_timezone,
		u.last_login,
		DATE_FORMAT(u.last_login_local_date, '%Y-%m-%d') AS last_login_local_date,
		` + inactiveDaysSQL + ` AS inactive_days,
		u.login_count,
		u.login_day_count,
		u.login_streak AS stored_login_streak
	FROM users u ` + where + ` ORDER BY ` + orderSQL + ` LIMIT ? OFFSET ?`
	args := append([]any{}, effectiveZoneArgs...)
	args = append(args, inactiveDaysArgs...)
	args = append(args, whereArgs...)
	args = append(args, orderArgs...)
	args = append(args, f.Limit, f.Offset)
	var rows []UserActivityRow
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// GetActivityAnalytics aggregates daily facts using each fact's recorded IANA
// timezone. Rolling and monthly boundaries therefore follow the same user-local
// calendar semantics used when user_login_daily was written.
func (s *mysqlUserStore) GetActivityAnalytics(ctx context.Context, now time.Time, windowDays int) (*UserActivityAnalytics, error) {
	zones, err := s.dailyActivityTimezones(ctx)
	if err != nil {
		return nil, err
	}
	windowStartSQL, windowStartArgs := activityDateCase("d.timezone", zones, now, func(localNow time.Time) time.Time {
		return localNow.AddDate(0, 0, -(windowDays - 1))
	})
	localTodaySQL, localTodayArgs := activityDateCase("d.timezone", zones, now, func(localNow time.Time) time.Time {
		return localNow
	})
	monthStartSQL, monthStartArgs := activityDateCase("d.timezone", zones, now, func(localNow time.Time) time.Time {
		return time.Date(localNow.Year(), localNow.Month(), 1, 0, 0, 0, 0, localNow.Location())
	})
	windowCondition := "d.local_date BETWEEN " + windowStartSQL + " AND " + localTodaySQL
	windowArgs := append(append([]any{}, windowStartArgs...), localTodayArgs...)
	monthCondition := "d.local_date BETWEEN " + monthStartSQL + " AND " + localTodaySQL
	monthArgs := append(append([]any{}, monthStartArgs...), localTodayArgs...)

	result := &UserActivityAnalytics{GeneratedAt: now.UTC(), WindowDays: windowDays, Trend: []UserActivityTrendPoint{}}
	summary := `SELECT
		(SELECT COUNT(*) FROM users) AS total_users,
		(SELECT COUNT(*) FROM users WHERE login_count > 0) AS users_ever_logged_in,
		COALESCE(SUM(d.login_count), 0) AS lifetime_login_count,
		COUNT(*) AS lifetime_active_days,
		COUNT(DISTINCT CASE WHEN ` + windowCondition + ` THEN d.user_id END) AS active_users,
		COALESCE(SUM(CASE WHEN ` + windowCondition + ` THEN d.login_count ELSE 0 END), 0) AS window_login_count,
		COUNT(CASE WHEN ` + windowCondition + ` THEN 1 END) AS window_active_days,
		COUNT(DISTINCT CASE WHEN ` + monthCondition + ` THEN d.user_id END) AS monthly_active_users,
		COALESCE(SUM(CASE WHEN ` + monthCondition + ` THEN d.login_count ELSE 0 END), 0) AS monthly_login_count,
		COUNT(CASE WHEN ` + monthCondition + ` THEN 1 END) AS monthly_active_days
	FROM user_login_daily d`
	summaryArgs := make([]any, 0, 3*len(windowArgs)+3*len(monthArgs))
	for range 3 {
		summaryArgs = append(summaryArgs, windowArgs...)
	}
	for range 3 {
		summaryArgs = append(summaryArgs, monthArgs...)
	}
	if err := s.db.GetContext(ctx, result, summary, summaryArgs...); err != nil {
		return nil, err
	}
	if result.WindowActiveDays > 0 {
		average := float64(result.WindowLoginCount) / float64(result.WindowActiveDays)
		result.AverageLoginsPerDay = &average
	}
	trend := `SELECT DATE_FORMAT(d.local_date, '%Y-%m-%d') AS date,
		COUNT(DISTINCT d.user_id) AS active_users, SUM(d.login_count) AS login_count
	FROM user_login_daily d WHERE ` + windowCondition + `
	GROUP BY d.local_date ORDER BY d.local_date`
	if err := s.db.SelectContext(ctx, &result.Trend, trend, windowArgs...); err != nil {
		return nil, err
	}
	return result, nil
}

// GetUserActivityAnalytics returns the same engagement dimensions as the
// system-wide report, restricted to one explicitly selected user.
func (s *mysqlUserStore) GetUserActivityAnalytics(ctx context.Context, userID string, now time.Time, windowDays int) (*UserActivityAnalytics, error) {
	zones, err := s.dailyActivityTimezones(ctx)
	if err != nil {
		return nil, err
	}
	windowStartSQL, windowStartArgs := activityDateCase("d.timezone", zones, now, func(localNow time.Time) time.Time {
		return localNow.AddDate(0, 0, -(windowDays - 1))
	})
	localTodaySQL, localTodayArgs := activityDateCase("d.timezone", zones, now, func(localNow time.Time) time.Time { return localNow })
	monthStartSQL, monthStartArgs := activityDateCase("d.timezone", zones, now, func(localNow time.Time) time.Time {
		return time.Date(localNow.Year(), localNow.Month(), 1, 0, 0, 0, 0, localNow.Location())
	})
	windowCondition := "d.local_date BETWEEN " + windowStartSQL + " AND " + localTodaySQL
	windowArgs := append(append([]any{}, windowStartArgs...), localTodayArgs...)
	monthCondition := "d.local_date BETWEEN " + monthStartSQL + " AND " + localTodaySQL
	monthArgs := append(append([]any{}, monthStartArgs...), localTodayArgs...)

	result := &UserActivityAnalytics{GeneratedAt: now.UTC(), WindowDays: windowDays, Trend: []UserActivityTrendPoint{}}
	summary := `SELECT
		(SELECT COUNT(*) FROM users WHERE id = ?) AS total_users,
		(SELECT COUNT(*) FROM users WHERE id = ? AND login_count > 0) AS users_ever_logged_in,
		COALESCE(SUM(d.login_count), 0) AS lifetime_login_count,
		COUNT(d.local_date) AS lifetime_active_days,
		COUNT(DISTINCT CASE WHEN ` + windowCondition + ` THEN d.user_id END) AS active_users,
		COALESCE(SUM(CASE WHEN ` + windowCondition + ` THEN d.login_count ELSE 0 END), 0) AS window_login_count,
		COUNT(CASE WHEN ` + windowCondition + ` THEN 1 END) AS window_active_days,
		COUNT(DISTINCT CASE WHEN ` + monthCondition + ` THEN d.user_id END) AS monthly_active_users,
		COALESCE(SUM(CASE WHEN ` + monthCondition + ` THEN d.login_count ELSE 0 END), 0) AS monthly_login_count,
		COUNT(CASE WHEN ` + monthCondition + ` THEN 1 END) AS monthly_active_days
	FROM user_login_daily d WHERE d.user_id = ?`
	summaryArgs := []any{userID, userID}
	for range 3 {
		summaryArgs = append(summaryArgs, windowArgs...)
	}
	for range 3 {
		summaryArgs = append(summaryArgs, monthArgs...)
	}
	summaryArgs = append(summaryArgs, userID)
	if err := s.db.GetContext(ctx, result, summary, summaryArgs...); err != nil {
		return nil, err
	}
	if result.WindowActiveDays > 0 {
		average := float64(result.WindowLoginCount) / float64(result.WindowActiveDays)
		result.AverageLoginsPerDay = &average
	}
	trend := `SELECT DATE_FORMAT(d.local_date, '%Y-%m-%d') AS date,
		COUNT(DISTINCT d.user_id) AS active_users, SUM(d.login_count) AS login_count
	FROM user_login_daily d WHERE ` + windowCondition + ` AND d.user_id = ?
	GROUP BY d.local_date ORDER BY d.local_date`
	trendArgs := append(append([]any{}, windowArgs...), userID)
	if err := s.db.SelectContext(ctx, &result.Trend, trend, trendArgs...); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *mysqlUserStore) activityTimezones(ctx context.Context) ([]string, error) {
	return s.validTimezones(ctx, `SELECT DISTINCT timezone FROM users WHERE timezone IS NOT NULL AND timezone <> ''`)
}

func (s *mysqlUserStore) dailyActivityTimezones(ctx context.Context) ([]string, error) {
	return s.validTimezones(ctx, `SELECT DISTINCT timezone FROM user_login_daily WHERE timezone <> ''`)
}

func (s *mysqlUserStore) validTimezones(ctx context.Context, query string) ([]string, error) {
	var candidates []string
	if err := s.db.SelectContext(ctx, &candidates, query); err != nil {
		return nil, err
	}
	zones := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		if _, err := time.LoadLocation(candidate); err == nil {
			zones = append(zones, candidate)
		}
	}
	return zones, nil
}

func activityTimezoneCase(zones []string) (string, []any) {
	if len(zones) == 0 {
		return "'UTC'", nil
	}
	var expression strings.Builder
	expression.WriteString("CASE u.timezone")
	args := make([]any, 0, len(zones)*2)
	for _, zone := range zones {
		expression.WriteString(" WHEN ? THEN ?")
		args = append(args, zone, zone)
	}
	expression.WriteString(" ELSE 'UTC' END")
	return expression.String(), args
}

func activityLocalTodayCase(zones []string, now time.Time) (string, []any) {
	return activityDateCase("u.timezone", zones, now, func(localNow time.Time) time.Time { return localNow })
}

func activityDateCase(column string, zones []string, now time.Time, dateFor func(time.Time) time.Time) (string, []any) {
	if len(zones) == 0 {
		return "?", []any{dateFor(now.UTC()).Format("2006-01-02")}
	}
	var expression strings.Builder
	expression.WriteString("CASE " + column)
	args := make([]any, 0, len(zones)*2+1)
	for _, zone := range zones {
		location, _ := time.LoadLocation(zone)
		expression.WriteString(" WHEN ? THEN ?")
		args = append(args, zone, dateFor(now.In(location)).Format("2006-01-02"))
	}
	expression.WriteString(" ELSE ? END")
	args = append(args, dateFor(now.UTC()).Format("2006-01-02"))
	return expression.String(), args
}

func activityOrder(f UserActivityFilter, localTodaySQL string, localTodayArgs []any) (string, []any) {
	direction := strings.ToUpper(f.Direction)
	columns := map[string]string{
		"name": "name", "last_login": "u.last_login", "login_count": "u.login_count",
		"login_day_count": "u.login_day_count", "current_streak": "current_streak",
	}
	if f.Sort == "inactivity" {
		return `u.last_login_local_date IS NULL DESC, u.last_login_local_date ASC, name ASC, u.id ASC`, nil
	}
	column := columns[f.Sort]
	if f.Sort == "current_streak" {
		column = `CASE WHEN u.last_login_local_date IS NOT NULL AND DATEDIFF(` + localTodaySQL + `, u.last_login_local_date) BETWEEN 0 AND 1 THEN u.login_streak ELSE 0 END`
	}
	nullOrder := ""
	if f.Sort == "last_login" {
		nullOrder = "u.last_login IS NULL ASC, "
	}
	args := []any(nil)
	if f.Sort == "current_streak" {
		args = append(args, localTodayArgs...)
	}
	return fmt.Sprintf("%s%s %s, name ASC, u.id ASC", nullOrder, column, direction), args
}

func escapeLike(value string) string {
	replacer := strings.NewReplacer(`\\`, `\\\\`, `%`, `\\%`, `_`, `\\_`)
	return replacer.Replace(value)
}
