# Milestone M09 — Payment Simulation & Transactional Lifecycle

## 1. Overview & Architectural Role

In **SeatForge**, the payment lifecycle coordinates between:
- In-memory ephemeral leases (Redis seat holds from M08)
- External or simulated financial payment gateways (Stripe, Razorpay, Mock Gateway)
- Permanent transactional state in PostgreSQL (`payments`, `bookings`, `show_seats`)

A core challenge in high-concurrency ticket platforms is ensuring that payments, bookings, and seat states **never enter an inconsistent or orphaned state**, even when bank networks time out, credit cards are declined, or clients disconnect mid-checkout.

---

## 2. Pluggable Payment Provider Pattern (SOLID: OCP & LSP)

To support real payment gateways in production without altering business orchestration logic, the payment system adopts the **Strategy Pattern**:

```text
                       +-----------------------+
                       |    PaymentService     |
                       +-----------------------+
                                   | (depends on interface)
                                   v
                       +-----------------------+
                       |   <<PaymentProvider>>  |
                       |       Interface       |
                       +-----------------------+
                                   ^
                 +-----------------+-----------------+
                 |                                   |
                 v                                   v
      +---------------------+             +---------------------+
      | MockPaymentProvider |             | StripeProvider (fut)|
      +---------------------+             +---------------------+
```

- **Open/Closed Principle (OCP)**: The system is open for extension (adding `StripePaymentProvider`, `RazorpayPaymentProvider`) but closed for modification (`PaymentService` requires zero code changes to support a new provider).
- **Liskov Substitution Principle (LSP)**: Any implementation of `PaymentProvider` adheres to the unified contract and can substitute `MockPaymentProvider` transparently.

---

## 3. Payment States & Transactional State Machine

```text
                      [ Active Hold in Redis (M08) ]
                                    |
                                    | POST /api/payments/process
                                    v
                         +--------------------+
                         |  PENDING Booking   |
                         |  PENDING Payment   |
                         +--------------------+
                                    |
                        (Charge via PaymentProvider)
                                    |
                  +-----------------+-----------------+
                  |                                   |
           (Charge Success)                    (Charge Failure)
                  |                                   |
                  v                                   v
        +--------------------+              +--------------------+
        | Payment: SUCCESS   |              | Payment: FAILED    |
        | Booking: CONFIRMED |              | Booking: FAILED    |
        | Seats:   BOOKED    |              | Seats:   AVAILABLE |
        | Redis:   RELEASED  |              | Redis:   RELEASED  |
        +--------------------+              +--------------------+
                  |
         (POST /refund)
                  |
                  v
        +--------------------+
        | Payment: REFUNDED  |
        | Booking: CANCELLED |
        | Seats:   AVAILABLE |
        +--------------------+
```

### A. Success Path
1. `PaymentService` creates a `PENDING` booking inside a PostgreSQL transaction, locking seats with `SELECT ... FOR UPDATE`.
2. `PaymentProvider.charge()` executes the simulated charge (returning a transaction reference `txn_mock_<uuid>`).
3. Inside a database transaction, payment transitions to `SUCCESS`, booking transitions to `CONFIRMED`, and `show_seats` transitions to `BOOKED`.
4. Redis hold keys (`seat_hold:<showId>:<seatId>` and `hold:<holdId>`) are cleanly evicted.

### B. Failure & Decline Path
1. `PaymentProvider.charge()` returns `success: false` (triggered by card decline `tok_decline`, insufficient funds, or gateway timeout `tok_timeout`).
2. Inside a database transaction:
   - Payment record transitions to `FAILED`.
   - Booking record transitions to `FAILED`.
   - `show_seats` are unlocked and reverted back to `AVAILABLE`.
3. Redis hold is released immediately, allowing other customers to purchase the seats.
4. Returns HTTP 402 Payment Required with clear diagnostics (`Card was declined by issuing bank`).

### C. Refund Path (`POST /api/payments/:id/refund`)
1. Verifies booking ownership and that payment status is currently `SUCCESS`.
2. Dispatches refund request to `PaymentProvider.refund()`.
3. Upon provider confirmation, atomically transitions payment to `REFUNDED`, booking to `CANCELLED`, and releases seats back to `AVAILABLE`.

---

## 4. Test Coverage & Verification

Automated integration test suite in `server/tests/payment.test.ts`:
- **Hold-to-Payment Success**: Verified 200 OK, `status: 'SUCCESS'`, transaction ref `txn_mock_`, PostgreSQL states (`CONFIRMED`, `BOOKED`), and Redis hold eviction.
- **Card Decline Simulation**: Verified 402 Payment Required with `tok_decline`, PostgreSQL states (`FAILED`, `AVAILABLE`), and immediate availability for other customers.
- **Gateway Timeout Simulation**: Verified 402 with `tok_timeout` and timeout diagnostics.
- **Double Payment Prevention**: Verified 409 Conflict when attempting to charge an already `CONFIRMED` booking.
- **Payment Retrieval & IDOR Enforcement**: Verified owner can view payment receipt; non-owner receives 403 Forbidden.
- **Booking Payment History**: Verified `GET /api/payments/booking/:bookingId`.
- **Refund Workflow**: Verified `POST /api/payments/:id/refund` returns `REFUNDED`, transitions booking to `CANCELLED`, and restores seats to `AVAILABLE`.
- **Asynchronous Webhooks**: Verified `POST /api/payments/webhook` processes `payment.succeeded` events and confirms pending bookings.

**Total tests passing**: 72 / 72 across 9 test suites.

---

## 5. System Design Interview Insights

### Q1: What happens if the server crashes after the payment gateway charges the card, but before the database records `CONFIRMED`?
**Answer**:
This is the classic **Dual-Write / Distributed Transaction problem**.
1. **The Risk**: The customer's credit card was charged by the bank, but the local database crashed before committing `CONFIRMED`.
2. **Mitigation 1 — Idempotency Keys (M10)**: Every charge request sends a unique `idempotency_key` (e.g. `idem_<bookingId>`) to the gateway. If the server restarts and retries the charge, the gateway returns the existing charge result rather than double-charging.
3. **Mitigation 2 — Webhook Reconciliation**: Payment gateways (Stripe, Razorpay) emit asynchronous webhooks (`payment_intent.succeeded`). The webhook endpoint (`POST /api/payments/webhook`) acts as a reconciliation worker. When the webhook arrives with the transaction reference, it checks if the booking is still `PENDING` and promotes it to `CONFIRMED`.
4. **Mitigation 3 — Outbox Pattern & Background Workers (M12/M13)**: A scheduled reconciliation worker periodically queries the gateway for any `PENDING` transactions older than 5 minutes to synchronize unconfirmed charges.

### Q2: How does the system handle a gateway timeout during peak ticket sales?
**Answer**:
When an HTTP request to the payment gateway times out (e.g. after 15 seconds):
1. **Never Assume Failure**: A timeout is an **unknown state**, not a failure (the charge may have succeeded on the card network).
2. The payment record is kept in `PENDING` status.
3. A background reconciliation task polls the gateway API using the idempotency key to query the definitive charge status.
4. If the charge succeeded, the booking is confirmed; if the charge was never created, the hold is released.
