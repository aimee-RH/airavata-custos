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
	"testing"
	"time"
)

func TestResolveLoginLocalDate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		occurredAt string
		timezone   string
		wantZone   string
		wantDate   string
	}{
		{name: "UTC", occurredAt: "2026-07-23T23:30:00Z", timezone: "UTC", wantZone: "UTC", wantDate: "2026-07-23"},
		{name: "New York previous date", occurredAt: "2026-07-23T02:30:00Z", timezone: "America/New_York", wantZone: "America/New_York", wantDate: "2026-07-22"},
		{name: "Shanghai next date", occurredAt: "2026-07-23T17:30:00Z", timezone: "Asia/Shanghai", wantZone: "Asia/Shanghai", wantDate: "2026-07-24"},
		{name: "spring DST", occurredAt: "2026-03-08T07:30:00Z", timezone: "America/New_York", wantZone: "America/New_York", wantDate: "2026-03-08"},
		{name: "fall DST first hour", occurredAt: "2026-11-01T05:30:00Z", timezone: "America/New_York", wantZone: "America/New_York", wantDate: "2026-11-01"},
		{name: "fall DST repeated hour", occurredAt: "2026-11-01T06:30:00Z", timezone: "America/New_York", wantZone: "America/New_York", wantDate: "2026-11-01"},
		{name: "missing falls back", occurredAt: "2026-07-23T23:30:00Z", timezone: "", wantZone: "UTC", wantDate: "2026-07-23"},
		{name: "invalid falls back", occurredAt: "2026-07-23T23:30:00Z", timezone: "Mars/Olympus", wantZone: "UTC", wantDate: "2026-07-23"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			occurredAt, err := time.Parse(time.RFC3339, tt.occurredAt)
			if err != nil {
				t.Fatal(err)
			}
			gotZone, gotDate := resolveLoginLocalDate(occurredAt, tt.timezone)
			if gotZone != tt.wantZone || gotDate != tt.wantDate {
				t.Fatalf("resolveLoginLocalDate() = (%q, %q), want (%q, %q)", gotZone, gotDate, tt.wantZone, tt.wantDate)
			}
		})
	}
}

func TestConsecutiveStreak(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		dates []string
		want  uint64
	}{
		{name: "none", want: 0},
		{name: "one", dates: []string{"2026-07-04"}, want: 1},
		{name: "consecutive descending", dates: []string{"2026-07-04", "2026-07-03", "2026-07-02"}, want: 3},
		{name: "stops at gap", dates: []string{"2026-07-04", "2026-07-02", "2026-07-01"}, want: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := consecutiveStreak(tt.dates)
			if err != nil {
				t.Fatalf("consecutiveStreak returned error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("consecutiveStreak() = %d, want %d", got, tt.want)
			}
		})
	}
}
