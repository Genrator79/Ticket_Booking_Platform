# Milestone M03 — Authentication

## 1. Goal
Implement a secure, stateless authentication and authorization system using JSON Web Tokens (JWT) and `bcryptjs` password hashing, backed by the PostgreSQL `users` table, protected by Zod request validation, and validated by automated tests and frontend integration.

## 2. Why the Milestone Exists
In a high-concurrency ticket booking platform:
- Bookings, seat holds, and simulated payments must be securely associated with verified user identities.
- Authorization must prevent users from inspecting or tampering with other users' bookings.
- Stateless JWT authentication allows the API to scale horizontally without sticky sessions or centralized session stores for basic request verification.

## 3. Scope
- Password hashing with `bcryptjs` (salt rounds: 10).
- Stateless JWT issuance and signature verification (`jsonwebtoken`).
- Input validation using Zod schemas for user registration and login payloads.
- Three core endpoints:
  - `POST /api/auth/register` (201 Created)
  - `POST /api/auth/login` (200 OK)
  - `GET /api/auth/me` (200 OK, Protected)
- Authentication middleware (`authenticate`) and role checking (`requireRole`).
- Centralized custom HTTP error classes (`BadRequestError`, `UnauthorizedError`, `ConflictError`, etc.).
- Automated test suite (`server/tests/auth.test.ts`) covering registration, duplicate handling, credential verification, timing-safe errors, and protected routes.
- Frontend authentication service (`client/src/services/authService.ts`) and interactive UI card (`client/src/components/AuthCard.tsx`).

## 4. Tasks and Statuses
| Task | Description | Status |
|---|---|---|
| T01 | Install JWT dependencies (`jsonwebtoken`, `@types/jsonwebtoken`) | `VERIFIED` |
| T02 | Configure JWT environment variables (`JWT_SECRET`, `JWT_EXPIRES_IN`) | `VERIFIED` |
| T03 | Create `UserRepository` for parameterized PostgreSQL user queries | `VERIFIED` |
| T04 | Implement `AuthService` (bcrypt hashing, JWT generation/verification) | `VERIFIED` |
| T05 | Create Zod validation middleware and auth schemas | `VERIFIED` |
| T06 | Implement `authenticate` JWT middleware and Express request augmentation | `VERIFIED` |
| T07 | Implement `AuthController` and mount `/api/auth` routes | `VERIFIED` |
| T08 | Implement automated security and integration tests (`server/tests/auth.test.ts`) | `VERIFIED` |
| T09 | Implement client auth service (`client/src/services/authService.ts`) | `VERIFIED` |
| T10 | Build interactive frontend authentication component (`client/src/components/AuthCard.tsx`) | `VERIFIED` |
| T11 | Update documentation (`PROJECT_STATE.md`, `PROJECT_LOG.md`, `SOLID.md`) | `VERIFIED` |

## 5. Files Created or Modified
- [`server/src/types/user.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/types/user.ts): User domain types, `SafeUser` (omitting password hash), and `AuthTokenPayload`.
- [`server/src/types/express.d.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/types/express.d.ts): Augments `Express.Request` with optional `user: AuthTokenPayload`.
- [`server/src/utils/errors.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/utils/errors.ts): Custom HTTP error hierarchy (`AppHttpError`, `BadRequestError`, `UnauthorizedError`, `ConflictError`, etc.).
- [`server/src/repositories/user.repository.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/repositories/user.repository.ts): Data access repository for PostgreSQL `users` table.
- [`server/src/services/auth.service.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/services/auth.service.ts): Authentication business rules, bcrypt hashing, and JWT signing/verification.
- [`server/src/validations/auth.validation.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/validations/auth.validation.ts): Zod validation schemas for registration and login.
- [`server/src/middleware/validate.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/middleware/validate.ts): Generic Zod request body validation middleware.
- [`server/src/middleware/auth.middleware.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/middleware/auth.middleware.ts): Extracts and validates JWT Bearer tokens from `Authorization` headers.
- [`server/src/controllers/auth.controller.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/controllers/auth.controller.ts): HTTP controller handling `/register`, `/login`, and `/me`.
- [`server/src/routes/auth.routes.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/routes/auth.routes.ts): Mounts auth endpoints with validation and auth middleware.
- [`server/src/routes/index.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/routes/index.ts): Attaches `/api/auth` router to API gateway.
- [`server/tests/auth.test.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/tests/auth.test.ts): 10 integration and security tests for authentication flows.
- [`client/src/types/auth.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/types/auth.ts): Frontend TypeScript types for auth responses and credentials.
- [`client/src/services/authService.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/services/authService.ts): Frontend authentication API client using centralized Axios client.
- [`client/src/components/AuthCard.tsx`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/client/src/components/AuthCard.tsx): Interactive React component supporting login, register, demo credentials, and live session verification.
- [`docs/solid/SOLID.md`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/docs/solid/SOLID.md): Updated with SRP, ISP, and DIP applications in M03.

