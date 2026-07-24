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
	"fmt"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

// Config holds configuration for opening a database connection.
type Config struct {
	DSN          string
	MaxOpenConns int
	MaxIdleConns int
}

// normalizeDSN forces all database connections to use UTC for both MySQL
// session timestamp conversion and time.Time values scanned by the driver.
func normalizeDSN(dsn string) (string, error) {
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		return "", fmt.Errorf("parse database DSN: %w", err)
	}
	cfg.Loc = time.UTC
	if cfg.Params == nil {
		cfg.Params = make(map[string]string)
	}
	// MySQL system-variable values must be quoted; FormatDSN URL-escapes them.
	cfg.Params["time_zone"] = "'+00:00'"
	return cfg.FormatDSN(), nil
}

// Open opens and validates a MySQL/MariaDB connection using the supplied config.
func Open(cfg Config) (*sqlx.DB, error) {
	dsn, err := normalizeDSN(cfg.DSN)
	if err != nil {
		return nil, err
	}
	db, err := sqlx.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	db.SetMaxOpenConns(cfg.MaxOpenConns)
	db.SetMaxIdleConns(cfg.MaxIdleConns)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return db, nil
}
