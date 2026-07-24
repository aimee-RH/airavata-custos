<!--
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements. See the NOTICE file
    distributed with this work for additional information.
    Licensed under the Apache License, Version 2.0.
-->

# User Activity Feature Progress

Last reviewed: 2026-07-24  
Branch/worktree: `feature/user-activity`  
Target specification: [`user-activity-spec.md`](user-activity-spec.md)

## Current status

The user-activity feature now has an end-to-end implementation covering login capture, historical facts, administrative read APIs, the Super Admin UI, and an initial analytics view. Phase 1 and Phase 2 are substantially implemented. Phase 3 and Phase 4 are functional but still have correctness and completeness issues that must be addressed before the feature should be treated as production-ready analytics.

## Implemented

### Phase 1 — Login capture and storage

- Added `users.timezone`, `last_login`, `last_login_local_date`, `login_count`, `login_day_count`, and `login_streak`.
- Added `user_login_events` as the unique login-event source of truth.
- Added `user_login_daily` for user-local daily facts.
- Added a unique `event_key` and idempotent duplicate handling.
- A successful unique login increments total login count.
- Multiple logins on one local date increment total logins but only one active day.
- Streaks are reconstructed from daily facts.
- Late older events cannot move the latest-login fields backwards.
- Event, daily fact, and user summary updates run synchronously in one transaction.
- Removed login recording from ordinary `ResolveCaller` request processing.
- Added authenticated `POST /me/login-events` capture.
- The portal submits login evidence from the initial NextAuth/OIDC account callback with bounded retries.
- Added tests for first login, repeated same-day login, next-day login, streak reset, duplicate events, late events, concurrent events, and transaction rollback.

Relevant files:

- `internal/db/migrations/000007_user_activity.up.sql`
- `internal/store/login_activity_store.go`
- `pkg/service/login_activity.go`
- `internal/server/login_activity.go`
- `web/src/shared/auth/login-capture.ts`

### Phase 2 — Read APIs

- Added dedicated `core:users:activity:read` / `UsersActivityRead` authorization.
- Added `GET /users/activity`.
- Added `GET /users/inactive`.
- Added strict validation:
  - days: 1–3650;
  - limit: 1–200;
  - offset: non-negative;
  - allowlisted sort fields;
  - `asc` / `desc` direction.
- Added server-side name/email search, sorting, and pagination.
- Added accurate filtered totals and stable tie-breaking.
- Activity responses include:
  - user identity fields;
  - effective time zone;
  - last login and last local login date;
  - total logins;
  - active days;
  - current streak;
  - average logins per active day.
- Inactivity is selected using user-local calendar dates.
- Never-logged-in users are included and ordered first.
- Added backend coverage for invalid parameters, local-day boundaries, accurate totals, and 50/5 pagination.

Relevant files:

- `internal/server/user.go`
- `internal/store/user_store.go`
- `pkg/service/user.go`
- `pkg/service/user_activity_test.go`
- `pkg/service/user_activity_integration_test.go`

### Phase 3 — Administration UI

- Added the `/admin/users/activity` route and Activity navigation tab.
- Added page-level CASL handling for `read UserActivity`.
- The main table displays:
  - Name;
  - Last Login;
  - Total Logins;
  - Active Days;
  - Current Streak;
  - Average Logins / Active Day.
- Main-table search is debounced and sent to the backend.
- Main-table sort, direction, page size, offset, and totals are server-driven.
- Added previous/next pagination for the main activity table.
- Added an inactive-users panel using the backend inactive endpoint and backend total.
- The inactive panel initially requests five users.
- Added 3-day, 7-day, and custom inactivity controls.
- Added loading, retry, empty, and unauthorized UI states.

Relevant files:

- `web/src/features/core/users/activity/components/ActivityPage.tsx`
- `web/src/features/core/users/activity/components/ActivityTable.tsx`
- `web/src/features/core/users/activity/components/InactiveUsersPanel.tsx`
- `web/src/features/core/users/activity/components/InactivityFilter.tsx`
- `web/src/features/core/users/activity/queries.ts`

### Phase 4 — Initial analytics

- Added `GET /users/activity/analytics?window=7|30|90`.
- Protected analytics with `UsersActivityRead`.
- Added daily-fact aggregation for:
  - lifetime login count;
  - lifetime active days;
  - users who have ever logged in;
  - rolling-window active users, logins, and active user-days;
  - current-month active users, logins, and active user-days;
  - average logins per active user-day;
  - daily active-user and login-count trend points.
- Added 7/30/90-day UI controls.
- Added KPI cards and a daily login trend visualization.
- Added a basic CSV export of trend data.
- Added API validation for supported analytics windows.

Relevant files:

- `internal/store/user_store.go`
- `internal/server/user.go`
- `web/src/features/core/users/activity/components/ActivityAnalytics.tsx`
- `web/src/features/core/users/activity/api.ts`
- `web/src/features/core/users/activity/schemas.ts`

## Partially complete or incorrect

### 1. Analytics calendar boundaries

`user_login_daily.local_date` is a user-local date, but analytics currently derives rolling and monthly boundaries from `now.UTC()`. Users near an international date or month boundary can be incorrectly included or excluded.

Required work:

- Decide whether analytics uses each user's local calendar or one documented report time zone.
- Implement the selected boundary semantics consistently.
- Add UTC-crossing, month-boundary, and multi-time-zone integration tests.

### 2. Inactive-panel paging

The panel does not load real subsequent pages. It repeatedly requests `offset=0` with a larger limit and stops increasing at 200. With more than 200 matches, the button remains visible but cannot load the remaining users.

