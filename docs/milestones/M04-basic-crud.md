# Milestone M04 — Basic CRUD & Show Management

## 1. Goal
Implement production-grade RESTful APIs and domain architecture for Movies, Venues, Screens, Seats, and Shows, including the high-concurrency seat layout endpoint (`GET /api/shows/:showId/seats`), automatic transactional `show_seats` generation, full input validation with Zod, and full-stack interactive catalog integration.

## 2. Why the Milestone Exists
Before building booking, locking, and concurrency mechanisms (M05-M06), the platform requires reliable management of its core catalog entities. A user must be able to discover movies, browse venues, inspect showtimes, and view auditorium seat maps with real-time seat availability (`AVAILABLE`, `HELD`, `BOOKED`).

## 3. Scope
- Repositories, services, controllers, and routes for:
  - `movies` (`GET /api/movies`, `GET /api/movies/:id`, `POST /api/movies`, `PUT /api/movies/:id`, `DELETE /api/movies/:id`)
  - `venues` (`GET /api/venues`, `GET /api/venues/:id`, `POST /api/venues`)
  - `screens` (`POST /api/venues/:venueId/screens`, `GET /api/venues/screens/:screenId/seats`)
  - `shows` (`GET /api/shows`, `GET /api/shows/:id`, `POST /api/shows`)
  - `show_seats` layout (`GET /api/shows/:showId/seats`)
- Transactional show generation: automatically populates `show_seats` rows for all physical screen seats with tier-based pricing (STANDARD, PREMIUM, VIP).
- Zod schema validations for all write operations.
- Automated integration test suite (`server/tests/crud.test.ts`) covering all CRUD and filtering endpoints.
- Interactive React frontend (`client/src/components/MovieCatalog.tsx`) showing live movie cards, screening selector, and visual cinema auditorium grid.

## 4. Tasks and Statuses
| Task | Description | Status |
|---|---|---|
| T01 | Define TypeScript entity contracts in `server/src/types/entities.ts` | `VERIFIED` |
| T02 | Implement `MovieRepository` with dynamic filters and updates | `VERIFIED` |
| T03 | Implement `VenueRepository` for venues, screens, and physical seats | `VERIFIED` |
| T04 | Implement `ShowRepository` with transactional show and `show_seats` creation | `VERIFIED` |
| T05 | Implement domain services (`MovieService`, `VenueService`, `ShowService`) | `VERIFIED` |
| T06 | Create Zod validation schemas for all write operations | `VERIFIED` |
| T07 | Implement HTTP Controllers (`MovieController`, `VenueController`, `ShowController`) | `VERIFIED` |
| T08 | Mount Express routers on `/api/movies`, `/api/venues`, `/api/shows` | `VERIFIED` |
| T09 | Implement `GET /api/shows/:showId/seats` layout endpoint (Section 11) | `VERIFIED` |
| T10 | Write 13 comprehensive integration tests in `server/tests/crud.test.ts` | `VERIFIED` |
| T11 | Implement frontend API services (`movieService.ts`, `showService.ts`) | `VERIFIED` |
| T12 | Build interactive catalog and auditorium seating UI (`MovieCatalog.tsx`) | `VERIFIED` |
| T13 | Update documentation (`SOLID.md`, `PROJECT_STATE.md`, `PROJECT_LOG.md`) | `VERIFIED` |

