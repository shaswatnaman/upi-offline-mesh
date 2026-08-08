# UPI Offline Mesh

[![Build & Test](https://github.com/shaswatnaman/upi-offline-mesh/actions/workflows/ci.yml/badge.svg)](https://github.com/shaswatnaman/upi-offline-mesh/actions/workflows/ci.yml)
[![Java 17](https://img.shields.io/badge/Java-17-blue)](https://adoptium.net/)
[![Spring Boot 3.5](https://img.shields.io/badge/Spring%20Boot-3.5-brightgreen)](https://spring.io/projects/spring-boot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

A Spring Boot backend that demonstrates **offline UPI payments routed through a Bluetooth-style mesh network**. You're in a basement with zero connectivity. You send your friend ₹500. Your phone encrypts the payment, broadcasts it to nearby phones, and the packet hops device-to-device until *some* phone walks outside, gets 4G, and silently uploads it to this backend. The backend decrypts, deduplicates, and settles.

This repo is the **server side** of that system, plus a software simulator of the mesh so you can demo the entire flow on a single laptop without any real Bluetooth hardware.

---

## Table of Contents

1. [What this demo proves](#what-this-demo-proves)
2. [How to run it](#how-to-run-it)
3. [The demo flow (step by step)](#the-demo-flow-step-by-step)
4. [Architecture](#architecture)
5. [The three hard problems and how they're solved](#the-three-hard-problems-and-how-theyre-solved)
6. [Project structure](#project-structure)
7. [API reference](#api-reference)
8. [Tests](#tests)
9. [What's NOT real (and what would change for production)](#whats-not-real-and-what-would-change-for-production)
10. [Honest limitations of the concept](#honest-limitations-of-the-concept)
11. [Future improvements](#future-improvements)
12. [License](#license)

---

## What this demo proves

Three things working end to end:

1. **A payment can travel from sender to backend through untrusted intermediaries** without any of them being able to read or tamper with it. (Hybrid RSA + AES-GCM encryption.)
2. **Even if the same payment reaches the backend simultaneously through multiple bridge nodes, it settles exactly once.** (Atomic idempotency via `ConcurrentHashMap.putIfAbsent` — JVM-local equivalent of Redis `SETNX`.)
3. **A tampered or replayed packet is rejected** before it touches the ledger.

You'll see all three in the dashboard.

---

## How to run it

### Prerequisites

- **JDK 17 or newer** installed and on PATH (or `JAVA_HOME` set). Check with `java -version`.
- That's it. No database, no Redis, no Maven install. Just Java.

### Run on Mac/Linux

```bash
./mvnw spring-boot:run
```

### Run on Windows

```cmd
mvnw.cmd spring-boot:run
```

The first run downloads Maven (~10 MB) and dependencies (~80 MB) — give it a couple of minutes. Subsequent runs start in ~5 seconds.

### Open the dashboard

Once you see `Started UpiMeshApplication in X.XXX seconds`, open:

**http://localhost:8080**

### Run the tests

```bash
./mvnw test
```

The headline test is `IdempotencyConcurrencyTest` — it fires three threads delivering the same packet simultaneously and asserts that exactly one settles.

---

## The demo flow (step by step)

The dashboard has four buttons that walk through the full pipeline.

### Step 1 — Compose a payment

Choose sender, receiver, amount, PIN. Click **"📤 Inject into Mesh"**.

The server pretends to be the sender's phone: builds a `PaymentInstruction` with a unique nonce and timestamp, encrypts it with the server's RSA public key (hybrid encryption), wraps it in a `MeshPacket` with TTL 5, and hands it to `phone-alice`.

### Step 2 — Run gossip rounds

Click **"🔄 Run Gossip Round"** once or twice.

Each round, every device that holds a packet broadcasts it to every other device within "Bluetooth range" (all devices, in our simulator). TTL decrements per hop.

### Step 3 — Bridge node walks outside

Click **"📡 Bridges Upload to Backend"**.

`phone-bridge` (the only device with `hasInternet=true`) simulates walking outside and getting 4G. It POSTs every packet it holds to `/api/bridge/ingest`. Watch the Account Balances table — money moves. Watch the Transaction Ledger — a new row appears.

### Step 4 — Reset and repeat

Click **"🗑 Reset Mesh + Cache"** to start fresh. Try injecting the same payment twice, or run gossip many times, to see different scenarios.

To exercise concurrent idempotency:
```bash
./mvnw test -Dtest=IdempotencyConcurrencyTest#singlePacketDeliveredByThreeBridgesSettlesExactlyOnce
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SENDER PHONE (offline)                          │
│  PaymentInstruction { sender, receiver, amount, pinHash, nonce, time }  │
│              │                                                          │
│              ▼ encrypt with server's RSA public key                     │
│   MeshPacket { packetId, ttl, createdAt, ciphertext }                   │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │ Bluetooth gossip (BLE / Wi-Fi Direct)
                                       ▼
        ┌─────────┐  hop   ┌─────────┐  hop   ┌─────────┐
        │stranger1│ ──────▶│stranger2│ ──────▶│ bridge  │◀── walks outside / gets 4G
        └─────────┘        └─────────┘        └────┬────┘
                                                   │
                                                   ▼ HTTPS POST
┌─────────────────────────────────────────────────────────────────────────┐
│                     SPRING BOOT BACKEND (this project)                  │
│                                                                         │
│  POST /api/bridge/ingest                                                │
│       │                                                                 │
│       ▼                                                                 │
│  [1] hash ciphertext (SHA-256)                                          │
│       │                                                                 │
│       ▼                                                                 │
│  [2] IdempotencyService.claim(hash)  ◀── ConcurrentHashMap.putIfAbsent  │
│       │                                  (≈ Redis SETNX). Duplicates   │
│       │                                  short-circuited here.         │
│       ▼                                                                 │
│  [3] HybridCryptoService.decrypt(ciphertext)                            │
│       │       (RSA-OAEP unwraps AES key; AES-GCM decrypts payload      │
│       │        AND verifies the auth tag — tampering = exception)       │
│       ▼                                                                 │
│  [4] Freshness check: signedAt within last 24 hours                     │
│       │                                                                 │
│       ▼                                                                 │
│  [5] SettlementService.settle()                                         │
│       @Transactional: debit sender, credit receiver, write ledger       │
│       @Version on Account = optimistic locking (defense in depth)       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## The three hard problems and how they're solved

### Problem 1: Untrusted intermediates

A random stranger's phone is carrying your transaction. How do you stop them from reading the amount or changing it?

**Solution: Hybrid encryption (RSA-OAEP + AES-GCM).**

The sender encrypts the payload with the server's public key. Only the server holds the private key, so intermediates see opaque ciphertext. But RSA can only encrypt ~245 bytes for a 2048-bit key, and our payload can exceed that. So we use the standard hybrid pattern:

1. Generate a fresh AES-256 key for *this packet*.
2. Encrypt the JSON with **AES-256-GCM** (fast + authenticated).
3. Encrypt just the AES key with **RSA-OAEP**.
4. Concatenate: `[256 bytes RSA-encrypted AES key][12 bytes IV][AES ciphertext + 16-byte GCM tag]`.

**Why GCM specifically?** It's authenticated encryption. Flip one bit anywhere in the ciphertext and decryption throws — the GCM tag won't verify. See [`HybridCryptoService.java`](src/main/java/com/shaswatnaman/upimesh/crypto/HybridCryptoService.java).

### Problem 2: The duplicate-storm

Three bridge nodes hold the same packet. They all walk outside at the same instant. They all POST within milliseconds. If you naively process all three, the sender is debited ₹1500 instead of ₹500.

**Solution: Atomic compare-and-set on the ciphertext hash.**

```java
// IdempotencyService.java
return seen.putIfAbsent(packetHash, Instant.now()) == null;
```

`ConcurrentHashMap.putIfAbsent` is atomic. Even if 100 threads call it at the exact same nanosecond, exactly one returns `null` (the first claimer). Only the first claimer proceeds to decrypt and settle; the rest are short-circuited as `DUPLICATE_DROPPED`.

**Why hash the ciphertext, not the `packetId`?** Intermediates can rewrite `packetId`. Two legitimate deliveries of the same payment have byte-identical ciphertexts (same key + IV + plaintext → same output), so their hashes match — the idempotency key is stable even across different bridge nodes.

In production this `ConcurrentHashMap` becomes Redis: `SET key NX EX 86400`. Same semantics, distributed. The `transactions.packet_hash` column also has a unique index as defense-in-depth if the cache ever fails.

### Problem 3: Replay attacks

An attacker who captured a ciphertext weeks ago could replay it whenever convenient.

**Solution: Two layers.**

1. **Inside the encrypted payload**, the sender includes `signedAt` (epoch millis). The server rejects any packet older than 24 hours. The attacker can't change `signedAt` without breaking the GCM tag.
2. **Inside the payload**, the sender includes a **nonce** (UUID). Two legitimate payments from Alice to Bob for ₹100 have different nonces → different ciphertexts → different hashes → both settle. A *replay* of a specific signed packet is byte-identical → same hash → idempotency cache catches it.

---

## Project structure

```
upi-offline-mesh/
├── .github/workflows/ci.yml            GitHub Actions — builds + tests on Linux & macOS
├── pom.xml                             Maven build, Spring Boot 3.5, Java 17
├── mvnw / mvnw.cmd                     Maven wrapper (no install needed)
├── LICENSE                             MIT
├── CONTRIBUTING.md
└── src/
    ├── main/
    │   ├── resources/
    │   │   ├── application.properties  H2 in-memory DB, port 8080, TTL config
    │   │   └── templates/
    │   │       └── dashboard.html      Interactive demo dashboard
    │   └── java/com/shaswatnaman/upimesh/
    │       ├── UpiMeshApplication.java         Spring Boot entry point
    │       ├── model/                          Domain objects
    │       │   ├── Account.java                JPA entity — @Version for optimistic locking
    │       │   ├── Transaction.java            Settled-tx ledger (unique idx on packetHash)
    │       │   ├── MeshPacket.java             Wire format (outer fields readable, ciphertext opaque)
    │       │   └── PaymentInstruction.java     Decrypted payload (sender/receiver/amount/nonce/time)
    │       ├── repository/                     Spring Data JPA interfaces
    │       │   ├── AccountRepository.java
    │       │   └── TransactionRepository.java
    │       ├── crypto/                         Cryptography layer
    │       │   ├── ServerKeyHolder.java        Generates RSA-2048 keypair on startup
    │       │   └── HybridCryptoService.java    RSA-OAEP + AES-256-GCM encrypt/decrypt + hash
    │       ├── service/                        Business logic
    │       │   ├── DemoService.java            Seeds accounts; simulates sender phone
    │       │   ├── VirtualDevice.java          One simulated phone in the mesh
    │       │   ├── MeshSimulatorService.java   Gossip protocol across virtual devices
    │       │   ├── IdempotencyService.java     ConcurrentHashMap ≈ Redis SETNX
    │       │   ├── SettlementService.java      @Transactional debit + credit + ledger insert
    │       │   └── BridgeIngestionService.java Pipeline: hash → claim → decrypt → freshness → settle
    │       ├── controller/
    │       │   ├── ApiController.java          All REST endpoints
    │       │   └── DashboardController.java    Serves dashboard.html at /
    │       └── exception/
    │           └── GlobalExceptionHandler.java Structured JSON error responses
    └── test/
        └── java/com/shaswatnaman/upimesh/
            └── IdempotencyConcurrencyTest.java  4 tests covering all core properties
```

---

## API reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | Dashboard HTML |
| GET | `/api/server-key` | — | Server's RSA public key (base64) |
| GET | `/api/accounts` | — | All accounts and balances |
| GET | `/api/transactions` | — | Last 20 transactions |
| GET | `/api/mesh/state` | — | Current state of every virtual device |
| POST | `/api/demo/send` | — | Simulate sender phone — encrypt + inject |
| POST | `/api/mesh/gossip` | — | Run one round of gossip across the mesh |
| POST | `/api/mesh/flush` | — | Bridges upload to backend (parallel) |
| POST | `/api/mesh/reset` | — | Clear mesh + idempotency cache |
| POST | `/api/bridge/ingest` | — | **The production endpoint.** Real bridges POST here. |
| GET | `/h2-console` | — | Browse the in-memory database |

H2 console: JDBC URL `jdbc:h2:mem:upimesh`, username `sa`, no password.

### POST `/api/bridge/ingest`

```http
POST /api/bridge/ingest
Content-Type: application/json
X-Bridge-Node-Id: phone-bridge-42
X-Hop-Count: 3

{
  "packetId": "550e8400-e29b-41d4-a716-446655440000",
  "ttl": 2,
  "createdAt": 1730000000000,
  "ciphertext": "<base64-encoded RSA+AES blob>"
}
```

Response:
```json
{
  "outcome": "SETTLED",
  "packetHash": "a3f8c9...",
  "reason": null,
  "transactionId": 42
}
```

`outcome` is one of: `SETTLED`, `DUPLICATE_DROPPED`, `INVALID`.

---

## Tests

```bash
./mvnw test
```

Four tests in [`IdempotencyConcurrencyTest.java`](src/test/java/com/shaswatnaman/upimesh/IdempotencyConcurrencyTest.java):

| Test | What it proves |
|------|----------------|
| `encryptDecryptRoundTrip` | Hybrid encryption is symmetric and lossless |
| `tamperedCiphertextIsRejected` | Flipping one byte returns `INVALID` — GCM tag fails |
| `singlePacketDeliveredByThreeBridgesSettlesExactlyOnce` | 3 concurrent threads → exactly 1 SETTLED, 2 DUPLICATE_DROPPED |
| `insufficientBalanceIsRejectedNotSettled` | Insufficient balance returns `INVALID` and leaves balance unchanged |

---

## What's NOT real (and what would change for production)

| What's in the demo | What it would be in production |
|--------------------|-------------------------------|
| H2 in-memory DB | PostgreSQL / MySQL with replicas |
| `ConcurrentHashMap` for idempotency | Redis with `SET NX EX` |
| RSA keypair regenerated on every startup | Private key in HSM (AWS KMS, HashiCorp Vault) |
| Server-side `DemoService.createPacket()` | Same logic in an Android/Kotlin app |
| Software-simulated mesh | Real BLE GATT or Wi-Fi Direct between phones |
| One settlement service that owns the ledger | Integration with NPCI / a real bank core |
| No auth on `/api/bridge/ingest` | Mutual TLS or signed bridge-node certificates |
| In-memory accounts seeded on startup | Real KYC'd users, real VPAs, real PIN verification |
| H2 console exposed | Disabled |
| No rate limiting | Per-bridge-node rate limit, per-sender velocity check |

The cryptography and idempotency code is essentially production-shaped. The infrastructure around it is what changes.

---

## Honest limitations of the concept

1. **The receiver has no way to verify the sender has the funds.** When the sender shows "₹500 sent," it's an IOU, not a settled payment. If the sender's account is empty when the packet reaches the backend, the settlement is `REJECTED`. This is why real offline UPI (UPI Lite) uses a pre-funded hardware-backed wallet.
2. **A malicious sender can double-spend offline.** With ₹500 in their account, they could send two separate packets to two different people. Whichever hits the backend first wins; the second gets rejected.
3. **Bluetooth in real life is hard.** Background BLE on Android is heavily throttled since Android 8. iOS peripheral mode is locked down. This demo sidesteps that entirely by simulating the mesh in software.
4. **Privacy / liability.** A stranger carries your encrypted transaction on their phone. They can't read it, but its existence is metadata.

For a portfolio or academic context: name the concept honestly as **"mesh-routed deferred settlement"** rather than "real-time offline UPI," and you'll have a much stronger pitch. The cryptography and idempotency code here is real engineering.

---

## Future improvements

- [ ] **IPv6 / BLE simulation** — model proximity and range-limited gossip
- [ ] **Multiple bridge nodes** — seed more devices with `hasInternet=true` to exercise concurrent ingestion from the dashboard
- [ ] **UPI Lite-style pre-funded wallet** — solve the double-spend problem with a hardware-attested balance
- [ ] **Redis backend** for idempotency — swap `ConcurrentHashMap` for Redis with `SET NX EX`
- [ ] **Persistent H2 / PostgreSQL profile** — `application-prod.properties` + Spring profile
- [ ] **Prometheus metrics** — expose settlement rate, duplicate rate, invalid rate

---

## Screenshots

> *Add screenshots of the terminal output and dashboard here.*

---

## License

MIT — see [LICENSE](LICENSE).
