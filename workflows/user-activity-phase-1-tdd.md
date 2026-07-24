<!--
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements. See the NOTICE file
    distributed with this work for additional information.
    Licensed under the Apache License, Version 2.0.
-->

# User Activity Phase 1 TDD Workflow

## Purpose

Deliver Phase 1 (“Correct data capture”) from `docs/user-activity-spec.md` using strict test-driven development. A run is complete only when real, unique portal login sessions produce durable, time-zone-aware facts and correct summaries without ordinary API requests producing login activity.

This workflow is the source of truth for implementation behavior. `docs/user-activity-spec.md` remains the product specification, and `docs/progress.md` is the evidence log for each run.

## Trigger

Start a run when `docs/user-activity-spec.md` or `docs/progress.md` identifies Phase 1 work that is in scope and not complete. The first run starts with the current Phase 1 backlog.

Do not start a second run while one is unfinished. A specification change during a run invalidates only affected slices; return those slices to RED and preserve unaffected passing evidence.

## Scope

The run must deliver all of the following:

- Revise the uncommitted `000007_user_activity` migration rather than append a corrective migration.
- Add user time zone, `last_login_local_date`, `login_day_count`, final login-count/streak summary columns, login-event facts, and daily facts.
- Resolve effective time zone as valid user IANA time zone, otherwise UTC. Organization fallback is not part of this phase.
- Add a transactional and idempotent login-event recording service.
- Add authenticated self-recording at `POST /me/login-events`.
- Bind user identity, event identity, and occurrence time to verified OIDC claims or a server-created portal session. Never trust browser-selected `user_id`, event key, or occurrence time.
- Connect the NextAuth new-session callback to the endpoint.
- Remove all login writes from `ResolveCaller` and ordinary request authentication.
- Cover behavior with unit, handler, real MariaDB integration, frontend callback, mock Playwright, and live OIDC tests.
- Update `docs/progress.md` after every completed TDD slice.

The run must not implement Phase 2 server-side activity/inactivity querying or Phase 3 activity-page completion except where a test fixture must recognize a newly recorded login.

## Fixed decisions

### Trust boundary and event identity

The browser cannot submit arbitrary identity or activity facts. The portal’s server-side NextAuth callback creates the backend request after a new OIDC account callback.

Preferred verified source:

- `user_id`: resolved by the backend from the verified bearer token.
- Event identity: `iss + sub + sid + auth_time`.
- Occurrence time: verified `auth_time`.

Fallback when `sid` or `auth_time` is absent:

- NextAuth server creates a cryptographically random `portal_session_id` once for the new account callback.
- It records `session_created_at` once in the encrypted server-managed JWT session.
- Event identity is `iss + sub + portal_session_id + session_created_at`.
- Occurrence time is `session_created_at`.

If neither complete verified claims nor a complete server-created fallback exists, reject recording and write no facts. Never use request time plus a fresh random key on each request.

The backend accepts an occurrence time at most five minutes in the future. A value beyond that is invalid input. Historical authenticated events have no artificial age cutoff.

### Endpoint contract

`POST /me/login-events` requires authentication but no administrative privilege.

The request carries only the session evidence required by the chosen implementation. It must not permit caller-selected `user_id`. Backend validation must ensure identity/session values correspond to the verified bearer or to server-protected session evidence.

Responses:

- First insertion: `201 Created` with `{ "recorded": true }`.
- Existing event key: `200 OK` with `{ "recorded": false }`.
- Missing/invalid authentication: `401 Unauthorized`.
- Incomplete trusted session evidence, malformed time, or time over five minutes in the future: `400 Bad Request` backed by `service.ErrInvalidInput`.
- Transaction failure: `500 Internal Server Error`; no partial facts or summaries remain.

### Time zones and facts

- Store absolute timestamps in UTC.
- A valid user IANA time zone determines the event’s `local_date`.
- Missing or invalid user time zone falls back to UTC and emits a structured diagnostic without failing portal login.
- Each event stores the actual effective time zone used for that event.
- A daily row is keyed by `(user_id, local_date)`.
- If events derived under different time zones share a local date, the daily row keeps the time zone from the first event that created it; later events update counts and first/last timestamps without replacing that time zone.

### Transaction and ordering

For every candidate event, one database transaction must:

