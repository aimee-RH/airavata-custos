<!--
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements. See the NOTICE file
    distributed with this work for additional information.
    Licensed under the Apache License, Version 2.0.
-->

# Super Admin User Activity Analytics Specification

## 1. Goal

Provide authorized administrators with reliable user login activity while preserving enough historical facts to support long-term engagement, active-day, monthly-active-day, and login-frequency analysis.

The first release exposes four core metrics:

| Metric | Meaning |
|---|---|
| `last_login` | Latest successful real authentication time |
| `login_count` | Lifetime count of unique successful login sessions |
| `login_day_count` | Lifetime count of distinct local calendar days containing a login |
| `current_streak` | Current consecutive local calendar days containing a login |

It also reports how many users, and which users, have not logged in for a configurable number of calendar days. The default threshold is seven days.

## 2. Authorization

Reading another user's activity requires:

```text
core:users:activity:read
```

Default policy:

| Role | Access |
|---|---:|
| `super_admin` | Yes |
| `operator` | No |
| `pi` | No |
| `auditor` | No by default |
| Custom security role | Only when explicitly granted |

Routes check the privilege, not a hard-coded role name. The bootstrap `super_admin` role receives all `models.KnownPrivileges()`, so registering this privilege grants it automatically.

The frontend maps this privilege to `read UserActivity`, hides the Activity tab without it, and handles direct unauthorized navigation. Backend authorization remains the security boundary.

## 3. Metric semantics

### 3.1 Last login

`last_login` is the UTC timestamp of the newest successful real authentication.

- Update only when a new portal login/session is established.
- API requests, token verification, caller resolution, and page refreshes do not update it.
- An out-of-order event never moves it backwards.

### 3.2 Total login count

`login_count` is the number of unique successful login sessions.

- Each independent login increments it once.
- Multiple logins on the same day each increment it.
- A duplicate callback/session does not increment it.

### 3.3 Active-day count

`login_day_count` is the number of distinct user-local dates with at least one login.

- Multiple logins on one local date increment it once.
- Dates need not be consecutive.
- Example: 35 logins across 10 dates means `login_count = 35`, `login_day_count = 10`.

### 3.4 Current streak

`login_streak` stores the streak at the most recently recorded local login date.

- First login: 1.
- Same local date: unchanged.
- Immediately following local date: increment by one.
- After a missed local date: reset to 1.

The API derives `current_streak` for display:

- Last login local date is today or yesterday: stored streak.
- Last login local date is earlier: 0.

### 3.5 Last login local date

Use `last_login_local_date DATE` as the most recent local date counted toward active days and streaks. It replaces the less explicit `streak_last_day` name.

## 4. Time zones and calendar days

Absolute timestamps are stored in UTC. Calendar-day metrics use the user's effective IANA time zone, such as `America/New_York`, `Asia/Shanghai`, or `Europe/Berlin`.

Effective time zone precedence:

1. User time zone.
2. Organization default time zone.
3. UTC.

Do not use fixed offsets because they cannot model daylight-saving changes. Each historical login fact records the time zone used to derive its local date; later profile changes do not rewrite history by default.

## 5. Inactivity

For threshold `N`, a user is inactive when:

```text
user-local today - last_login_local_date >= N calendar days
```

Never-logged-in users are always included. The default threshold is 7. UI wording is:

```text
Inactive for 7 calendar days or more
```

## 6. Data model

### 6.1 User summaries

```sql
ALTER TABLE users
    ADD COLUMN timezone              VARCHAR(64) NULL,
    ADD COLUMN last_login            TIMESTAMP(6) NULL,
    ADD COLUMN last_login_local_date DATE NULL,
    ADD COLUMN login_count           BIGINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN login_day_count       INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN login_streak          INT UNSIGNED NOT NULL DEFAULT 0;
```

These columns provide fast list-page reads but are not the sole historical source of truth.

### 6.2 Login event facts

