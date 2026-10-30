# Milestone M07 — Redis Infrastructure & Service Layer

## 1. Overview & Architectural Role

In **SeatForge**, while PostgreSQL serves as the authoritative source of truth for permanent business records (users, shows, bookings, finalized payments), **Redis** acts as the high-throughput, low-latency in-memory data store for:
1. **Temporary Seat Holds (M08)**: Fast, atomic seat reservation leases with millisecond expiration (TTL).
2. **Distributed Locks (M08/M10)**: Preventing concurrent write collisions across distributed server instances via atomic `SETNX`.
3. **Idempotency Store (M10)**: Deduplicating incoming API requests with unique idempotency keys.
4. **Queue Backbone (M12/M13)**: Powering reliable background workers and job processing via BullMQ.
5. **High-Speed Cache (M14)**: Caching frequently read movie listings and venue seat maps.
6. **Rate Limiting (M15)**: Sliding-window and token-bucket protection against DDoS and seat-scalping bots.

---

## 2. Implementation Details

### A. Client Configuration & Connection Management (`server/src/redis/index.ts`)
- Utilizes `ioredis`, the production-grade Redis client for Node.js.
- Configured with exponential backoff retry strategy (`retryStrategy`) capped at 2000ms. In test environments, retries terminate quickly after 2 attempts to prevent stalled test runners.
- **Lazy Proxy Pattern**: Avoids eager TCP socket connection upon module import. Modules importing routes or controllers do not initiate network sockets until an explicit Redis call or probe is made.
- **Connection Health Probe**: `checkRedisConnection()` issues a live `PING` command and asserts a `'PONG'` response.
- **Graceful Shutdown**: `closeRedis()` issues a clean disconnect, preventing hanging open handles in unit tests or during server process shutdown.

### B. Redis Service Layer (`server/src/redis/redis.service.ts`)
The `RedisService` encapsulates Redis operations into typed TypeScript methods:
- `get(key)` / `set(key, value, ttlSeconds?)`: Core key-value access with optional expiration.
- `getJSON<T>(key)` / `setJSON<T>(key, value, ttlSeconds?)`: Transparent JSON serialization and safe error-handled deserialization.
- `setNX(key, value, ttlSeconds?)`: Atomic conditional write (`SET key val EX ttl NX`). Critical for distributed mutual exclusion and temporary seat holds.
- `del(keys)`: Deletion of single or batch keys returning the count of deleted entries.
- `exists(key)`: Fast boolean existence check.
- `ttl(key)` / `expire(key, ttlSeconds)`: Expiration inspection and dynamic renewal.
- `incr(key)` / `incrBy(key, increment)`: Atomic integer counters for rate limiters and metrics.

### C. System Observability & Health Probing
- `GET /api/health` now executes parallel health probes against both PostgreSQL (`SELECT 1`) and Redis (`PING`).
- The overall system status evaluates to `'OK'` only when both storage engines are operational; otherwise, it degrades to `'DEGRADED'`.
- The frontend `HealthStatus` dashboard renders live status badges for both PostgreSQL and Redis.

---

## 3. Test Coverage & Verification

Automated integration test suite in `server/tests/redis.test.ts`:
- **Live Connectivity**: Verified `checkRedisConnection()` returns `true`.
- **String Operations**: Verified `set`, `get`, `exists`.
- **JSON Serialization**: Verified typed round-trip parsing of complex booking hold payloads.
- **TTL Enforcement**: Verified expiration timers and `ttl` query accuracy.
- **Atomic SETNX**:
  - Successfully acquired lock on first attempt (`true`).
  - Rejected concurrent lock attempt by second user on identical key (`false`).
  - Allowed acquisition after key deletion.
- **Batch Deletion**: Verified deleting single and array of keys with accurate deletion counts.
- **Atomic Counters**: Verified monotonic incrementing with `incr` and `incrBy`.
- **Dynamic Expiration**: Verified `expire` updates key lifetime.

**Total tests passing**: 55 / 55 across 7 test suites.

---

## 4. System Design & Interview Insights

### Q1: Why use Redis for seat holds instead of storing temporary holds in PostgreSQL?
**Answer**:
High-concurrency ticket drops (e.g. 10,000 users attempting to buy 100 seats) generate immense write and lock contention. 
If temporary holds were placed directly in PostgreSQL:
1. Every hold would require disk writes (WAL + B-tree index modifications) and row-level locks on relational tables.
2. Expired holds would require continuous polling (`DELETE FROM holds WHERE expires_at < NOW()`), creating table bloat, autovacuum lag, and read contention on transactional tables.
3. Redis operates purely in-memory with sub-millisecond latencies, single-threaded atomic operations, and native key eviction via TTL. Holding seats in Redis offloads massive churn from the primary database, ensuring PostgreSQL only processes finalized bookings.

### Q2: How does `SET key val EX ttl NX` prevent race conditions in distributed systems?
**Answer**:
In Redis, `SETNX` (`SET ... NX`) is atomic. Because Redis processes commands sequentially on its single-threaded event loop, two simultaneous requests to `SET lock:seat:101 user_id NX` cannot interleave. Exactly one request will evaluate first, find that the key does not exist, set the key, and return `'OK'`. The second request will find the key already exists and return `nil`. Combining this with `EX ttl` guarantees that the lock expires automatically even if the holding process crashes, preventing permanent deadlocks.

