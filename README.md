# API Gateway — System Design & Implementation

A production-grade API Management Layer built with Node.js and Express.

---

## Architecture

```
                    ┌──────────────────────────────────────────────────────┐
  External          │                   API GATEWAY                        │
  Partners          │                                                      │
                    │  ┌────────────┐  ┌──────────┐  ┌────────────────┐   │
  PartnerA ────────►│  │ Request ID │  │  Logger  │  │  Body Parser   │   │
  (x-api-key)       │  └─────┬──────┘  └────┬─────┘  └───────┬────────┘   │
                    │        │               │                │            │
  PartnerB ────────►│  ┌─────▼──────────────▼────────────────▼────────┐   │
  (x-api-key)       │  │              Middleware Pipeline               │   │
                    │  │                                                │   │
  PartnerC ────────►│  │  1. Auth Middleware   (401 if invalid key)    │   │
  (x-api-key)       │  │  2. Rate Limiter      (429 if over quota)     │   │
                    │  │  3. Access Control    (403 if wrong route)     │   │
                    │  │  4. Proxy Handler     (forward to upstream)   │   │
                    │  └────────────────────────┬───────────────────────┘   │
                    │                           │                           │
                    └───────────────────────────┼───────────────────────────┘
                                                │
                                                ▼
                              ┌─────────────────────────────────┐
                              │   jsonplaceholder.typicode.com   │
                              │                                  │
                              │   /users  /posts  /todos         │
                              │   /comments  /albums  /photos    │
                              └─────────────────────────────────┘
```

---

## Folder Structure

```
api-gateway/
├── server.js                  # Entry point, middleware stack, graceful shutdown
├── package.json
│
├── config/
│   ├── partners.js            # Partner registry (API keys, permissions, rate limits)
│   └── gateway.js             # Gateway config (port, upstream URL, route map)
│
├── middleware/
│   ├── authMiddleware.js      # API key validation + partner context
│   ├── rateLimiter.js         # Per-partner dynamic rate limiting
│   ├── accessControl.js       # Route-level authorization
│   └── requestLogger.js       # Request ID injection + completion logging
│
├── routes/
│   ├── proxyRoutes.js         # Universal proxy handler → upstream
│   └── adminRoutes.js         # /health and /admin endpoints
│
├── services/
│   └── backendService.js      # Axios upstream client + error classification
│
└── utils/
    └── logger.js              # Winston structured logger
```

---

## Setup & Run

### Install dependencies
```bash
cd api-gateway
npm install
```

### Start the gateway
```bash
node server.js
# or for development with auto-reload:
npx nodemon server.js
```

The gateway starts on **http://localhost:3000**

---

## Test Partners (pre-configured)

| Partner  | API Key                  | Allowed Routes                    | Rate Limit     |
|----------|--------------------------|-----------------------------------|----------------|
| PartnerA | `partner-a-key-abc123`   | /api/users, /api/posts, /api/comments | 100 req/min |
| PartnerB | `partner-b-key-def456`   | /api/todos                        | 50 req/min     |
| PartnerC | `partner-c-key-ghi789`   | /api/albums, /api/photos          | 200 req/min    |
| PartnerD | `partner-d-key-jkl000`   | suspended account                 | —              |

---

## Example API Calls

### ✅ PartnerA — Get all users
```bash
curl -s http://localhost:3000/api/users \
  -H "x-api-key: partner-a-key-abc123" | head -c 300
```

### ✅ PartnerA — Get a specific post
```bash
curl -s http://localhost:3000/api/posts/1 \
  -H "x-api-key: partner-a-key-abc123"
```

### ✅ PartnerA — Get comments for a post
```bash
curl -s http://localhost:3000/api/comments?postId=1 \
  -H "x-api-key: partner-a-key-abc123"
```

### ✅ PartnerA — Create a new post
```bash
curl -s -X POST http://localhost:3000/api/posts \
  -H "x-api-key: partner-a-key-abc123" \
  -H "Content-Type: application/json" \
  -d '{"title": "My Post", "body": "Hello world", "userId": 1}'
```

### ✅ PartnerB — Get todos
```bash
curl -s http://localhost:3000/api/todos \
  -H "x-api-key: partner-b-key-def456"
```

### ❌ PartnerB — Try to access users (forbidden)
```bash
curl -s http://localhost:3000/api/users \
  -H "x-api-key: partner-b-key-def456"
# → 403 Forbidden
```

### ❌ No API key (unauthorized)
```bash
curl -s http://localhost:3000/api/users
# → 401 Unauthorized
```

### ❌ Wrong API key
```bash
curl -s http://localhost:3000/api/users \
  -H "x-api-key: wrong-key"
# → 401 Unauthorized
```

### ❌ Suspended partner (PartnerD)
```bash
curl -s http://localhost:3000/api/users \
  -H "x-api-key: partner-d-key-jkl000"
# → 403 Forbidden (suspended)
```

### Health check
```bash
curl -s http://localhost:3000/health
```

### Upstream health check
```bash
curl -s http://localhost:3000/health/upstream
```

### Admin — List all partners
```bash
curl -s http://localhost:3000/admin/partners
```

---

## Expected Response Headers

Every gateway response includes:
- `X-Request-ID` — Unique request ID for correlation
- `X-Gateway-Version` — Gateway version
- `X-Partner` — Authenticated partner name
- `RateLimit-Limit` — Partner's request quota
- `RateLimit-Remaining` — Requests remaining in current window
- `RateLimit-Reset` — Epoch timestamp when window resets

---

## Production Improvements

### 1. Redis Distributed Rate Limiting
Replace the in-memory rate limiter store with `rate-limit-redis` so all
gateway replicas share a single quota counter per partner.
```
Partner quota = atomically tracked in Redis with TTL = windowMs
```

### 2. Response Caching
Add `node-cache` or Redis to cache upstream GET responses:
- Cache key: `${partner.name}:${method}:${upstreamPath}`
- TTL: configurable per route (e.g. /users → 60s, /photos → 300s)
- Bypass cache on POST/PUT/PATCH/DELETE

### 3. Circuit Breaker (opossum)
Wrap the upstream Axios client in a circuit breaker:
- Opens after 50% of requests fail in a 10s window
- Returns 503 immediately when open (no upstream calls)
- Half-opens after 30s to probe recovery

### 4. API Analytics
Log to a time-series store (InfluxDB / CloudWatch Metrics):
- Requests per partner per hour
- p50/p95/p99 latency per route
- Upstream error rate
- Rate limit hit rate per partner

### 5. Horizontal Scaling
```
                    ┌──── Load Balancer ────┐
                    │                       │
             Gateway Instance 1    Gateway Instance 2
                    │                       │
                    └──────── Redis ─────────┘
                          (shared state)
```
Stateless gateway nodes + Redis for:
- Rate limit counters
- Response cache
- Partner session state

### 6. API Key Rotation
Add a `previousApiKey` field per partner with a grace period so partners
can rotate keys without downtime.

### 7. Request/Response Transformation
Add a transform layer to normalize upstream responses — useful when
internal service schemas change without breaking partner contracts.
