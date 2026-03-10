/**
 * server.js
 *
 * API Gateway — Entry Point
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture:
 *
 *   External Partner
 *        │
 *        │  x-api-key header
 *        ▼
 *  ┌─────────────────────────────────────────────────────────┐
 *  │                    API GATEWAY                          │
 *  │                                                         │
 *  │  [Request ID]  → Assign unique ID, start timer          │
 *  │  [Auth]        → Validate API key, load partner ctx     │
 *  │  [Rate Limit]  → Check per-partner quota (in-memory)    │
 *  │  [Access Ctrl] → Verify route is in partner allowlist   │
 *  │  [Proxy]       → Forward to upstream, stream response   │
 *  │  [Logger]      → Log partner, path, status, latency     │
 *  └─────────────────────────────────────────────────────────┘
 *        │
 *        ▼
 *   https://jsonplaceholder.typicode.com  (Upstream Backend)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware execution order (order matters!):
 *
 *  1. requestIdMiddleware   — must be first (IDs needed by all downstream)
 *  2. requestLoggerMiddleware — hooks res.finish, must be early
 *  3. express.json()        — parse body before proxy reads it
 *  4. adminRoutes           — health/admin bypass auth
 *  5. authMiddleware        — 401 if no valid API key
 *  6. rateLimiterMiddleware — 429 if partner over quota
 *  7. accessControlMiddleware — 403 if route not in allowlist
 *  8. proxyRoutes           — forward to upstream
 *  9. 404 handler           — catch-all for unknown routes
 * 10. globalErrorHandler    — catch unhandled errors
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express = require("express");
const { requestIdMiddleware, requestLoggerMiddleware } = require("./middleware/requestLogger");
const authMiddleware = require("./middleware/authMiddleware");
const rateLimiterMiddleware = require("./middleware/rateLimiter");
const accessControlMiddleware = require("./middleware/accessControl");
const proxyRoutes = require("./routes/proxyRoutes");
const adminRoutes = require("./routes/adminRoutes");
const gatewayConfig = require("./config/gateway");
const { logger } = require("./utils/logger");

const app = express();

// ── Global Middleware ─────────────────────────────────────────────────────────

// 1. Attach a unique request ID to every request
app.use(requestIdMiddleware);

// 2. Log every request completion (hooks into res.finish)
app.use(requestLoggerMiddleware);

// 3. Parse JSON bodies (needed before proxy reads req.body)
app.use(express.json());

// 4. Parse URL-encoded bodies (form data)
app.use(express.urlencoded({ extended: true }));

// ── Unauthenticated Routes ────────────────────────────────────────────────────

// Health checks and admin endpoints — no API key required
app.use("/", adminRoutes);

// ── Authenticated Partner API Routes ─────────────────────────────────────────

// All /api/* routes go through the full security pipeline:
// Auth → Rate Limit → Access Control → Proxy

app.use(
  gatewayConfig.apiPrefix,  // "/api"
  authMiddleware,            // Step 1: Who are you?
  rateLimiterMiddleware,     // Step 2: Are you within your quota?
  accessControlMiddleware,   // Step 3: Are you allowed here?
  proxyRoutes                // Step 4: Forward to upstream
);

// ── 404 Handler ───────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found on this gateway`,
    requestId: req.requestId,
  });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// Catches any unhandled synchronous or async errors bubbled up with next(err)

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error("Unhandled gateway error", {
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: "Internal Gateway Error",
    message: "An unexpected error occurred. Please try again.",
    requestId: req.requestId,
  });
});

// ── Start Server ──────────────────────────────────────────────────────────────

const server = app.listen(gatewayConfig.port, () => {
  logger.info(`API Gateway started`, {
    port: gatewayConfig.port,
    env: gatewayConfig.env,
    upstream: gatewayConfig.upstreamBaseUrl,
    routes: Object.keys(gatewayConfig.routeMap),
  });
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
// On SIGTERM (container stop, deploy), finish in-flight requests before exiting

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully");
  server.close(() => {
    logger.info("All connections closed. Exiting.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received — shutting down gracefully");
  server.close(() => {
    logger.info("All connections closed. Exiting.");
    process.exit(0);
  });
});

// Handle unhandled promise rejections (don't crash silently)
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", { reason, promise });
});

module.exports = app; // Export for testing
