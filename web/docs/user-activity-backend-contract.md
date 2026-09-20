# User Activity frontend integration

This frontend-only change ports the reviewed Nexus Activity design to Custos. The backend implementation, migrations and OpenAPI/code generation belong in the separate backend PR. Keep this PR in draft until that contract is implemented and live integration is verified.

## Access and population

All activity reads require `core:users:activity:read`. The UI hides the Activity tab and makes no activity requests without it. The backend must independently enforce the privilege for lists, aggregates and individual reads. Population: OIDC-linked identities, matching the existing prototype; no claims about invitation dates or unlinked invitees.

## One window, three disjoint groups

The dashboard defaults to 30 days, with 7/30/90 presets and a custom integer from 1 to 365. The selected window includes today and the previous N−1 user-local calendar dates.

- `active`: has logged in and `inactive_days < N`.
- `dormant`: has logged in and `inactive_days >= N`.
- `never`: no recorded login.
- `all`: union of those three groups.

Never is excluded from Dormant. Do not substitute the old `/users/inactive` behavior (which includes Never). User-local calendar boundaries, including DST and time-zone fallback, must be consistent between list filtering, row `inactive_days` and aggregate counts.

Summary cards and charts describe the full authorized population. Search and status filters affect only the audit table. Lifetime values are explicitly labelled All time/Lifetime. Displayed timestamps are UTC; relative day labels use the backend's `inactive_days`.

## List: backend extension required

`GET /users/activity?window=30&status=all&query=&limit=10&offset=0&sort=last_login&direction=desc`

Existing prototype supports search, limit, offset and sorting. Add `window` (1–365) and `status` (`all|active|dormant|never`), apply filters before pagination, and add `window_login_count` to each row. Allow `name`, `last_login`, `login_count` sorting with stable user-ID tie-breaking; keep never-login dates last in either direction.

```json
{
  "items": [{
    "user_id": "u-1",
    "name": "Alice",
    "email": "alice@example.org",
    "last_login": "2026-09-16T12:00:00Z",
    "inactive_days": 0,
    "login_count": 52,
    "window_login_count": 12,
    "login_day_count": 31,
    "current_streak": 2
  }],
  "total": 1,
  "limit": 10,
  "offset": 0,
  "window_days": 30,
  "status": "all"
}
```

For never-login users `last_login` and `inactive_days` are null and counts are zero. Echo normalized `window_days`, `status`, `limit` and `offset`. These are required by the UI so an older backend that silently ignores new filters cannot present an unfiltered list under an Active/Dormant label. Empty items may be `[]` or `null`. Total is the filtered count across the entire population, not the current page length.

## Analytics: reuse existing prototype endpoints

- `GET /users/activity/analytics?window=N`
- `GET /users/{id}/activity/analytics?window=N`

Both require: `generated_at`, `window_days`, `total_users`, `users_ever_logged_in`, `active_users`, `lifetime_login_count`, `lifetime_active_days`, `window_login_count`, `window_active_days`, and `trend` (`date`, `active_users`, `login_count`). Retain existing extra fields for other consumers. `active_users <= users_ever_logged_in <= total_users`.

Cards derive Active from `active_users`, Dormant from `users_ever_logged_in - active_users`, and Never from `total_users - users_ever_logged_in`; these numbers must share the list's calendar semantics. Trend dates are user-local date buckets across the population, not one global 24-hour UTC interval. Sparse trend rows are supported. The frontend fills missing calendar dates with zero sign-ins and zero active users, using the UTC date of `generated_at` for the nominal N-day display range. It preserves original date labels and all returned boundary dates, including user-local dates outside that UTC range. This does not reassign events to UTC days or infer each user’s timezone. Exact all-zero local edge dates require explicit report bounds from a future backend contract.

The drawer initially uses the dashboard window, then allows an independent 1–365-day range. It requests only the selected user's analytics. Invalid windows return 400, unauthorized reads 403, absent users 404.

## New-session capture

