# Workspace Notes

## Canonical documents

- `docs/user-activity-spec.md`: product requirements for user activity analytics.
- `docs/progress.md`: implementation status and TDD evidence; record outcomes by slice, not a raw command transcript.
- `workflows/user-activity-phase-1-tdd.md`: executable workflow for Phase 1 correct login capture.

## User activity vocabulary

- **Login event**: one unique successful authentication that creates a new portal session. It is not an API request, token verification, `/me` lookup, page refresh, or identity-cache miss.
- **Event key**: stable idempotency identity for one login event. Prefer verified `iss + sub + sid + auth_time`; otherwise use a server-created portal session ID and creation time.
- **Active day**: a distinct calendar date derived in the user’s effective IANA time zone.
- **Effective time zone (Phase 1)**: valid user time zone, otherwise UTC. Organization fallback is deferred.
- **Daily fact**: per-user/per-local-date aggregate. Its time zone is the one used when the row was first created; raw event facts retain each event’s actual effective time zone.
- **Current stored streak**: consecutive active-date run ending on the latest recorded local login date. Read APIs may later derive zero when that run is no longer current relative to today.
- **Duplicate event**: an already persisted event key. It succeeds idempotently and changes no fact or summary.
- **Late event**: a unique event older than the user’s current latest event. It may add history but cannot regress latest-login fields.

## Workflow conventions

- Trigger Phase 1 when the specification or progress document contains confirmed unfinished Phase 1 work.
- Preserve the dirty worktree and incrementally adapt existing feature changes; never reset, clean, stash, or discard them.
- Rewrite the uncommitted `000007_user_activity` migration for the final Phase 1 schema; do not append `000008` solely to correct this draft.
- Use strict RED → GREEN slices. Record both failure and passing evidence in `docs/progress.md`.
- Push the human checkpoint to the end unless a specification conflict, destructive deployed migration, broader public API change, or required loss of user work appears.
- Login capture failure does not block portal login. Retry at most three times with bounded backoff and the same event key.
- Allow authenticated event time up to five minutes ahead of server time.

## Test and release gates

Backend local gates:

- `gofmt -l .` (must produce no output)
- `go test ./...`
- `go vet ./...`
- `go build ./...`
- `make verify-no-drift`

Real MariaDB behavior:

- Run integration-tag tests with `CORE_TEST_DATABASE_DSN`.
- Real SQL must prove migrations, unique keys, transaction rollback, row locking/concurrency, foreign keys, duplicate delivery, and late-event reconstruction.
- Ordinary `go test ./...` must not require a database.

Frontend gates from `web/`:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm gen:api:check`
- `pnpm build`
- `pnpm test:e2e`
- Live suite through `playwright.live.config.ts` with `LIVE_PORTAL_URL`.

External dependencies include MariaDB, Keycloak/full live stack, frontend build environment variables, and Playwright Chromium. If unavailable, report the exact blocked command and prerequisite; never mark it passed or substitute a mock for live evidence.