1. Insert the unique event fact or detect the duplicate event key.
2. Return idempotent success immediately for a duplicate without changing any daily fact or summary.
3. Lock the target user summary row with `SELECT ... FOR UPDATE`.
4. Upsert the daily fact.
5. Recompute authoritative summary values from persisted event/daily facts while holding the lock:
   - `login_count` is the count of unique events.
   - `login_day_count` is the count of daily facts.
   - `last_login` is the maximum event occurrence time.
   - `last_login_local_date` is the local date associated with the latest event; use a deterministic tie-breaker when occurrence timestamps are equal.
   - `login_streak` is the consecutive run ending on `last_login_local_date`.
6. Commit all changes together.

A unique late event may increase event and active-day counts and may change a reconstructed historical streak, but it cannot move `last_login` backwards. Concurrent distinct events for one user must serialize through the user-row lock. No unconstrained goroutine may perform these writes.

### Login UX and retries

Activity capture must not make a successful portal login fail. The NextAuth server performs at most three attempts using bounded exponential backoff and the same stable event identity for every attempt. After exhaustion it emits a structured error and permits the session to continue.

A token refresh, session callback, page refresh, `/me` call, or ordinary protected API call must not create a new login event. A later retry may resubmit the same event identity and relies on backend idempotency.

## Worktree safety

The worktree contains existing uncommitted feature work. Before editing:

1. Record `git status --short` and the relevant diff summary in the first run entry in `docs/progress.md`.
2. Treat all existing modifications and untracked files as user work.
3. Modify incrementally; never reset, restore, clean, stash, or overwrite unrelated changes.
4. If ownership of an existing change is unclear, preserve it and adapt around it.
5. Do not commit or push unless explicitly requested.

## TDD execution discipline

Execute slices in order. For every slice:

1. Add or revise the smallest tests that express the behavior.
2. Run the narrowest relevant command and capture a meaningful failure caused by missing/incorrect behavior, not a syntax error or broken fixture.
3. Add a `RED` entry to `docs/progress.md` containing the scenario, test names/paths, command, and concise failure reason.
4. Implement only enough production code to satisfy the slice while preserving previous behavior.
5. Run the narrow test until green, then run all previously completed slice tests.
6. Add a `GREEN` entry with changed behavior, files, command, result, and risks.
7. Refactor only while tests remain green; record significant design changes.

A test written after its implementation is not TDD evidence. Existing tests that encode obsolete semantics must first be replaced with specification tests and observed failing against the old implementation.

## TDD slices

### Slice 0 — Baseline and harness

Tests/checks first:

- Run the existing narrow Go activity tests and frontend activity/auth tests.
- Verify how integration-tag tests obtain `CORE_TEST_DATABASE_DSN` and migrate a disposable schema.
- Ensure tests can inject a clock, retry sleeper, ID/session generator, and backend fetch without real waiting or nondeterminism.

Expected RED evidence:

- Existing store simulation proves the wrong semantic: multiple same-day logins produce `login_count = 1`.
- Existing service tests prove `ResolveCaller` delegates to asynchronous `UpdateLoginActivity`.

Implementation:

- No behavior change yet. Establish deterministic seams only when a failing test requires them.

Acceptance:

- Baseline commands and known failures/pre-existing failures are recorded separately from changes introduced by this run.

### Slice 1 — Final migration and models

Tests first:

- Migration-up test asserts `users.timezone`, `last_login`, `last_login_local_date`, `login_count BIGINT UNSIGNED`, `login_day_count`, and `login_streak` exist with correct null/default behavior.
- Migration-up test asserts `user_login_events` and `user_login_daily`, indexes, uniqueness, and cascading foreign keys match the product specification.
- Migration-down test asserts both fact tables and all added user columns are removed.
- Model/store scan tests assert nullable dates/timestamps are represented safely.

Expected RED:

- Current `000007` has `streak_last_day`, lacks time zone/day count/fact tables, and uses the wrong login-count shape.

Implementation:

- Rewrite the still-uncommitted `internal/db/migrations/000007_user_activity.up.sql` and down migration.
- Update models and scans without creating `000008`.

Acceptance:

- Up/down/up succeeds on real MariaDB.
- Foreign-key cascade removes a user’s event and daily facts.

### Slice 2 — IANA time-zone resolution

Tests first:

- UTC mapping.
- `America/New_York` and `Asia/Shanghai` UTC timestamps crossing local date boundaries.
- New York spring-forward and fall-back transitions.
- Missing user time zone falls back to UTC.
- Invalid IANA name falls back to UTC and invokes the diagnostic seam.
- Derived timestamp is normalized to UTC while local date uses the effective location.

Expected RED:

- No user time zone or local-date resolver exists; current SQL derives database/UTC dates.