The server-side NextAuth initial account callback calls `POST /me/login-events` with the chosen OIDC bearer and `{}`. It does not submit user identity, event ID or timestamps from browser input. The backend prototype must derive and verify session evidence from the bearer, reject incomplete claims, and deduplicate repeated submissions. No unverified fallback is introduced here.

The portal makes at most three attempts with the same bearer/body, 2-second per-attempt timeouts and 50/100ms backoff. Permanent 4xx responses stop retrying. Capture failure logs a generic message and leaves the authenticated session intact. Session reads and refresh callbacks without a new account do not initiate capture. Real OIDC exactly-once behavior remains a joint integration gate for the two PRs.

## Review preview and intentional differences

Run `pnpm exec msw init public --save` once after installing dependencies, then set `NEXT_PUBLIC_PORTAL_USE_MSW=true` for the existing development mock mode. The activity mocks model 225 users and parameter-aware queries; production requests use the portal API proxy with no mock-data fallback. Browser tests inject test sessions using the repository's existing fixture.

Preserved from the reviewed UI: four clickable cards, composition bar, sign-in bars/distinct-user line, date controls, server-driven audit table, and individual drawer.

Values without backend support are not invented: role search, prior-period comparison, oldest invite and over-90-day subcounts are omitted. The table searches name/email. The drawer's summary uses real lifetime sign-ins/active days rather than extra 7/30-day requests. The action is labelled View because it opens analytics, not access-management controls. Existing portal typography is reused without another downloaded font.

## Screenshots

These use development mocks, not live user data.

![Desktop activity dashboard](images/user-activity-desktop.png)

## Validation commands

From `web/`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm gen:api:check`, `pnpm build`, and `pnpm exec playwright test tests/admin-user-activity.e2e.ts --workers=1`.

Unit and browser checks with mocks validate frontend behavior only. Before marking ready: implement the list extensions in the backend PR, verify old/new status boundaries and accurate full-population totals against MariaDB, and verify real OIDC capture and authenticated page requests against that backend. Merge backend before enabling the frontend in production.

The shared portal styling is unchanged from the target base. Only the Activity-specific navigation for custom roles is retained; broader mobile-shell redesign is outside this PR.

## Baseline tooling limitations

On upstream `5d840613`, API regeneration changes four core generated files for unrelated user/cluster-account contracts; this PR changes neither those inputs nor their generated outputs. `pnpm gen:api:check` therefore reports existing drift. Go test/vet pass; the Go build in this linked worktree needs `-buildvcs=false` because VCS discovery selects its non-repository parent. These are disclosed rather than bundled as unrelated fixes.

### Role labels in the audit table

Rows may include `role_names: string[]`, containing the user's actual assigned role display names (all roles if multiple). The frontend renders these after the email. Missing role data is omitted, never inferred from login activity or replaced with demo roles. An empty list means no assigned roles; absence means the backend has not supplied this field. The current backend follow-up must populate this field from real role assignments. Staff, Student and Researcher in MSW are preview fixtures only.

## Summary-card supplemental metrics (2026-09-20)

The aggregate analytics response now accepts `prior_active_users` (distinct OIDC users with a daily fact in the immediately preceding equal-length local-calendar window), `dormant_over_90_days` (the selected window's dormant users with inactivity strictly greater than 90 local days), and nullable `oldest_never_created_at` (earliest account creation among OIDC users with zero recorded logins). These values are aggregate server statistics, never computed from a paginated list or summed daily unique-user counts. Missing fields from an older server hide supplemental copy rather than becoming invented zeros.

Custos has no invitation timestamp. The UI explicitly labels account creation, deriving elapsed whole days from `generated_at`; it does not call it an invitation. Both list and analytics queries refresh every 60 seconds while the page is visible. The local MSW preview is explicitly marked Demo data and uses deterministic fixture records.

The corresponding backend implementation and OpenAPI additions are in the sibling `repo` checkout (backend feature branch). Deploy that implementation before claiming live supplemental metrics. The previously documented list/window contract dependencies remain separate and unresolved. No remote changes are included in this local update.
