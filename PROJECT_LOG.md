# Project Log

## Chronological Development Log

### 2026-10-09 - Milestone M01: Project Setup Initiated
- **Milestone & Task**: M01 — Project Setup / Initial Workspace Inspection
- **Action**: Inspected workspace at `/Users/abhijeetkumar/Desktop/SDEPROJECT`. Confirmed clean git repository on branch `main` with Node v22.22.1 and npm 10.9.4.
- **Decision**: Adopt modular monorepo structure with `client/` (React + Vite + TS + Tailwind CSS) and `server/` (Node + Express + TS), matching project architecture requirements.
- **Files Created**: `PROJECT_STATE.md`, `PROJECT_LOG.md`, `.gitignore`, `.env.example`.

### 2026-10-09 - Milestone M01: Scaffolding Client & Server
- **Milestone & Task**: M01 — Project Setup / App Generation & Tooling
- **Action**: 
  - Scaffolded Vite React TypeScript in `client/` with Tailwind CSS v4 and Axios.
  - Initialized Node.js + Express + TypeScript in `server/` with Zod, CORS, tsx, and tsconfig.
  - Created root `package.json` with npm workspaces for unified development and build workflows.
- **Decision**: Separate Express app factory (`createApp`) in `server/src/app.ts` from the server listener in `server/src/index.ts` to allow testing via Supertest without binding network ports.

### 2026-10-09 - Milestone M01: Health Endpoint & Centralized Axios Client
- **Milestone & Task**: M01 — Project Setup / Implementation & Integration
- **Action**:
  - Implemented `GET /api/health` in `server/src/controllers/health.controller.ts` returning status, uptime, service name, timestamp, and memory usage.
  - Implemented centralized Axios instance `client/src/services/api.ts` with base URL, timeout, request interceptor (Authorization bearer token injection), and response error normalizer.
  - Created `client/src/components/HealthStatus.tsx` probe component and updated `client/src/App.tsx` layout.

### 2026-10-09 - Milestone M01: Verification & Git Remote Sync
- **Milestone & Task**: M01 — Project Setup / Verification & Checks
- **Action**:
  - Configured Jest + Supertest test suite in `server/tests/health.test.ts`. Tests passed 2/2 (Health check 200 OK + 404 handler).
  - Executed root build check `npm run build` which compiled both server (tsc) and client (tsc -b && vite build) with zero errors.
  - Started backend on port 5001 and verified `curl -s http://localhost:5001/api/health`.
  - Started Vite client on port 5173.
  - Executed browser subagent test: Verified live connection between React and Express via Axios, confirmed dynamic latency and memory metrics, and tested manual refresh action.
  - Documented SOLID principles in `docs/solid/SOLID.md` and created milestone summary in `docs/milestones/M01-project-setup.md`.
  - Created initial Git commit `a14c456` and pushed to remote origin `https://github.com/Genrator79/Ticket-Booking-Platform-.git` on branch `main`.
- **Status**: M01 Complete and successfully pushed to GitHub.

### 2026-10-09 - Milestone M02: Database Design Initiated & Installed
- **Milestone & Task**: M02 — Database Design / PostgreSQL Configuration
- **Action**:
  - Installed PostgreSQL 16 via Homebrew (`brew install postgresql@16`) and started the service (`brew services start postgresql@16`).
  - Created local databases `ticket_booking` and `ticket_booking_test`.
  - Installed `pg`, `bcryptjs`, and corresponding types.
  - Implemented database connection pool `server/src/db/index.ts` with client pooling, slow query logging, connection verification, and `withTransaction` higher-order transaction helper.

### 2026-10-09 - Milestone M02: Schema Migrations & Constraints
- **Milestone & Task**: M02 — Database Design / Migration Creation
- **Action**:
  - Created 8 normalized migration files in `database/migrations/`:
    - `001_create_users_table.sql`: Users table with `pgcrypto` UUIDs and unique email index.
    - `002_create_movies_table.sql`: Movies catalog with title and genre indexes.
    - `003_create_venues_and_screens_tables.sql`: Venues and auditorium screens with `UNIQUE(venue_id, name)`.
    - `004_create_seats_table.sql`: Static physical seating layout per screen with `UNIQUE(screen_id, seat_label)`.
    - `005_create_shows_table.sql`: Scheduled movie screenings with `CHECK (end_time > start_time)`.
    - `006_create_show_seats_table.sql`: Per-show dynamic seat state with `UNIQUE(show_id, seat_id)`, `CHECK (status IN ('AVAILABLE', 'HELD', 'BOOKED'))`, optimistic `version`, and compound index `(show_id, status)`.
    - `007_create_bookings_and_booking_seats_tables.sql`: Persistent bookings and itemized `booking_seats` records with `UNIQUE(booking_id, show_seat_id)`.
    - `008_create_payments_table.sql`: Payments records linked to bookings with idempotency key support.
  - Implemented migration runner `database/migrate.ts` with version tracking in `schema_migrations` and idempotent execution.

### 2026-10-29 - Milestone M05: Basic Booking Completed
- **Milestone & Task**: M05 — Basic Booking / End-to-End Booking Lifecycle
- **Action**:
  - Defined booking TypeScript domain entities in `server/src/types/booking.ts` (`Booking`, `BookingSeat`, `BookingSeatDetail`, `BookingWithDetails`).
  - Implemented `BookingRepository` in `server/src/repositories/booking.repository.ts` for transactional creation of `bookings`, itemized `booking_seats`, batch seat lookups, and owner-scoped queries.
  - Implemented `BookingService` in `server/src/services/booking.service.ts` enforcing show seat existence, availability checking, price summation, and owner authorization rules.
  - Implemented Zod validation in `server/src/validations/booking.validation.ts` (`createBookingSchema` restricting 1-10 seats per booking).
  - Implemented `BookingController` and mounted routes under `/api/bookings` with `authenticate` JWT middleware.
  - Created automated integration test suite in `server/tests/booking.test.ts` (8 test cases verifying booking creation, total price summation, `show_seats` status update to `BOOKED`, 409 conflict handling, empty/duplicate payload rejections, and 403 forbidden access controls). All 42 tests in the project test suite passed (2.103s).
  - Built frontend client `bookingService.ts` and updated `MovieCatalog.tsx` with clickable seat selection, live checkout total drawer, booking confirmation modal, and personal booking history viewer.
  - Documented SOLID review in `docs/solid/SOLID.md` and created `docs/milestones/M05-basic-booking.md`.
- **Status**: M05 Complete. All 42 tests passed. Awaiting user approval to proceed to M06 (Concurrency and Double-Booking Prevention).