```sql
CREATE TABLE user_login_events (
    id           VARCHAR(255) NOT NULL,
    event_key    VARCHAR(255) NOT NULL,
    user_id      VARCHAR(255) NOT NULL,
    occurred_at  TIMESTAMP(6) NOT NULL,
    local_date   DATE NOT NULL,
    timezone     VARCHAR(64) NOT NULL,
    provider     VARCHAR(64) NULL,
    session_id   VARCHAR(255) NULL,
    created_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_login_event_key (event_key),
    KEY idx_user_login_time (user_id, occurred_at),
    KEY idx_user_login_date (user_id, local_date),
    CONSTRAINT fk_user_login_event_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

`event_key` is mandatory and stable across retries. Preferred sources are OIDC `sid`, OIDC `jti`, portal session ID, or a stable composite of issuer, subject, authentication time, and session identifier.

### 6.3 Daily facts

```sql
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
```

This table supports monthly active days, rolling-window active days, login frequency, streak reconstruction, and summary repair.

## 7. Login capture flow

Do not record logins inside `ResolveCaller`; it runs during ordinary protected API requests.

Required flow:

1. OIDC authentication succeeds.
2. A new portal session is created.
3. Portal obtains a stable event key and authentication time.
4. Portal submits a self-login event to the backend.
5. Backend resolves the authenticated user from the bearer token.
6. Backend resolves the effective time zone and derives `local_date`.
7. Backend records event, daily fact, and summaries in one transaction.

Recommended endpoint:

```text
POST /me/login-events
```

Example body:

```json
{
  "event_key": "issuer|subject|sid|auth_time",
  "occurred_at": "2026-07-23T13:20:00Z",
  "provider": "keycloak",
  "session_id": "session-id"
}
```

The client cannot choose `user_id`. A duplicate `event_key` returns idempotent success.

## 8. Transaction, idempotency, and ordering

A single database transaction must:

1. Insert `user_login_events`.
2. Return idempotent success if `event_key` already exists.
3. Upsert `user_login_daily`.
4. Increment `users.login_count` for a new event.
5. Increment `login_day_count` only for a new local date.
6. Update/rebuild streak from daily facts.
7. Monotonically update `last_login` and `last_login_local_date`.

Store writes accept `*sql.Tx` and are called through `s.inTx`. The initial implementation is synchronous; it must not launch unconstrained goroutines.

A unique older event may increase login/event and active-day counts, but must not move last-login fields backwards or overwrite the current streak with stale state.

## 9. Read APIs

### 9.1 Activity summaries

```text
GET /users/activity
```

Parameters:

```text
query
limit
order
sort
direction
```

Required first-release item fields:

```json
{
  "user_id": "u-1",
  "name": "Alice",
  "email": "alice@example.org",
  "effective_timezone": "America/New_York",
  "last_login": "2026-07-23T13:20:00Z",
  "last_login_local_date": "2026-07-23",
  "login_count": 135,
  "login_day_count": 82,
  "current_streak": 7,
  "average_logins_per_active_day": 1.65
}
```

Response includes accurate server-side `total`, `limit`, and `offset`.

### 9.2 Inactive users

Preferred endpoint:

```text
GET /users/inactive?days=7&query=&limit=50&offset=0
```

It returns inactive items, accurate total count across all users, threshold, limit, and offset. Keeping `GET /users/activity?inactive_days=7` is acceptable, but a separate endpoint gives clearer semantics and cache behavior.

## 10. Validation

The handler strictly parses values and the service enforces:

- `days` between 1 and 3650.
- `limit` between 1 and 200.
- `offset >= 0`.
- `sort` belongs to an allowlist.
- `direction` is `asc` or `desc`.

Malformed values return `ErrInvalidInput` and HTTP 400. They are not silently replaced through `atoiOr`.

## 11. Super Admin UI

First-release table columns:

- Name.
- Last Login.
- Total Logins.
- Active Days.
- Current Streak.
- Average Logins / Active Day.

The inactive panel:

- Defaults to seven days.
- Supports 3 days, 7 days, and custom 1–3650 days.
- Uses backend `total` for its badge.
- Initially shows five users.
- Loads additional pages on Show more.
- Places never-logged-in users first.

Search, filtering, sorting, and pagination operate server-side when they must cover the full user population.

## 12. Derived analytics

From `user_login_daily`, later releases may expose:

- Active days this month.
- Active days in the last 7/30/90 days.
- Login count this month or in rolling windows.
- Average logins per active day: `login_count / login_day_count` (null when day count is zero).
- Lifetime active rate: `login_day_count / calendar days since activation` after a reliable activation timestamp exists.

Windowed values are derived or cached; they are not permanent columns on `users`.

## 13. Acceptance tests

### Login metrics

- First login: count 1, active days 1, streak 1.
- Second login on same local date: count 2, active days 1, streak 1.
- Login next local date: count 3, active days 2, streak 2.
- Login after a missed date: count 4, active days 3, streak 1.
- Duplicate event key: no metric changes.
- Late older event: last login does not regress and summaries remain correct.

### Time zones

Cover UTC, `America/New_York`, `Asia/Shanghai`, daylight-saving transitions, UTC dates that cross a user-local boundary, and UTC fallback.

### Inactivity

- Six inactive calendar days: excluded by a seven-day filter.
- Exactly seven: included.
- Eight: included.
- Never logged in: included.
- More than 50 matches: total remains correct and paging has no duplicates or omissions.

### Authorization

- `super_admin`: 200.
- `UsersRead` only: 403.
- `operator`: 403.
- `pi`: 403.
- `auditor`: 403 by default.
- Custom role with `UsersActivityRead`: 200.

## 14. Delivery phases

### Phase 1 — Correct data capture

Add time zone, active-day count, event facts, and daily facts; remove recording from `ResolveCaller`; connect the real OIDC session event; implement idempotent transactional updates.

### Phase 2 — Correct read behavior

Implement server-side activity/inactive queries, strict validation, accurate totals, pagination, search, and sorting.

### Phase 3 — UI completion

Add Active Days and average-frequency columns; send filters to the backend; use backend totals; replace local Show more with page loading; enforce page-level ability handling.

### Phase 4 — Analytics

Add monthly and rolling active-day/login metrics, lifetime engagement, trends, and export as separate requirements.