Implementation:

- Add a pure service-level resolver returning effective IANA name and local date.
- Read the user time zone needed by recording.

Acceptance:

- Tests do not depend on machine local time or fixed UTC offsets.

### Slice 3 — Transactional idempotent recording

Tests first, using service fakes for orchestration and MariaDB integration tests for SQL semantics:

- First login gives event count 1, day count 1, streak 1.
- A second distinct event on the same local date gives event count 2, day count 1, streak 1; daily count becomes 2 and first/last times are correct.
- Next local date gives counts 3/2 and streak 2.
- A date after a gap gives counts 4/3 and streak 1.
- Duplicate event key returns `recorded=false` and changes nothing.
- A late older unique event adds event/day facts but does not regress latest fields; streak is rebuilt from daily facts.
- Two distinct concurrent events for the same user both survive and summaries equal facts.
- Failure at event, daily, summary, or commit boundary leaves no partial write.
- Unknown user and malformed required input return typed errors.
- Daily time zone remains the creator’s time zone when a later same-date event uses another time zone.

Expected RED:

- Current `UpdateLoginActivity` has no transaction parameter, event identity, daily facts, duplicate handling, safe late-event behavior, or concurrency lock.

Implementation:

- Introduce event input/result types and dedicated activity stores as appropriate.
- All writes accept `*sql.Tx` and run synchronously through `s.inTx`.
- Lock and recompute according to “Transaction and ordering.”
- Remove/replace obsolete pure-Go simulations; never claim they prove SQL behavior.

Acceptance:

- Unit orchestration tests and tagged MariaDB scenarios pass repeatedly, including concurrency.

### Slice 4 — Remove request-path recording

Tests first:

- Cache miss in `ResolveCaller` performs identity resolution but no activity-store call.
- Cache hit performs no activity-store call.
- Repeated `/me` and protected requests do not change login facts in integration coverage.
- Source-level behavior has no `go recordLoginActivity` escape hatch.

Expected RED:

- `ResolveCaller` currently launches `go s.recordLoginActivity(...)` on a cache miss.

Implementation:

- Remove the goroutine, helper, obsolete `UpdateLoginActivity`, imports, mocks, and tests that assert the wrong behavior.

Acceptance:

- Identity resolution behavior remains intact while activity facts remain unchanged.

### Slice 5 — Authenticated self-recording endpoint

Tests first:

- Route requires authentication but does not require `UsersActivityRead`.
- Caller cannot choose `user_id`.
- First/duplicate response status and body match the endpoint contract.
- Missing bearer is 401.
- Missing trusted fields, malformed time, or time more than five minutes ahead is 400.
- Exactly five minutes of allowed clock skew is accepted using an injected clock.
- Service/transaction error maps to 500 without leaking internals.
- Verified caller identity is passed to recording.

Expected RED:

- Route and handler do not exist.

Implementation:

- Register `RequireAuth("POST /me/login-events", ...)` before wildcard-sensitive user routes if routing requires it.
- Decode strictly, reject unknown/ambiguous trust data as appropriate, and call the transactional service synchronously.
- Extend verified claims only as required; do not accept unverified claim copies from the request body.

Acceptance:

- Handler and route integration tests cover all statuses and self-only behavior.

### Slice 6 — NextAuth new-session capture

Tests first:

- Initial JWT callback with account data chooses a JWT-shaped bearer and submits one event.
- `sid`/`auth_time` claims create a stable event identity.
- Missing claim fallback creates one portal session ID/time and reuses it across retry attempts.
- A callback without `account` (refresh/read) submits nothing.
- Page/session refresh submits nothing.
- Three transient attempts use the same payload, bounded backoff, and then succeed or log exhaustion.
- Permanent 400 does not retry; transient network/5xx failures do.
- Capture exhaustion does not prevent the NextAuth token/session from being returned.
- Sensitive bearer/session values are absent from logs.

Expected RED:

- Current `jwt` callback only resolves `/me`; it has no event capture or stable fallback session metadata.

Implementation:

- Extract a testable server-only login-capture helper from `web/src/shared/auth/auth.ts` rather than testing NextAuth internals directly.
- Decode only the needed JWT claims. Backend remains the verifier/security boundary.
- Call the core backend directly from server-side auth code using the selected bearer; do not route this through browser page loads.

Acceptance:

- Unit tests prove exactly-once initiation per new account callback and same-key retry behavior.

### Slice 7 — End-to-end behavior

Tests first:

