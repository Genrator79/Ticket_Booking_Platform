# Project State

## Project
High-Concurrency Ticket Booking Platform (SeatForge)

## Current Milestone
M06 — Concurrency and Double-Booking Prevention

## Milestone Status
COMPLETED

## Current Task
Milestone M06 finalized, verified, and awaiting explicit user approval before starting M07 (Redis).

## Task Checklist
- [x] M01 — Project Setup (Verified)
- [x] M02 — Database Design (Verified)
- [x] M03 — Authentication (Verified)
- [x] M04 — Basic CRUD (Verified)
- [x] M05 — Basic Booking (Verified)
- [x] Implement `getShowSeatsForUpdate` in `BookingRepository` with `FOR UPDATE OF ss` and deterministic ID sorting
- [x] Update `BookingService` to utilize row-level locking inside transactions
- [x] Add optimistic version checking (`version = version + 1`) to `show_seats` update
- [x] Implement `createBookingWithoutLocking` test helper to demonstrate race condition
- [x] Write dedicated high-concurrency test suite (`server/tests/concurrency.test.ts`)
- [x] Test 50+ concurrent requests competing for the exact same seat (asserting exactly 1 winner, 0 double bookings, 49 conflicts)
- [x] Test multi-seat contention with overlapping seats (asserting deadlock-free execution)
- [x] Verify atomic transaction rollback on partial availability failure
- [x] Document interview Q&A and system design analysis in `docs/milestones/M06-concurrency.md`
- [x] Update `docs/solid/SOLID.md` and progress tracking files
- [x] Verify test suite (46/46 passed) and production builds (0 errors)
- [x] Complete M06 verification and set awaiting approval

## Verified Results
- Automated Tests (`npm test`): PASS (46/46 tests passed across 6 test suites: `db.test.ts`, `health.test.ts`, `auth.test.ts`, `crud.test.ts`, `booking.test.ts`, `concurrency.test.ts`)
- Production Monorepo Build (`npm run build`): PASS (Zero errors across client and server)
- Race Condition Demonstration: PASS (Proved duplicate booking occurs when row locking is omitted)
- 50-User Concurrent Single-Seat Contention: PASS (1 winner with 201 Created, 49 conflicts with 409 Conflict, exactly 1 database booking, 0 double bookings)
- Deadlock Elimination: PASS (Sorted UUID ordering successfully prevented PostgreSQL 40P01 circular deadlocks)
- Atomic Rollback: PASS (Transactions cleanly rollback when any seat in a multi-seat request is unavailable)

## Current Blockers
None.

## Last Completed Action
Verified all M06 Concurrency and Double-Booking Prevention features, automated stress tests, full-stack build checks, SOLID documentation, and persistent tracking files.

## Exact Next Action
Wait for user approval to start M07 (Redis: Redis client configuration, Redis service module with GET/SET/DEL/TTL/atomic operations, connection health probe, and tests).

## Files Changed
- `server/src/repositories/booking.repository.ts`
- `server/src/services/booking.service.ts`
- `server/src/types/booking.ts`
- `server/package.json`
- `server/tests/concurrency.test.ts`
- `docs/milestones/M06-concurrency.md`
- `docs/solid/SOLID.md`
- `PROJECT_STATE.md`
- `PROJECT_LOG.md`

## Important Decisions
- **Pessimistic Row-Level Locking**: `SELECT ... FOR UPDATE OF ss` locks target rows at the database level, serializing concurrent writes without requiring fragile application-level mutexes.
- **Deterministic Lock Ordering**: All seat IDs are sorted alphabetically/lexicographically by UUID before acquiring locks, mathematically eliminating circular wait deadlocks.
- **Conditional Atomic Writes**: `UPDATE show_seats SET status = 'BOOKED', version = version + 1 WHERE id = ANY($1) AND status = 'AVAILABLE'` provides defense-in-depth against concurrent state mutations.

## Next Milestone
M07 — Redis

## Approval Status
AWAITING_USER_APPROVAL: YES

## Important Decisions
- **Relational Integrity**: `booking_seats` maintains an explicit foreign key to `show_seats` with individual ticket prices locked at time of booking.
- **Atomic Booking Transaction**: Availability checks and state transitions are bound inside a single database transaction (`withTransaction`), guaranteeing no partial records if validation fails.
- **Ownership Scope**: `GET /api/bookings/:id` strictly checks `booking.user_id === req.user.userId` or admin role, closing IDOR attack vectors.

## Next Milestone
M06 — Concurrency and Double-Booking Prevention

## Approval Status
AWAITING_USER_APPROVAL: YES

## Important Decisions
- **Transactional Show Population**: When a show is created, an atomic transaction inserts all corresponding `show_seats` records with tier-adjusted pricing so seats are immediately available for booking.
- **Seat Layout Join**: `GET /api/shows/:showId/seats` joins mutable `show_seats` with immutable `seats` in a single query sorted by row and number, avoiding N+1 overhead.
- **Strict Separation of Concerns**: Repositories isolate SQL; services coordinate validation and business rules; controllers translate HTTP payloads.

## Next Milestone
M05 — Basic Booking

## Approval Status
AWAITING_USER_APPROVAL: YES

## Important Decisions
- **Repository Pattern**: `UserRepository` encapsulates all database operations using parameterized queries to eliminate SQL injection vulnerabilities.
- **Credential Protection**: `SafeUser` type and `toSafeUser()` helper guarantee that `password_hash` is never serialized or transmitted over HTTP.
- **Stateless Tokens**: JWTs embed user claims (`userId`, `email`, `role`) with 24-hour expiration, eliminating database round-trips for authorization.
- **Timing-Safe Failures**: Login returns a generic 401 "Invalid email or password" to prevent user enumeration attacks.

## Next Milestone
M04 — Basic CRUD

## Approval Status
AWAITING_USER_APPROVAL: YES

## Important Decisions
- **Physical vs Show Seats**: `seats` represents the static physical layout; `show_seats` represents mutable availability for a specific scheduled show.
- **Relational Invariant**: `UNIQUE(show_id, seat_id)` physically prevents duplicate seat creation for a show.
- **Transactional Safety**: Implemented `withTransaction` in `server/src/db/index.ts` guaranteeing automatic rollback on errors.
- **Optimistic Versioning**: Added `version` column to `show_seats` alongside row-level locking support for M06.

## Next Milestone
M03 — Authentication

## Approval Status
AWAITING_USER_APPROVAL: YES
