# Milestone M10 — Idempotency & Distributed Deduplication

## 1. Overview & Problem Definition

In distributed high-concurrency systems like **SeatForge**, network failures, retry storms, client-side re-clicks, and connection timeouts are inevitable:
- A user double-clicks "Pay Now" or "Book Seat".
- A mobile app loses internet right after dispatching `POST /api/payments/process`; the payment succeeds on the server, but the client never gets the HTTP response and automatically retries.
- A payment gateway webhook triggers multiple duplicate deliveries for the same payment event.

Without an **Idempotency Layer**, duplicate requests cause catastrophic faults:
- **Double-charging customers** for the same tickets.
- **Double-booking inventory** or causing race condition database deadlocks.
- **Corrupting financial accounting ledgers** and analytics metrics.

Milestone M10 implements a production-grade, two-tier idempotency system with in-flight distributed locking, canonical payload tampering detection, and cached response replaying.

---

## 2. Architectural Design: Two-Tier Storage Strategy

```text
                                [ Incoming Request ]
                            Headers: Idempotency-Key
                            Body: { show_id, seat_ids, ... }
                                         |
                                         v
                    +------------------------------------------+
                    |        Idempotency Middleware            |
                    | 1. Validate UUID format of Key           |
                    | 2. Canonical SHA-256 Hash of Body        |
                    +------------------------------------------+
                                         |
                 +-----------------------+-----------------------+
                 | (Check Cache)                                 |
                 v                                               v
        +------------------+                           +-------------------+
        | Redis Fast Tier  |                           | PostgreSQL Tier   |
        | Key: idemp:<key> |                           | idempotency_keys  |
        +------------------+                           +-------------------+
                 |                                               |
                 +-----------------------+-----------------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
                [ Cache Hit ]                        [ Cache Miss ]
                       |                                   |
         Check Hash == Stored Hash?              Try Acquire Distributed Lock
         - No  -> 422 Unprocessable Entity       - SETNX lock:idemp:<key> TTL 60s
         - Yes -> Return Cached Response          - Acquired?
                  Header: Idempotent-Replayed: true    - No  -> 409 Conflict (In-Flight)
                                                       - Yes -> Forward to Controller
                                                                    |
                                                              Execute Business Logic
                                                                    |
                                                       +------------+------------+
                                                       |                         |
                                                  [ Success ]                [ Failure ]
                                                       |                         |
                                            Store Response in Redis      Release Lock
                                            & PostgreSQL Durable Store   & Bubble Error
                                            (Status, Headers, Body)
```

### Dual-Tier Benefits:
1. **Redis Fast Tier (In-Memory)**: Sub-millisecond lookup and in-flight mutual exclusion using Redis atomic `SET NX PX` (60-second in-flight lease, 24-hour response TTL).
2. **PostgreSQL Tier (Durable)**: Persistent database table `idempotency_keys` with unique index, guaranteeing replay safety across Redis restarts or cache evictions.

---

## 3. Core Components Implemented

### A. Database Migration: `009_create_idempotency_keys_table.sql`
- Stores durable idempotency records:
  - `key`: Unique client-supplied idempotency key (UUID or alphanumeric string up to 255 chars).
  - `user_id`: Owning user UUID for multi-tenant isolation.
  - `request_path`, `request_method`: Bound endpoint context.
  - `request_hash`: SHA-256 canonical hash of request payload.
  - `response_status`: HTTP status code returned (e.g., 200, 201).
  - `response_body`: JSON snapshot of the original response.
  - `recovery_point`: Checkpoint marker for multi-step saga recovery.
  - `expires_at`: Retention timestamp (24 hours).

### B. Idempotency Service (`server/src/services/idempotency.service.ts`)
- **Canonical Payload Hashing**: Normalizes and recursively sorts JSON object keys before SHA-256 hashing. Prevents false-positive tampering errors caused by differing JSON key ordering.
- **Distributed In-Flight Lock**: Redis `SET lock:idemp:<key> <userId> NX EX 60`. If another request with the same key arrives while the first is actively executing, the secondary request receives `409 Conflict` ("Request currently being processed").
- **Durable Persistence & Response Replay**: Saves response status and payload across both Redis and PostgreSQL. Returns `Idempotent-Replayed: true` header on replay.

### C. Express Middleware (`server/src/middleware/idempotency.middleware.ts`)
- Hooks into `POST /api/bookings`, `POST /api/payments/process`, and `POST /api/holds`.
- Intercepts `res.json` and `res.send` to capture response status and payload seamlessly without altering controller logic.

### D. Client Integration (`client/src/services/` & `MovieCatalog.tsx`)
- Automatically generates UUIDv4 `Idempotency-Key` headers for seat holds, bookings, and payments.
- Retries safely without fear of double-charging or orphan reservation.

---

## 4. Error Handling & Status Matrix

| Scenario | HTTP Status | Response / Behavior |
| :--- | :--- | :--- |
| **Identical retry after completion** | Original Status (e.g. 200/201) | Exact original response replayed, `Idempotent-Replayed: true` |
| **Tampered payload with same key** | `422 Unprocessable Entity` | Error: "Idempotency key reused with different request payload" |
| **Concurrent duplicate in flight** | `409 Conflict` | Error: "Concurrent request with this idempotency key in progress" |
| **Invalid key header** | `400 Bad Request` | If key header is present but empty or invalid format |

---

## 5. System Design Interview Q&A

### Q1: Why not just store the idempotency key in the `bookings` or `payments` table with a UNIQUE constraint?
> **Answer**: A database unique constraint only catches the collision at the very end of the transaction (`INSERT INTO bookings ...`). It cannot:
> 1. Intercept duplicate requests at the API gateway before triggering heavy downstream operations (e.g., calling Stripe or holding inventory).
> 2. Replay the original response payload back to the client.
> 3. Prevent race conditions while the first request is still running (leading to database lock waits or rollbacks rather than clean HTTP 409 responses).
> SeatForge combines both: middleware-level distributed locking + response caching, backed by database unique constraints for final defense-in-depth.

### Q2: How do you handle clock drift and cache expiration between Redis and PostgreSQL?
> **Answer**: Redis holds an ephemeral 24-hour TTL for sub-millisecond response replays. PostgreSQL stores `expires_at` (NOW() + INTERVAL '24 hours'). If a Redis cache eviction occurs, the request falls back to PostgreSQL. If a key is older than the retention window, it is treated as expired and pruned by periodic cleanup jobs.

### Q3: What happens if the server crashes while holding the in-flight lock?
> **Answer**: The distributed lock has an automatic TTL expiration (60 seconds in Redis). If the node dies mid-execution, the lock expires automatically, allowing subsequent client retries to proceed rather than remaining permanently locked out.
