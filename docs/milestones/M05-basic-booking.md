# Milestone M05 — Basic Booking

## 1. Goal
Implement the end-to-end baseline booking flow: allow authenticated users to select available seats for a scheduled show, calculate pricing, atomically insert `bookings` and `booking_seats` records, transition seat availability in `show_seats` to `BOOKED`, retrieve booking confirmations, and view personal booking history.

## 2. Why the Milestone Exists
This milestone implements the core transactional booking path before introducing concurrency stress, row-locking (`SELECT FOR UPDATE`), and temporary Redis holds in M06-M08. It establishes:
- The fundamental relational mapping between `users`, `shows`, `bookings`, `booking_seats`, and `show_seats`.
- Explicit business logic checks for seat availability and total ticket price summation.
- Owner-scoped authorization so users can only view their own bookings.
- The interactive frontend booking interface with seat grid clicking and confirmation modals.

## 3. Scope
- Booking domain entities in `server/src/types/booking.ts`.
- `BookingRepository` managing queries on `bookings`, `booking_seats`, and `show_seats`.
- `BookingService` executing transactional booking creation and owner-scoped retrieval.
- Zod schema validation (`createBookingSchema` restricting 1-10 seats per booking).
- REST endpoints:
  - `POST /api/bookings` (Private, creates booking and itemized seats, updates status to `BOOKED`)
  - `GET /api/bookings` (Private, lists authenticated user's booking history)
  - `GET /api/bookings/:id` (Private, owner-scoped booking confirmation retrieval)
- Automated integration test suite (`server/tests/booking.test.ts`) covering booking creation, price calculation, status updates, 409 conflict on already-booked seats, validation, and 403 forbidden access controls.
- Frontend booking client (`bookingService.ts`) and interactive UI in `client/src/components/MovieCatalog.tsx` (seat selection toggle, checkout bar, confirmation modal, and booking history drawer).

## 4. Tasks and Statuses
| Task | Description | Status |
|---|---|---|
| T01 | Define TypeScript booking contracts in `server/src/types/booking.ts` | `VERIFIED` |
| T02 | Implement `BookingRepository` for transactional SQL operations | `VERIFIED` |
| T03 | Implement `BookingService` with seat validation and price summation | `VERIFIED` |
| T04 | Implement Zod request validation schema (`createBookingSchema`) | `VERIFIED` |
| T05 | Implement `BookingController` with authentication enforcement | `VERIFIED` |
| T06 | Mount Express routes under `/api/bookings` with `authenticate` middleware | `VERIFIED` |
| T07 | Write comprehensive integration tests in `server/tests/booking.test.ts` (8 test cases) | `VERIFIED` |
| T08 | Implement frontend service (`client/src/services/bookingService.ts`) | `VERIFIED` |
| T09 | Build interactive seat selection, checkout panel, and confirmation modal in UI | `VERIFIED` |
| T10 | Build user booking history drawer in UI | `VERIFIED` |
| T11 | Update documentation (`SOLID.md`, `PROJECT_STATE.md`, `PROJECT_LOG.md`) | `VERIFIED` |

## 5. Files Created or Modified
- [`server/src/types/booking.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/types/booking.ts): Domain types for `Booking`, `BookingSeat`, `BookingSeatDetail`, and `BookingWithDetails`.
- [`server/src/repositories/booking.repository.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/repositories/booking.repository.ts): Data access for `bookings`, itemized `booking_seats`, batch seat lookups, and status updates.
- [`server/src/services/booking.service.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/services/booking.service.ts): Transactional booking creation and owner authorization checks.
- [`server/src/validations/booking.validation.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/validations/booking.validation.ts): Zod schema validating `show_id` and array of 1-10 `show_seat_ids`.
- [`server/src/controllers/booking.controller.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/controllers/booking.controller.ts): HTTP controller for `/api/bookings`.
- [`server/src/routes/booking.routes.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/routes/booking.routes.ts): Endpoints protected with `authenticate` middleware.
- [`server/src/routes/index.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/routes/index.ts): Mounted booking router.
- [`server/tests/booking.test.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/tests/booking.test.ts): 8 integration tests verifying booking creation, conflict handling, and authorization.
- [`client/src/types/booking.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/types/booking.ts): Frontend TypeScript types for booking responses.
- [`client/src/services/bookingService.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/services/bookingService.ts): Axios booking API client.
- [`client/src/components/MovieCatalog.tsx`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/components/MovieCatalog.tsx): Interactive seat click selection, checkout total panel, confirmation modal, and history drawer.
- [`docs/solid/SOLID.md`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/docs/solid/SOLID.md): Updated with M05 SOLID patterns.

## 6. Architecture Decisions
1. **Transactional Baseline Execution**:
   - `withTransaction` wraps the booking creation lifecycle:
     ```text
     BEGIN
       Fetch requested show_seats
       Verify all seats are AVAILABLE
       Insert into bookings (total_amount = SUM(seat.price))
       Insert into booking_seats
       Update show_seats SET status = 'BOOKED'
     COMMIT
     ```
   - If any seat is already booked or missing, the entire transaction rolls back, guaranteeing zero partial or orphaned bookings.
2. **Authorization Enforcement**:
   - `GET /api/bookings` is explicitly scoped to `req.user.userId`.
   - `GET /api/bookings/:id` verifies ownership: if `booking.user_id !== req.user.userId` and the user is not an admin, it throws `ForbiddenError` (HTTP 403), preventing IDOR (Insecure Direct Object Reference) vulnerabilities.
3. **Intentional Concurrency Boundary**:
   - In M05, seat availability is checked using standard relational reads inside the transaction.
   - Under heavy concurrent load with thousands of simultaneous requests, two transactions reading simultaneously before either commits can experience a race condition.
   - **M06 will explicitly demonstrate this race condition and introduce pessimistic row-level locking (`SELECT ... FOR UPDATE`) to permanently guarantee zero double-bookings.**

## 7. Tests and Actual Results

### Automated Integration Tests (`npm test`)
Command: `npm test`
```text
PASS tests/db.test.ts
PASS tests/health.test.ts
PASS tests/booking.test.ts
  Basic Booking Flow Integration Tests (M05)
    POST /api/bookings
      ✓ should successfully book available seats and update database state to BOOKED (48 ms)
      ✓ should reject booking already booked seats with 409 Conflict (14 ms)
      ✓ should reject booking without authentication token (401 Unauthorized) (8 ms)
      ✓ should reject booking with duplicate seat IDs in payload (400 Bad Request) (9 ms)
      ✓ should reject booking with empty seat array (400 Bad Request) (7 ms)
    GET /api/bookings and GET /api/bookings/:id (Authorization)
      ✓ GET /api/bookings should list only authenticated user bookings (16 ms)
      ✓ GET /api/bookings/:id should allow owner to view booking confirmation (11 ms)
      ✓ GET /api/bookings/:id should deny other customers with 403 Forbidden (9 ms)
PASS tests/crud.test.ts
PASS tests/auth.test.ts

Test Suites: 5 passed, 5 total
Tests:       42 passed, 42 total
Snapshots:   0 total
Time:        2.103 s
```

### Monorepo Build Check
Command: `npm run build`
```text
> high-concurrency-ticket-booking-platform@1.0.0 build
> npm run build --workspace=server && npm run build --workspace=client

> server@1.0.0 build
> tsc

> client@0.0.0 build
> tsc -b && vite build

vite v8.3.4 building client environment for production...
✓ 80 modules transformed.
dist/index.html                   1.13 kB │ gzip:  0.64 kB
dist/assets/index-LlaQN-Bw.css   42.55 kB │ gzip:  7.43 kB
dist/assets/index-SiyGcayg.js   305.56 kB │ gzip: 94.38 kB
✓ built in 116ms
```

## 8. Completion Checklist
- [x] Booking and booking_seats domain entities defined
- [x] Booking creation endpoint (`POST /api/bookings`) with transactional persistence
- [x] Double-booking rejection on already booked seats (`409 Conflict`)
- [x] Input validation with Zod (`createBookingSchema`)
- [x] Owner-scoped authorization on `GET /api/bookings` and `GET /api/bookings/:id`
- [x] Automated test suite passing (42/42 tests)
- [x] Interactive UI with clickable seat selection, checkout total panel, and confirmation modal
- [x] Personal booking history viewer in UI
- [x] Monorepo production build passing (zero errors)
- [x] Persistent tracking and documentation updated

## 9. Final Status
`COMPLETED` — Ready for review and user approval to begin M06 (Concurrency and Double-Booking Prevention).
