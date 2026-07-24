-- Licensed to the Apache Software Foundation (ASF) under one
-- or more contributor license agreements.  See the NOTICE file
-- distributed with this work for additional information
-- regarding copyright ownership.  The ASF licenses this file
-- to you under the Apache License, Version 2.0 (the
-- "License"); you may not use this file except in compliance
-- with the License.  You may obtain a copy of the License at
--
--   http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing,
-- software distributed under the License is distributed on an
-- "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
-- KIND, either express or implied.  See the License for the
-- specific language governing permissions and limitations
-- under the License.

ALTER TABLE users
    ADD COLUMN timezone              VARCHAR(64)         NULL     DEFAULT NULL,
    ADD COLUMN last_login            TIMESTAMP(6)        NULL     DEFAULT NULL,
    ADD COLUMN last_login_local_date DATE                NULL     DEFAULT NULL,
    ADD COLUMN login_count           BIGINT UNSIGNED     NOT NULL DEFAULT 0,
    ADD COLUMN login_day_count       INT UNSIGNED        NOT NULL DEFAULT 0,
    ADD COLUMN login_streak          INT UNSIGNED        NOT NULL DEFAULT 0;

CREATE TABLE user_login_events (
    id          VARCHAR(255) NOT NULL,
    event_key   VARCHAR(255) NOT NULL,
    user_id     VARCHAR(255) NOT NULL,
    occurred_at TIMESTAMP(6) NOT NULL,
    local_date  DATE NOT NULL,
    timezone    VARCHAR(64) NOT NULL,
    provider    VARCHAR(64) NULL,
    session_id  VARCHAR(255) NULL,
    created_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_login_event_key (event_key),
    KEY idx_user_login_time (user_id, occurred_at),
    KEY idx_user_login_date (user_id, local_date),
    CONSTRAINT fk_user_login_event_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE user_login_daily (
    user_id        VARCHAR(255) NOT NULL,
    local_date     DATE NOT NULL,
    timezone       VARCHAR(64) NOT NULL,
    login_count    INT UNSIGNED NOT NULL DEFAULT 0,
    first_login_at TIMESTAMP(6) NOT NULL,
    last_login_at  TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (user_id, local_date),
    KEY idx_login_daily_date (local_date),
    CONSTRAINT fk_user_login_daily_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