Required work:

- Use offset-based incremental paging or `useInfiniteQuery`.
- Fetch the next page instead of refetching the complete prefix.
- Merge pages without duplicates.
- Cover more than 200 matches.

### 3. Inactive search scope

The main table sends its search query to `/users/activity`, but the same query is not sent to `/users/inactive`. The table and inactive panel can therefore show inconsistent populations.

Required work:

- Either send the debounced query to both endpoints, or clearly make the search control table-only in the UI.

### 4. Inactivity day display

The backend filters using user-local calendar days, while the inactive panel displays days using elapsed milliseconds divided by 24 hours. Around local midnight and DST, a user selected as seven days inactive can be shown as six days inactive or receive the wrong visual band.

Required work:

- Return a server-derived inactivity-day value, or calculate from `last_login_local_date` and `effective_timezone`.

### 5. Custom inactivity validation

The backend and specification accept 1–3650 days. The input currently declares `max=365`, while its submit logic does not reject values above 3650.

Required work:

- Use the 1–3650 range consistently.
- Show a local validation message and do not send invalid requests.

### 6. Analytics UI completeness

The backend returns `window_active_days`, `monthly_login_count`, `monthly_active_days`, and `lifetime_active_days`, but the UI does not display them. CSV export currently includes only daily trend rows.

Required work:

- Decide which summary metrics belong in the first analytics UI.
- Export required summary and trend metrics rather than trend alone.

### 7. Analytics window transition

React Query keeps previous data while a new 7/30/90-day request runs. During that interval, the selected window label can describe the new window while the chart still contains the previous window's data.

Required work:

- Handle `isPlaceholderData` / fetching state.
- Use `data.window_days` for the data label.
- Disable export or mark the view as refreshing until the selected result arrives.

### 8. Effective time-zone fallback

User time-zone and UTC fallback are implemented. The specification's organization-default time-zone level is not implemented.

Required work:

- Add an organization default time zone if this fallback remains a first-release requirement.
- Resolve effective time zone as user → organization → UTC.

### 9. Login-write scalability

Every unique login currently counts all historical events and reads all historical daily dates while holding the user's serialization lock. This is correct for current tests but grows linearly with account history.

Required work:

- Incrementally update the normal in-order case.
- Reserve bounded reconstruction for late events that can affect summaries or streaks.
- Add a performance/concurrency test with long user history.

## Test and contract gaps

### Broken analytics integration fixture

`pkg/service/user_activity_integration_test.go` inserts into a nonexistent `login_date` column and omits required daily-fact fields. The analytics integration test therefore fails during fixture setup when integration tests are enabled and does not validate the production query.

Required work:

- Insert `local_date`, `timezone`, `first_login_at`, and `last_login_at`.
- Add assertions for monthly, rolling active-day, average, and trend metrics.

### OpenAPI generated-client drift

`api/core.openapi.yaml` contains the new activity contracts, but `web/src/generated/core/` has not been regenerated. `pnpm gen:api:check` currently detects drift.

Required work:

- Correct nullable activity fields and document `POST /me/login-events` if it remains part of the public contract.
- Run `pnpm gen:api` and commit the generated client changes.

### MSW and E2E coverage

The activity mock currently does not fully model inactive and analytics endpoints or their query behavior. Current E2E tests do not prove server-driven inactive paging, analytics switching/export, or the complete authorization matrix.

Required work:

- Add parameter-aware mocks for activity, inactive, and analytics endpoints.
- Cover backend totals and next-page loading.
- Cover Active Days and average-frequency columns.
- Cover custom-day validation.
- Cover 7/30/90 switching and CSV export.
- Cover direct unauthorized navigation.
- Cover `super_admin`, `UsersRead` only, operator, PI, auditor, and a custom `UsersActivityRead` role.

### Live login E2E

Unit and integration tests cover the login-capture flow, but the live OIDC browser test still requires a running portal and identity stack to prove one real portal session produces exactly one event.

## Latest verification

Passed on 2026-07-24:

```text
go build ./...
go vet ./...
go test ./...
pnpm lint
pnpm typecheck
pnpm test (99 files, 656 tests)
```

Known verification status:

- Default backend tests pass.
- Frontend lint, type checking, and unit tests pass.
- Analytics integration coverage must be repaired before its result is trusted.
- OpenAPI generated-client drift is currently present.
- Existing unrelated React test warnings remain non-failing.

## Recommended implementation order

1. Repair the analytics integration fixture and add boundary assertions.
2. Decide and implement the Analytics time-zone/reporting-day contract.
3. Replace inactive limit growth with true incremental paging.
4. Correct the OpenAPI contract and regenerate the frontend client.
5. Align inactive search and displayed inactivity days with backend semantics.
6. Fix custom-day validation to 1–3650.
7. Complete Analytics metric display, export, and window-loading behavior.
8. Complete MSW, E2E, and authorization-matrix coverage.
9. Decide whether organization default time zone is required for the first release.
10. Optimize login summary updates for long user histories.

## Production-release checklist

The first production release should not be considered complete until:

- Analytics date boundaries have one documented and tested time-zone meaning.
- Inactive users can be loaded beyond 200 without omissions or duplicates.
- Activity and inactive UI controls have consistent search and day semantics.
- Analytics integration tests execute against the real schema.
- OpenAPI generation has no drift.
- Required Phase 4 metrics are visible/exportable.
- The dedicated authorization matrix is tested.
- Relevant mock and live E2E flows pass.