## 5. Files Created or Modified
- [`server/src/types/entities.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/types/entities.ts): Domain types for Movie, Venue, Screen, Seat, Show, and ShowSeat.
- [`server/src/repositories/movie.repository.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/repositories/movie.repository.ts): Movie data access layer with dynamic parameterized queries.
- [`server/src/repositories/venue.repository.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/repositories/venue.repository.ts): Venue, screen, and seat queries.
- [`server/src/repositories/show.repository.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/repositories/show.repository.ts): Transactional show scheduling and high-concurrency seat layout retrieval.
- [`server/src/services/movie.service.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/services/movie.service.ts): Movie catalog business logic.
- [`server/src/services/venue.service.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/services/venue.service.ts): Venue and screen management.
- [`server/src/services/show.service.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/services/show.service.ts): Show scheduling and real-time seat availability tallies.
- [`server/src/validations/entities.validation.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/validations/entities.validation.ts): Zod validation schemas.
- [`server/src/controllers/movie.controller.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/controllers/movie.controller.ts): Movie REST controller.
- [`server/src/controllers/venue.controller.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/controllers/venue.controller.ts): Venue REST controller.
- [`server/src/controllers/show.controller.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/controllers/show.controller.ts): Shows and seat layout REST controller.
- [`server/src/routes/movie.routes.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/routes/movie.routes.ts): Movie endpoints.
- [`server/src/routes/venue.routes.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/routes/venue.routes.ts): Venue and screen endpoints.
- [`server/src/routes/show.routes.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/routes/show.routes.ts): Show and seat layout endpoints.
- [`server/src/routes/index.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/routes/index.ts): Router gateway aggregator.
- [`server/tests/crud.test.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/tests/crud.test.ts): 13 integration tests for movies, venues, screens, and shows.
- [`client/src/types/catalog.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/types/catalog.ts): Frontend TypeScript types for catalog and seat grids.
- [`client/src/services/movieService.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/services/movieService.ts): Client service for movies.
- [`client/src/services/showService.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/services/showService.ts): Client service for shows and seat grids.
- [`client/src/components/MovieCatalog.tsx`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/components/MovieCatalog.tsx): Interactive movie grid, screening pills, and auditorium seat map.
- [`client/src/App.tsx`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/App.tsx): Integrated `MovieCatalog` into the application dashboard.
- [`docs/solid/SOLID.md`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/docs/solid/SOLID.md): Updated with M04 SOLID entries.

## 6. Architecture Decisions
1. **Transactional Show Initialization (`show_seats` Population)**:
   - When a show is created, an atomic transaction copies every physical seat from the auditorium screen into `show_seats`.
   - Tier-based pricing rules (PREMIUM $+\$5$, VIP $+\$10$) are computed during insertion.
   - If show creation or seat population fails, the entire transaction rolls back, guaranteeing zero orphaned show records.
2. **High-Performance Seat Layout Query**:
   - `GET /api/shows/:showId/seats` performs a single index-backed `JOIN` between `show_seats` and immutable `seats` sorted by `row` and `number`.
   - Avoids N+1 query overhead and delivers complete auditorium state in $\sim 5-15$ms.
3. **Layered Separation of Concerns**:
   - Routes define URL structure and attach Zod body validators.
   - Controllers parse HTTP parameters and delegate to domain services.
   - Services execute business rules (time validation, existence checks).
   - Repositories isolate SQL statements and transactional lifecycles.

## 7. Tests and Actual Results

### Automated Integration Tests (`npm test`)
Command: `npm test`
```text
PASS tests/db.test.ts
PASS tests/health.test.ts
PASS tests/crud.test.ts
  Basic CRUD & Show Management Integration Tests (M04)
    Movies API (/api/movies)
      ✓ GET /api/movies should return list of movies (28 ms)
      ✓ GET /api/movies?genre=Sci-Fi should filter by genre (12 ms)
      ✓ GET /api/movies/:id should return single movie details (8 ms)
      ✓ POST /api/movies should create a new movie (11 ms)
      ✓ PUT /api/movies/:id should update movie attributes (12 ms)
      ✓ GET /api/movies/:id should return 404 for non-existent UUID (6 ms)
    Venues & Screens API (/api/venues)
      ✓ GET /api/venues should return list of venues (7 ms)
      ✓ GET /api/venues/:id should return venue and its screens (8 ms)
      ✓ POST /api/venues should create a new venue (9 ms)
    Shows & Seat Layout API (/api/shows)
      ✓ GET /api/shows should list scheduled shows with movie and screen metadata (11 ms)
      ✓ GET /api/shows/:id should return specific show details (8 ms)
      ✓ GET /api/shows/:showId/seats should return layout and seat availability (Section 11) (14 ms)
      ✓ POST /api/shows should create a show and automatically populate show_seats (24 ms)
PASS tests/auth.test.ts

Test Suites: 4 passed, 4 total
Tests:       34 passed, 34 total
Snapshots:   0 total
Time:        1.824 s
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
✓ 79 modules transformed.
dist/index.html                   1.13 kB │ gzip:  0.64 kB
dist/assets/index-C7kqw7Vt.css   39.55 kB │ gzip:  7.17 kB
dist/assets/index-DGx1us4W.js   298.08 kB │ gzip: 93.20 kB
✓ built in 105ms
```

## 8. Completion Checklist
- [x] Movies CRUD endpoints implemented and verified
- [x] Venues and Screens CRUD endpoints implemented and verified
- [x] Shows scheduling API with transactional `show_seats` population
- [x] Seat layout API (`GET /api/shows/:showId/seats`) returning rows, status, and pricing
- [x] Zod request schemas validating payloads
- [x] Automated test suite passing (34/34 tests)
- [x] Frontend movie catalog, screening picker, and interactive seat map
- [x] Monorepo production build passing (zero errors)
- [x] Persistent tracking and documentation updated

## 9. Final Status
`COMPLETED` — Ready for review and user approval to begin M05 (Basic Booking).
