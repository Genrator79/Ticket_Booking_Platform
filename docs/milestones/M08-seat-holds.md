# Milestone M08 — Temporary Seat Holds

## 1. Overview & Business Context

In real-world ticketing platforms (such as BookMyShow and Ticketmaster), booking tickets is a **two-phase workflow**:
1. **Phase 1 — Temporary Seat Hold**: The customer selects seats and enters the checkout funnel. The system reserves those seats under an ephemeral lease (typically 10 minutes = 600 seconds) so no other user can purchase them while checkout details are being provided.
2. **Phase 2 — Final Confirmation**: The user completes simulated payment (M09) or confirms the booking. The temporary hold is atomically converted into a permanent booking in PostgreSQL, and the ephemeral Redis hold keys are released. If the customer abandons checkout or the timer expires, the hold is automatically evicted by Redis TTL, instantly restoring seat availability with zero database cleanup or cron polling.

---

## 2. Architecture & Data Flow

```text
                           Client (React)
                            |         |
             1. POST /api/holds       2. GET /api/shows/:id/seats
             (Selects 2 seats)        (Real-time availability)
                            |         |
                            v         v
                     Express API Server
                            |
           +----------------+----------------+
           |                                 |
           v                                 v
      PostgreSQL                           Redis
  (Permanent State)                  (Ephemeral Holds)
  - Verify seats not BOOKED          - Lua script checks all keys free
  - Read pricing & tiers             - Atomically SETs keys with 600s TTL
                                     - Stores hold metadata
                            |
                     User Proceeding
                            |
                    POST /api/bookings
                    (Passes hold_id)
                            |
                            v
             +--------------+--------------+
             |                             |
             v                             v
        PostgreSQL                       Redis
   - SELECT FOR UPDATE              - Validate hold ownership
   - INSERT booking & seats         - DEL seat & hold keys
   - UPDATE status to BOOKED
```

---

## 3. High-Concurrency Design Details

### A. Redis Key Design
- **Seat Lock Key**: `seat_hold:<showId>:<showSeatId>`
  - Value: `${holdId}:${userId}`
  - TTL: Configurable (`SEAT_HOLD_TTL_SECONDS`, default 600s)
  - Purpose: Provides `O(1)` atomic collision detection per physical seat at a specific screening.
- **Hold Metadata Key**: `hold:<holdId>`
  - Value: JSON-serialized `SeatHold` (`holdId`, `userId`, `showId`, `showSeatIds`, `seatLabels`, `totalAmount`, `expiresAt`)
  - TTL: Configurable (matches seat lock TTL)
  - Purpose: Enables fast retrieval during checkout verification and IDOR ownership validation.

### B. Atomic All-or-Nothing Multi-Seat Acquisition (Redis Lua Script)
If multiple seats are acquired sequentially in Node.js (e.g., using consecutive `SETNX` calls), concurrent requests can interleave:
- User 1 acquires Seat A.
- User 2 acquires Seat B.
- User 1 fails on Seat B and must roll back Seat A.
- This creates deadlock vulnerabilities, lock thrashing, and fragile compensation logic.

**Solution**: All requested seats are evaluated and acquired inside a **single atomic Redis Lua script**:
```lua
-- KEYS: array of seat lock keys [ "seat_hold:<showId>:<seatId1>", ... ]
-- ARGV[1]: hold_id
-- ARGV[2]: user_id
-- ARGV[3]: ttl_in_seconds

for i = 1, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then
    return { 0, KEYS[i] } -- Conflict: seat already held! Zero seats claimed.
  end
end

local val = ARGV[1] .. ':' .. ARGV[2]
for i = 1, #KEYS do
  redis.call('SET', KEYS[i], val, 'EX', tonumber(ARGV[3]))
end

return { 1, 'OK' } -- Success: all seats locked atomically
```
Because Redis executes Lua scripts sequentially on its single thread, this guarantees:
1. **Atomicity**: Either all requested seats are locked, or none are locked.
2. **Zero Partial Holds**: A conflicting seat aborts the transaction before any key is written.
3. **Zero Deadlocks**: No cross-client lock interleaving is possible.