- Mock Playwright: successful sign-in/session fixture causes one capture; navigation and refresh do not add another.
- Live OIDC: one real Keycloak login creates exactly one event and correct first-login summaries.
- Live OIDC: refreshing and calling protected APIs do not add events.
- A second independent sign-in creates a second unique event.

Expected RED:

- No complete capture flow exists before implementation.

Implementation:

- Add only fixture/observability support required to assert persisted counts. Do not weaken production authentication.

Acceptance:

- Mock E2E is green locally.
- Live E2E is green when its external stack is available; otherwise it is reported as blocked with exact prerequisites and reproduction command, never as passed.

## Integration test contract

Database-semantic tests use an `integration` build tag and a disposable MariaDB database supplied by `CORE_TEST_DATABASE_DSN`. They must run real embedded migrations and clean up their own rows/schema safely. Ordinary `go test ./...` must remain runnable without MariaDB.

Minimum database command:

```bash
CORE_TEST_DATABASE_DSN="admin:admin@tcp(127.0.0.1:3306)/custos?parseTime=true&charset=utf8mb4&multiStatements=true" go test -tags integration ./internal/... ./pkg/service/...
```

Do not replace transaction, locking, unique-key, foreign-key, or migration assertions with mocks.

## Final gates

After all slices are green, run and record each gate. Fix regressions introduced by the run. Distinguish pre-existing failures from introduced failures using baseline evidence.

Repository root:

```bash
gofmt -l .
go test ./...
go vet ./...
go build ./...
make verify-no-drift
CORE_TEST_DATABASE_DSN="admin:admin@tcp(127.0.0.1:3306)/custos?parseTime=true&charset=utf8mb4&multiStatements=true" go test -tags integration ./internal/... ./pkg/service/...
```

`web/`:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm gen:api:check
pnpm build
pnpm test:e2e
LIVE_PORTAL_URL=http://localhost:3001 pnpm exec playwright test --config playwright.live.config.ts
```

Use the repository’s installed dependencies. Do not regenerate a lockfile merely to bypass a missing frozen install. Frontend build requires the documented NextAuth/OIDC/core API environment variables. Playwright requires its Chromium binary. Live E2E requires the complete MariaDB, Keycloak, backend, and portal stack with expected seed data.

## External-blocker policy

When a gate depends on unavailable infrastructure:

1. Diagnose enough to prove the failure is environmental rather than a code assertion failure.
2. Record the exact command, exit status, concise output, missing prerequisite, and reproduction steps in `docs/progress.md`.
3. Run every remaining independent local gate.
4. Mark the run “code complete; release gate blocked,” not complete or passed.
5. Present one final checkpoint asking whether the user will supply the environment. Never silently skip or substitute a mock for the blocked live gate.

## Progress evidence format

Maintain a “Phase 1 TDD run” section in `docs/progress.md`. For each slice record:

- Scenario and acceptance criterion.
- Test files and test names added or replaced.
- RED command and concise expected failure.
- Implementation files and behavioral summary.
- GREEN command and result.
- Refactoring/design decisions.
- Remaining risk or blocker.

Do not paste full command logs or a chronological tool transcript. Update the document’s status summary, completed/remaining sections, last-reviewed date, and recommended next step so they do not contradict the evidence.

## Checkpoint

Push human review to the end. Work autonomously through all slices and gates. Pause early only when:

- Product specification conflicts with this workflow and cannot be reconciled conservatively.
- A destructive migration is required against an already deployed/shared schema rather than the agreed uncommitted `000007` draft.
- A public API must change beyond this endpoint contract.
- Existing user work would need to be discarded or overwritten.

The final checkpoint is a decision-ready brief containing:

- What was delivered and why.
- Core metric/idempotency/time-zone evidence.
- Gate matrix with pass/fail/blocked status.
- Any blocker and the single decision needed from the user.
- Links to `docs/progress.md` and the changed implementation, not raw output.

## Definition of done

Phase 1 is done only when:

- A real new portal session is the sole production trigger for login capture.
- Unique login sessions, active local dates, latest login, and streak match all acceptance scenarios.
- Duplicate, concurrent, and late events cannot corrupt facts or summaries.
- All three data layers update atomically.
- User IANA time zones and UTC fallback pass boundary and DST tests.
- `ResolveCaller`, page refreshes, and ordinary API requests never record logins.
- The endpoint is authenticated, self-only, and bound to trusted session evidence.
- Required local gates pass and any unavailable live gate is explicitly blocked with evidence.
- `docs/progress.md` contains complete RED/GREEN evidence and no known implementation question remains.
