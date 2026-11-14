# Milestone M11 — Real-Time Seat Updates (Socket.IO)

## 1. Overview & Problem Definition

In a high-concurrency ticket booking platform like **SeatForge**, hundreds of users may view the same seat layout simultaneously. Without real-time push updates:
- Users attempt to select and book seats that have already been held or confirmed by others, leading to frustrating 409 Conflict errors.
- Fast polling (e.g., querying `GET /api/shows/:id/seats` every 2 seconds) floods the database with redundant queries, saturating connection pools and degrading API throughput.
- When temporary seat holds expire or payments fail, available seats remain visually locked on other clients' screens until a manual page refresh occurs.

Milestone M11 resolves this by establishing a bi-directional WebSocket layer using **Socket.IO**:
- **Room-based multiplexing**: Clients subscribe only to the show room they are actively viewing (`show:<show_id>`), eliminating global broadcast chatter.
- **Event-driven push**: State transitions (`seat:held`, `seat:released`, `seat:booked`) are pushed instantly to all viewing clients.
- **Client live grid sync**: The UI dynamically updates seat availability and color-coded status badges with zero page reloads.

---

## 2. Real-Time Architecture & Event Flow

```text
       +-----------------------+              +-----------------------+
       |   Client A (Viewer)   |              |  Client B (Purchaser) |
       +-----------------------+              +-----------------------+
                   |                                      |
                   | emit('join:show', { showId })        | emit('join:show', { showId })
                   |                                      |
                   v                                      v
       +--------------------------------------------------------------+
       |                  Socket.IO Server Layer                      |
       |                Room: "show:d8d2...478e"                      |
       +--------------------------------------------------------------+
                                       ^
                                       | Broadcast: emitSeatHeld()
                                       | Broadcast: emitSeatReleased()
                                       | Broadcast: emitSeatBooked()
                                       |
                   +-------------------+-------------------+
                   |                   |                   |
           +---------------+   +----------------+  +----------------+
           |  HoldService  |   | BookingService |  | PaymentService |
           +---------------+   +----------------+  +----------------+
                   |                   |                   |
            (Hold Acquired/     (Booking Done)     (Paid / Refunded /
               Released)                                Declined)
```

---

## 3. Event Specifications & Typed Contracts

| Event Name | Direction | Payload | Trigger |
| :--- | :--- | :--- | :--- |
| `join:show` | Client -> Server | `{ showId: string }` | Client selects a screening time in the catalog UI |
| `leave:show` | Client -> Server | `{ showId: string }` | Client switches shows or navigates away |
| `joined:show` | Server -> Client | `{ showId: string, room: string }` | Server confirms room subscription |
| `seat:held` | Server -> Client | `{ showId, seatIds, heldByUserId, expiresAt }` | User claims temporary Redis seat hold (M08) |
| `seat:released` | Server -> Client | `{ showId, seatIds, reason }` | Hold released manually, expired, or payment failed/refunded |
| `seat:booked` | Server -> Client | `{ showId, seatIds, bookingId }` | Booking permanently confirmed and paid in PostgreSQL |

---

## 4. Key Implementation Details

### A. Factory Decoupling & Server Instance (`server/src/server.ts`)
Decouples Express configuration (`createApp`) from Socket.IO initialization (`initSocketServer`) and HTTP port listening (`index.ts`). Enables integration tests to bind to ephemeral port `0` in-memory without port collision.

### B. Decoupled Event Dispatcher (`server/src/socket/socket.service.ts`)
Adheres to DIP: Business services (`HoldService`, `BookingService`, `PaymentService`) inject `SocketService` rather than directly coupling to Socket.IO internals. If WebSockets are not initialized (such as in standalone unit tests), calls degrade gracefully without error.

### C. Client Live Sync Hook & Grid Sync (`client/src/components/MovieCatalog.tsx`)
- Subscribes to `show:<showId>` upon show selection.
- Listens to `seat:held`, `seat:released`, and `seat:booked`.
- Updates `seatLayout` state immutably: dynamically updates status, decrements/increments `availableSeats` count, and renders a live green pulse status pill (`Live Sync Active`).
- Cleans up event listeners and leaves rooms on unmount.

---

## 5. System Design Interview Q&A

### Q1: How do you scale Socket.IO across multiple load-balanced backend instances?
> **Answer**: By default, Socket.IO stores room memberships and socket connections in-memory on a single node. In a multi-node cluster (e.g. Kubernetes with multiple replicas), a client on Node A wouldn't receive events emitted on Node B. 
> To scale horizontally:
> 1. Use the **Socket.IO Redis Adapter** (`@socket.io/redis-adapter` with Redis Pub/Sub) so that broadcasts on any node publish to Redis and fan out across all cluster instances.
> 2. Configure sticky sessions or use WebSocket-only transport (`transports: ['websocket']`) at the reverse proxy (Nginx / AWS ALB) to bypass HTTP long-polling handshake affinity requirements.

### Q2: Why room-based broadcasting instead of sending updates to all connected sockets?
> **Answer**: Global broadcasting creates an \(O(N)\) message fan-out for every seat event across all connected clients on the platform. If 100,000 users are online browsing 50 different theaters, broadcasting every hold to everyone would overwhelm network bandwidth and client browsers with irrelevant updates. 
> Room-based partitioning (`show:<show_id>`) restricts fan-out strictly to viewers currently watching that specific auditorium grid, reducing network load by orders of magnitude.

### Q3: What happens if a user disconnects or experiences network jitter during a seat hold?
> **Answer**: The socket connection drops and automatically attempts exponential backoff reconnection. However, the temporary seat hold itself is preserved in Redis with its active TTL lease. Upon reconnecting, the client re-joins the room and receives live state without losing their hold.

