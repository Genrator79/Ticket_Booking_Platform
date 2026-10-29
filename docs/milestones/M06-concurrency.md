# Milestone M06 — Concurrency and Double-Booking Prevention

## 1. Goal
Mathematically and empirically eliminate race conditions and double-booking vulnerabilities under extreme concurrent loads using PostgreSQL pessimistic row-level locking (`SELECT ... FOR UPDATE`), deterministic lock sorting to prevent circular wait deadlocks, atomic conditional status updates, and optimistic versioning.

## 2. Why the Milestone Exists
The core engineering challenge of a ticketing platform (such as Ticketmaster or BookMyShow) is concurrency.
Imagine 10,000 users attempting to book the exact same front-row seat at the exact same millisecond when tickets go on sale.
In standard relational databases with default isolation (`READ COMMITTED`), multiple transactions can read a seat as `AVAILABLE` concurrently before any transaction commits its write. Without database row-level serialization, multiple transactions will simultaneously create bookings for the same seat, leading to catastrophic double bookings and business failure.

## 3. Scope
- Reproduce and demonstrate the race condition vulnerability when row locking is omitted.
- Implement pessimistic row-level locking via `SELECT ... FOR UPDATE OF ss` in `BookingRepository`.
- Implement deterministic lock acquisition ordering (`ORDER BY ss.id ASC`) in both memory and SQL to eliminate circular wait deadlocks (PostgreSQL `40P01`).
- Enforce atomic conditional updates (`UPDATE show_seats SET status = 'BOOKED', version = version + 1 WHERE id = ANY($1) AND status = 'AVAILABLE'`) with row-count verification.
- Write a high-concurrency automated stress test suite (`server/tests/concurrency.test.ts`) firing 50 competing simultaneous HTTP requests against a single seat.
- Verify that exactly 1 request wins (HTTP 201), 49 requests are cleanly rejected (HTTP 409), exactly 1 booking record is written, and 0 double bookings occur.

## 4. Tasks and Statuses
| Task | Description | Status |
|---|---|---|
| T01 | Implement `getShowSeatsForUpdate` with `FOR UPDATE OF ss` and `ORDER BY ss.id ASC` | `VERIFIED` |
| T02 | Update `BookingService.createBooking` to acquire pessimistic locks inside `withTransaction` | `VERIFIED` |
| T03 | Add optimistic versioning increment and conditional status checking to `updateShowSeatsStatus` | `VERIFIED` |
| T04 | Implement `createBookingWithoutLocking` test helper to demonstrate the race condition | `VERIFIED` |
| T05 | Build high-concurrency automated test suite (`server/tests/concurrency.test.ts`) | `VERIFIED` |
| T06 | Verify 50-request single-seat contention (1 winner, 49 conflicts, 0 double bookings) | `VERIFIED` |
| T07 | Verify multi-seat contention with overlapping seats (0 deadlocks, clean serialization) | `VERIFIED` |
| T08 | Verify atomic transaction rollback on partial availability failure | `VERIFIED` |
| T09 | Document deep-dive system design and interview analysis | `VERIFIED` |
| T10 | Update `docs/solid/SOLID.md`, `PROJECT_STATE.md`, and `PROJECT_LOG.md` | `VERIFIED` |

