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
	"fmt"
	"strings"
	"time"

	"github.com/apache/airavata-custos/internal/store"
)

const loginDateLayout = "2006-01-02"

// RecordLoginEventInput is trusted login-session evidence normalized by the HTTP layer.
type RecordLoginEventInput struct {
	EventKey   string
	OccurredAt time.Time
	Provider   string
	SessionID  string
}

// RecordLoginEventResult reports whether the event was newly persisted.
type RecordLoginEventResult struct {
	Recorded bool `json:"recorded"`
}

// RecordLoginEvent atomically persists one unique login event, its daily fact, and summaries.
func (s *Service) RecordLoginEvent(ctx context.Context, userID string, input RecordLoginEventInput) (*RecordLoginEventResult, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(input.EventKey) == "" || input.OccurredAt.IsZero() {
		return nil, fmt.Errorf("%w: user, event key, and occurrence time are required", ErrInvalidInput)
	}
	if input.OccurredAt.After(nowUTC().Add(5 * time.Minute)) {
		return nil, fmt.Errorf("%w: occurrence time is too far in the future", ErrInvalidInput)
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("load login user: %w", err)
	}
	if user == nil {
		return nil, ErrNotFound
	}
	timezone := ""
	if user.Timezone != nil {
		timezone = *user.Timezone
	}
	effectiveTimezone, localDate := resolveLoginLocalDate(input.OccurredAt, timezone)
	event := store.LoginEvent{
		ID:         newID(),
		EventKey:   input.EventKey,
		UserID:     userID,
		OccurredAt: input.OccurredAt.UTC(),
		LocalDate:  localDate,
		Timezone:   effectiveTimezone,
		Provider:   input.Provider,
		SessionID:  input.SessionID,
	}
	var recorded bool
	if err := s.inTx(ctx, func(tx *sql.Tx) error {
		var err error
		recorded, err = s.loginActivity.Record(ctx, tx, event)
		return err
	}); err != nil {
		return nil, fmt.Errorf("record login event: %w", err)
	}
	return &RecordLoginEventResult{Recorded: recorded}, nil
}

func resolveLoginLocalDate(occurredAt time.Time, timezone string) (string, string) {
	location, err := time.LoadLocation(timezone)
	if timezone == "" || err != nil {
		timezone = "UTC"
		location = time.UTC
	}
	return timezone, occurredAt.In(location).Format(loginDateLayout)
}

func consecutiveStreak(descendingDates []string) (uint64, error) {
	if len(descendingDates) == 0 {
		return 0, nil
	}
	previous, err := time.Parse(loginDateLayout, descendingDates[0])
	if err != nil {
		return 0, fmt.Errorf("parse latest login date: %w", err)
	}
	streak := uint64(1)
	for _, raw := range descendingDates[1:] {
		current, err := time.Parse(loginDateLayout, raw)
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