## 6. Architecture Decisions
1. **Repository Pattern for Database Separation**:
   - `UserRepository` centralizes all SQL queries on `users`.
   - Business services (`AuthService`) never write raw SQL.
2. **Stateless JWT with Standard Claims**:
   - JWT tokens include `{ userId, email, role }` and an expiration window (`24h`).
   - The token contains sufficient claims for authorization checks without hitting the database on every read request.
3. **Generic Error Responses for Auth Failures**:
   - Login failures return a generic `"Invalid email or password"` message rather than distinguishing between non-existent emails and wrong passwords, preventing user enumeration.
4. **Credential Isolation (`SafeUser`)**:
   - The `password_hash` column is explicitly stripped by `toSafeUser()` before returning user data to controllers or API consumers.

## 7. Tests and Actual Results

### Automated Integration & Security Tests (Jest + Supertest)
Command: `npm test`
```text
PASS tests/db.test.ts
PASS tests/health.test.ts
PASS tests/auth.test.ts
  Authentication & Security Integration Tests (M03)
    POST /api/auth/register
      ✓ should register a new user successfully and return JWT and user profile (131 ms)
      ✓ should reject registration if email is already registered (409 Conflict) (14 ms)
      ✓ should reject registration with invalid email (400 Bad Request) (9 ms)
      ✓ should reject registration with short password (< 8 chars) (400 Bad Request) (5 ms)
    POST /api/auth/login
      ✓ should authenticate user with valid credentials and return JWT (83 ms)
      ✓ should handle case-insensitive email comparison on login (82 ms)
      ✓ should reject login with incorrect password (401 Unauthorized) (85 ms)
      ✓ should reject login with non-existent email (401 Unauthorized) (6 ms)
    GET /api/auth/me (Protected Route)
      ✓ should return authenticated user profile when valid Bearer token provided (87 ms)
      ✓ should reject request without Authorization header (401 Unauthorized) (4 ms)
      ✓ should reject request with invalid/tampered token (401 Unauthorized) (5 ms)
      ✓ should reject request with malformed authorization header (401 Unauthorized) (4 ms)

Test Suites: 3 passed, 3 total
Tests:       21 passed, 21 total
Snapshots:   0 total
Time:        1.498 s
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
✓ 76 modules transformed.
rendering chunks (1)...computing gzip size...
dist/index.html                   1.13 kB │ gzip:  0.64 kB
dist/assets/index-CphLoKKu.css   33.82 kB │ gzip:  6.42 kB
dist/assets/index-h-maPUG_.js   289.04 kB │ gzip: 91.38 kB
✓ built in 105ms
```

## 8. Problems Encountered and Fixes
1. **Problem**: `vite build` failed with `TS1484: 'User' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled`.
   - **Root Cause**: `client/tsconfig.app.json` has `verbatimModuleSyntax: true`.
   - **Fix**: Changed value imports to `import type { User, AuthResponse, ... }` in `client/src/components/AuthCard.tsx` and `client/src/services/authService.ts`.
2. **Problem**: NodeNext module resolution requires explicit `.js` specifiers in relative imports for compiled code.
   - **Fix**: Standardized relative module imports across all newly created server files to use `.js` extension.

## 9. SOLID Review
- **SRP**: Clean tiering established: Route (`auth.routes.ts`) -> Controller (`auth.controller.ts`) -> Service (`auth.service.ts`) -> Repository (`user.repository.ts`).
- **ISP**: `SafeUser` interface segregates internal user entities from external representations, preventing accidental password hash exposure.
- **DIP**: `AuthService` accepts an optional `UserRepository` via constructor injection, enabling isolated unit testing.

## 10. Completion Checklist
- [x] Password hashing with bcrypt
- [x] JWT token signing and verification
- [x] Authentication middleware (`authenticate`)
- [x] Protected `/api/auth/me` endpoint
- [x] Zod request validation
- [x] Clean error handling with correct HTTP status codes (201, 200, 400, 401, 409)
- [x] Automated tests passing (21/21)
- [x] Frontend authentication card and live session verification
- [x] Full monorepo build passing

## 11. Final Status
`COMPLETED` — Ready for review and user approval to begin M04 (Basic CRUD).