## 5. Files Created or Modified
- [`server/src/repositories/booking.repository.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/repositories/booking.repository.ts): Added `getShowSeatsForUpdate` with `FOR UPDATE OF ss` and deterministic ID sorting. Enhanced `updateShowSeatsStatus` with version increments and expected status checks.
- [`server/src/services/booking.service.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/src/services/booking.service.ts): Wired pessimistic locking into `createBooking`, added conditional row count verification, and added `createBookingWithoutLocking` for vulnerability testing.
- [`server/tests/concurrency.test.ts`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/tests/concurrency.test.ts): 4 integration test scenarios covering vulnerability reproduction, 50-user contention stress test, deadlock elimination, and atomic rollback.
- [`server/package.json`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/server/package.json): Added `--runInBand` to Jest test runner to prevent parallel database state collisions between test suites.
- [`docs/solid/SOLID.md`](file:///Users/abhijeetkumar/Desktop/SDEPROJECT/docs/solid/SOLID.md): Updated with M06 SRP entries.

## 6. Architecture & Concurrency Deep Dive

### A. What is a Race Condition in Ticket Booking?
A race condition occurs when system behavior depends on the non-deterministic timing of concurrent thread or process execution:
```text
Client 1 (Tx 1)                      Client 2 (Tx 2)
  |                                    |
  |-- BEGIN                           |-- BEGIN
  |-- SELECT status FROM show_seats    |
  |   --> Returns 'AVAILABLE'          |-- SELECT status FROM show_seats
  |                                    |   --> Returns 'AVAILABLE'
  |-- INSERT INTO bookings            |
  |-- UPDATE show_seats (BOOKED)       |-- INSERT INTO bookings
  |-- COMMIT                           |-- UPDATE show_seats (BOOKED)
  |                                    |-- COMMIT
  v                                    v
Result: Two different users booked the exact same seat! (Double Booking)
```

### B. How `SELECT ... FOR UPDATE` Prevents Double Booking
PostgreSQL provides explicit row-level write locks via `FOR UPDATE`:
```sql
SELECT ss.id, ss.status, ss.price
FROM show_seats ss
WHERE ss.id = ANY($1)
ORDER BY ss.id ASC
FOR UPDATE OF ss;
```
1. **Serialization**: When Transaction 1 executes `SELECT ... FOR UPDATE`, PostgreSQL places an exclusive write lock on the target rows in `show_seats`.
2. **Blocking**: When Transaction 2 attempts to run the same query for that seat, PostgreSQL halts Transaction 2 and places it into a sleep queue waiting for Transaction 1 to complete.
3. **Fresh Re-read**: When Transaction 1 commits, Transaction 2 immediately unblocks. Under PostgreSQL `READ COMMITTED` snapshot semantics with row-level locks, Transaction 2 re-reads the updated row, seeing `status = 'BOOKED'`.
4. **Immediate Rejection**: Transaction 2's validation check fails (`seat.status !== 'AVAILABLE'`), triggers a rollback, and returns `HTTP 409 Conflict`.
5. **Outcome**: Zero double bookings occur, regardless of how many thousands of concurrent requests arrive simultaneously.

### C. Deadlock Elimination via Deterministic Lock Ordering
When transactions book multiple seats (e.g. reserving 2 tickets together), circular wait deadlocks can occur:
- Transaction 1 locks Seat A, wants Seat B.
- Transaction 2 locks Seat B, wants Seat A.
- Both transactions wait indefinitely for the other to release its lock. PostgreSQL's deadlock detector eventually aborts one transaction with error `40P01 dead lock detected`.

**The Mathematical Solution**:
We eliminate circular wait by enforcing strict global lock hierarchy. All seat IDs are sorted deterministically before locking:
```typescript
const sortedIds = [...showSeatIds].sort();
```
Because both Transaction 1 and Transaction 2 sort their requested seats alphabetically/lexicographically by UUID, both will ALWAYS attempt to acquire lock on the smaller UUID first, then the larger UUID. A circular dependency is mathematically impossible.

### D. Multi-Tier Defense-in-Depth
Our architecture does not rely on application-level `if` checks alone:
1. **Pessimistic Row Lock**: `SELECT ... FOR UPDATE` serializes competing transactions.
2. **Conditional Atomic Write**: `UPDATE show_seats SET status = 'BOOKED', version = version + 1 WHERE id = ANY($1) AND status = 'AVAILABLE'`. If `rowCount !== seatCount`, rollback immediately.
3. **Optimistic Versioning**: `version = version + 1` provides tamper detection for future optimistic concurrency strategies.
4. **Relational Constraints**: `UNIQUE(show_id, seat_id)` physically prevents duplicate seat creation for a show.

## 7. Tests and Actual Results

### Automated Concurrency Test Suite (`npm test`)
Command: `npm test`
```text
PASS tests/concurrency.test.ts
  Concurrency & Double-Booking Prevention Integration Tests (M06)
    1. Race Condition Demonstration (Without Pessimistic Locking)
      ✓ should demonstrate double-booking race condition when row-level locking is omitted (59 ms)
    2. Protected High-Concurrency Stress Test (50 Competing Requests for 1 Seat)
      ✓ enforces exactly ONE winner, 49 conflict rejections, and ZERO double-bookings (184 ms)
    3. Multi-Seat Contention & Deadlock Prevention
      ✓ should eliminate circular wait deadlocks when competing requests order seat IDs deterministically (26 ms)
      ✓ should rollback transaction completely if one of the requested seats is unavailable (15 ms)

PASS tests/booking.test.ts
PASS tests/auth.test.ts
PASS tests/crud.test.ts
PASS tests/health.test.ts
PASS tests/db.test.ts

Test Suites: 6 passed, 6 total
Tests:       46 passed, 46 total
Snapshots:   0 total
Time:        2.081 s
```

### Empirical Test Evidence
- **50 Competing Requests for Seat 2**:
  - `HTTP 201 Created`: **1**
  - `HTTP 409 Conflict`: **49**
  - `HTTP 500 / Errors`: **0**
  - `Database Confirmed Bookings for Seat`: **1**
  - `Double Bookings`: **0**

## 8. System Design & Interview Q&A

**Q: Why not use Redis alone for concurrency control?**
> Redis is an in-memory key-value store that excels at temporary, high-throughput caching and rate limiting. However, Redis is not the durable, ACID-compliant source of truth for financial transactions and ticket bookings. If Redis restarts or network partitions occur between Redis and PostgreSQL, an in-memory lock can be lost, causing inconsistent state. The relational database (PostgreSQL) must remain the ultimate authoritative guardian of seat finality.

**Q: Why use `SELECT ... FOR UPDATE` instead of Optimistic Concurrency Control (OCC) with version columns?**
> Under high write contention (such as a popular concert ticket release with 10,000 users competing for 100 seats), OCC leads to extreme retry storms because almost every transaction fails its version check and is forced to retry, saturating CPU and database connections. Pessimistic row locking with deterministic ordering queues contenders cleanly and lets exactly one transaction proceed while cleanly rejecting the rest without wasteful retries.

**Q: What is the risk of `SELECT ... FOR UPDATE` and how is it mitigated?**
> The two primary risks are deadlocks and connection starvation. Deadlocks are eliminated by sorting seat IDs prior to lock acquisition. Connection starvation is mitigated by keeping transactions extremely small: only fetching seats, validating, writing the booking, and committing. Long-running operations (such as payment processing or sending notification emails) are strictly kept OUTSIDE the database lock transaction.

## 9. Completion Checklist
- [x] Demonstrated the race condition vulnerability without row-level locking
- [x] Implemented `SELECT ... FOR UPDATE OF ss` pessimistic locking
- [x] Enforced deterministic lock ordering (`ORDER BY ss.id ASC`) to eliminate deadlocks
- [x] Added atomic conditional updates with `version = version + 1`
- [x] 50-user concurrent stress test passing with exactly 1 winner and 0 double bookings
- [x] Multi-seat contention passing with zero deadlocks
- [x] Atomic rollback verified on partial availability failure
- [x] All 46 automated tests passing across 6 test suites
- [x] Production monorepo build passing with zero errors
- [x] Comprehensive interview and system design documentation complete

## 10. Final Status
`COMPLETED` — Ready for review and user approval to begin M07 (Redis Module & Distributed Infrastructure).