### C. Database State Overlay
When clients request the seat grid via `GET /api/shows/:showId/seats`:
- `ShowService` queries the permanent seat catalog from PostgreSQL (`show_seats`).
- It executes a batch `mget` in Redis across all seat lock keys for that screening.
- Any seat marked `AVAILABLE` in PostgreSQL that possesses an active Redis hold is dynamically overlaid as `status = 'HELD'`.
- If the Redis TTL expires, the key evaporates, automatically presenting the seat as `AVAILABLE` without running database background cleaner jobs or table autovacuum sweeps.

### D. Booking Conversion & Clean Release
- `POST /api/bookings` accepts an optional `hold_id`.
- When provided, `BookingService` verifies the hold in Redis and confirms user ownership.
- PostgreSQL row-level locks are acquired (`SELECT ... FOR UPDATE`), `show_seats` transitions to `BOOKED`, and the booking record is inserted.
- Upon commit, the Redis seat keys and metadata key are deleted via Lua release script.

---

## 4. Test Coverage & Verification

Automated integration test suite in `server/tests/hold.test.ts`:
- **Hold Creation**: Verified 201 Created with TTL, calculated prices, and matching Redis keys.
- **Double-Hold Prevention**: Verified 409 Conflict when a second user attempts to hold an identical seat.
- **All-or-Nothing Multi-Seat Atomicity**: Verified that when User 2 requests [Seat A, Seat B] while Seat A is held, Seat B remains unheld and available for other customers.
- **Layout Overlay**: Verified `GET /api/shows/:showId/seats` renders held seats with `status: 'HELD'`.
- **Hold Retrieval & IDOR Enforcement**: Verified owner can view hold with dynamic remaining seconds; non-owner receives 403 Forbidden.
- **Manual Release**: Verified `DELETE /api/holds/:id` immediately frees seat keys in Redis.
- **Direct Booking Conflict**: Verified direct booking (`POST /api/bookings`) rejects seats currently held in Redis.
- **Hold-to-Booking Transition**: Verified confirming booking with `hold_id` creates persistent PostgreSQL booking and cleans up Redis hold keys.
- **High-Concurrency Stress Test**: Fired 25 concurrent requests competing for the exact same seat -> exactly 1 winner (201 Created), 24 conflicts (409 Conflict), exactly 1 hold in Redis.

**Total tests passing**: 64 / 64 across 8 test suites.

---

## 5. System Design Interview Insights

### Q1: Why not store temporary holds in PostgreSQL with an `expires_at` column?
**Answer**:
During high-traffic ticket drops (e.g. 50,000 users attempting to reserve seats during a concert drop):
1. **Write Amplification & WAL Bloat**: Placing holds in PostgreSQL generates intensive write traffic (WAL logs, table rows, index updates).
2. **Expired Row Cleanup Problem**: When holds expire after 10 minutes, the database requires continuous background polling (`DELETE FROM holds WHERE expires_at < NOW()`). This triggers table bloat, autovacuum lag, and index fragmentation.
3. **Read Lock Contention**: Checking whether a seat is currently held would require index lookups and row locks inside PostgreSQL.
Using **Redis** as an ephemeral lease tier eliminates all database write overhead for abandoned checkouts. Redis handles in-memory reads/writes at sub-millisecond latencies and automatically reclaims memory via TTL eviction.

### Q2: What happens if Redis crashes while seats are on hold?
**Answer**:
1. **PostgreSQL as Final Authority**: PostgreSQL remains the immutable source of truth. Since seats in PostgreSQL are only marked `BOOKED` upon final payment confirmation, a Redis crash cannot cause permanent double-booking.
2. **Degraded Mode**: If Redis becomes temporarily unavailable, the system can either:
   - Fall back to pessimistic database row-level locking directly for bookings (`SELECT ... FOR UPDATE`), or
   - Return a 503 / Degraded status for new hold requests until Redis reconnects.
3. **Persistence (RDB/AOF)**: In production, Redis is deployed with Append-Only File (AOF with `appendfsync everysec`) or in a Redis Cluster / Sentinel setup with automatic failover, keeping data loss to under one second.
