# Project State

## Project
High-Concurrency Ticket Booking Platform (SeatForge)

## Current Milestone
M04 — Basic CRUD

## Milestone Status
COMPLETED

## Current Task
Milestone M04 finalized, verified, and awaiting explicit user approval before starting M05 (Basic Booking).

## Task Checklist
- [x] M01 — Project Setup (Verified)
- [x] M02 — Database Design (Verified)
- [x] M03 — Authentication (Verified)
- [x] Create domain types for Movie, Venue, Screen, Seat, Show (`server/src/types/entities.ts`)
- [x] Implement MovieRepository and MovieService (`server/src/repositories/movie.repository.ts`, `server/src/services/movie.service.ts`)
- [x] Implement VenueRepository and VenueService (`server/src/repositories/venue.repository.ts`, `server/src/services/venue.service.ts`)
- [x] Implement ShowRepository and ShowService (`server/src/repositories/show.repository.ts`, `server/src/services/show.service.ts`)
- [x] Implement Zod request schemas for Movie, Venue, Screen, Show creations/updates (`server/src/validations/entities.validation.ts`)
- [x] Implement Controllers (`movie.controller.ts`, `venue.controller.ts`, `show.controller.ts`)
- [x] Implement Routes and mount on `/api/movies`, `/api/venues`, `/api/shows`
- [x] Implement `GET /api/shows/:showId/seats` seat availability endpoint (Section 11)
- [x] Write comprehensive integration tests for CRUD APIs (`server/tests/crud.test.ts`)
- [x] Implement frontend service layer (`movieService.ts`, `showService.ts`)
- [x] Implement frontend catalog and seat layout viewing UI (`MovieCatalog.tsx`)
- [x] Update documentation (`docs/milestones/M04-basic-crud.md` and `docs/solid/SOLID.md`)
- [x] Verify test suite (34/34 passed) and production builds (0 errors)
- [x] Complete M04 verification and set awaiting approval

## Verified Results
- Automated Tests (`npm test`): PASS (34/34 tests passed across 4 test suites: `db.test.ts`, `health.test.ts`, `auth.test.ts`, `crud.test.ts`)
- Production Monorepo Build (`npm run build`): PASS (Zero TypeScript/bundling errors across server and client)
- Movies Endpoints (`/api/movies`): PASS (Listing, genre filtering, single retrieval, creation, update, 404 handling)
- Venues & Screens Endpoints (`/api/venues`): PASS (Listing, single venue retrieval with screens, venue/screen creation)
- Shows Endpoints (`/api/shows`): PASS (Listing with movie/screen metadata, single retrieval, show scheduling)
- Seat Layout (`GET /api/shows/:showId/seats`): PASS (Returns layout with rows, seats, tier, pricing, and live status)
- Transactional Seat Population: PASS (Show creation automatically creates show_seats records for all screen seats)
- Frontend Catalog: PASS (Interactive movies grid, screening selector, and auditorium seat map)

## Current Blockers
None.

## Last Completed Action
Verified all M04 Basic CRUD features, automated tests, full-stack build checks, SOLID principles documentation, and persistent tracking files.

## Exact Next Action
Wait for user approval to start M05 (Basic Booking: Booking entities, repository, booking flow endpoint, booking-seats relationship, checkout preview, and confirmation tests).

## Files Changed
- `server/src/types/entities.ts`
- `server/src/repositories/movie.repository.ts`
- `server/src/repositories/venue.repository.ts`
- `server/src/repositories/show.repository.ts`
- `server/src/services/movie.service.ts`
- `server/src/services/venue.service.ts`
- `server/src/services/show.service.ts`
- `server/src/validations/entities.validation.ts`
- `server/src/controllers/movie.controller.ts`
- `server/src/controllers/venue.controller.ts`
- `server/src/controllers/show.controller.ts`
- `server/src/routes/movie.routes.ts`
- `server/src/routes/venue.routes.ts`
- `server/src/routes/show.routes.ts`
- `server/src/routes/index.ts`
- `server/tests/crud.test.ts`
- `client/src/types/catalog.ts`
- `client/src/services/movieService.ts`
- `client/src/services/showService.ts`
- `client/src/components/MovieCatalog.tsx`
- `client/src/App.tsx`
- `docs/milestones/M04-basic-crud.md`
- `docs/solid/SOLID.md`
- `PROJECT_STATE.md`
- `PROJECT_LOG.md`

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
