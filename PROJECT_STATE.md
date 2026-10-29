# Project State

## Project
High-Concurrency Ticket Booking Platform (SeatForge)

## Current Milestone
M05 — Basic Booking

## Milestone Status
COMPLETED

## Current Task
Milestone M05 finalized, verified, and awaiting explicit user approval before starting M06 (Concurrency and Double-Booking Prevention).

## Task Checklist
- [x] M01 — Project Setup (Verified)
- [x] M02 — Database Design (Verified)
- [x] M03 — Authentication (Verified)
- [x] M04 — Basic CRUD (Verified)
- [x] Create Booking and BookingSeat TypeScript types (`server/src/types/booking.ts`)
- [x] Implement BookingRepository (`server/src/repositories/booking.repository.ts`)
- [x] Implement BookingService (`server/src/services/booking.service.ts`) with seat availability verification and total amount calculation
- [x] Implement Zod validation schemas for booking creation (`server/src/validations/booking.validation.ts`)
- [x] Implement BookingController (`server/src/controllers/booking.controller.ts`)
- [x] Wire `/api/bookings` routes with authentication middleware (`server/src/routes/booking.routes.ts`)
- [x] Write comprehensive integration tests for booking flow (`server/tests/booking.test.ts`)
- [x] Implement frontend booking service (`client/src/services/bookingService.ts`)
- [x] Implement seat selection, checkout panel, and booking confirmation in UI (`MovieCatalog.tsx`)
- [x] Implement user booking history list in UI (`MovieCatalog.tsx`)
- [x] Update documentation (`docs/milestones/M05-basic-booking.md` and `docs/solid/SOLID.md`)
- [x] Verify test suite (42/42 passed) and production builds (0 errors)
- [x] Complete M05 verification and set awaiting approval

## Verified Results
- Automated Tests (`npm test`): PASS (42/42 tests passed across 5 test suites: `db.test.ts`, `health.test.ts`, `auth.test.ts`, `crud.test.ts`, `booking.test.ts`)
- Production Monorepo Build (`npm run build`): PASS (Zero TypeScript/bundling errors across server and client)
- Booking Creation (`POST /api/bookings`): PASS (Atomically creates booking, itemized booking_seats, calculates total, updates show_seats to BOOKED)
- Double-Booking Prevention: PASS (Rejects already-booked seats with 409 Conflict)
- Owner Authorization: PASS (Lists only authenticated user's bookings; rejects unauthorized viewing with 403 Forbidden)
- Input Validation (`Zod`): PASS (Validates UUIDs, rejects empty seat selections and duplicate seat IDs)
- Interactive Frontend: PASS (Clickable seat grid, live checkout calculation, confirmation modal, and booking history viewer)

## Current Blockers
None.

## Last Completed Action
Verified all M05 Basic Booking features, automated tests, full-stack build checks, SOLID principles documentation, and persistent tracking files.

## Exact Next Action
Wait for user approval to start M06 (Concurrency and Double-Booking Prevention: Demonstrate race condition under concurrent requests, implement pessimistic row-level locking `SELECT ... FOR UPDATE`, ordered seat locking to eliminate deadlocks, and multi-user concurrency stress tests).

## Files Changed
- `server/src/types/booking.ts`
- `server/src/repositories/booking.repository.ts`
- `server/src/services/booking.service.ts`
- `server/src/validations/booking.validation.ts`
- `server/src/controllers/booking.controller.ts`
- `server/src/routes/booking.routes.ts`
- `server/src/routes/index.ts`
- `server/tests/booking.test.ts`
- `client/src/types/booking.ts`
- `client/src/services/bookingService.ts`
- `client/src/components/MovieCatalog.tsx`
- `docs/milestones/M05-basic-booking.md`
- `docs/solid/SOLID.md`
- `PROJECT_STATE.md`
- `PROJECT_LOG.md`

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
