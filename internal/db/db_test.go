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

package db

import (
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
)

func TestNormalizeDSNForcesUTC(t *testing.T) {
	got, err := normalizeDSN("admin:admin@tcp(localhost:3306)/custos?parseTime=true&charset=utf8mb4")
	if err != nil {
		t.Fatalf("normalize DSN: %v", err)
	}

	cfg, err := mysql.ParseDSN(got)
	if err != nil {
		t.Fatalf("parse normalized DSN: %v", err)
	}
	if cfg.Loc != time.UTC {
		t.Errorf("location: got %v want UTC", cfg.Loc)
	}
	if got := cfg.Params["time_zone"]; got != "'+00:00'" {
		t.Errorf("time_zone: got %q want %q", got, "'+00:00'")
	}
	if !cfg.ParseTime {
		t.Error("normalizeDSN must preserve parseTime=true")
	}
	if got := cfg.Params["charset"]; got != "utf8mb4" {
		t.Errorf("charset: got %q want utf8mb4", got)
	}
}

func TestNormalizeDSNRejectsInvalidDSN(t *testing.T) {
	if _, err := normalizeDSN("not a valid DSN"); err == nil {
		t.Fatal("expected invalid DSN error")
	}
}
