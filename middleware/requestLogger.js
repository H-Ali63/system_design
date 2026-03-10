/**
 * middleware/requestLogger.js
 *
 * Request Lifecycle Middleware
 *
 * 1. requestIdMiddleware  — attaches a unique ID to every request
 * 2. requestLoggerMiddleware — logs request completion with timing
 *
 * The request ID is returned in the X-Request-ID response header
 * so partners can correlate their calls with gateway logs.
 */

const { v4: uuidv4 } = require("uuid");
const { logRequest } = require("../utils/logger");

/**
 * Attaches a unique request ID to req.requestId and the response header.
 * If the client already sends X-Request-ID, we honor it (useful for tracing).
 */
const requestIdMiddleware = (req, res, next) => {
  const requestId = req.headers["x-request-id"] || uuidv4();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
};

/**
 * Captures request start time, then logs completion details
 * using the `finish` event on the response stream.
 *
 * This captures the full round-trip time including upstream proxy latency.
 */
const requestLoggerMiddleware = (req, res, next) => {
  const startTime = Date.now();

  // Hook into response finish event (fires after last byte is sent)
  res.on("finish", () => {
    const durationMs = Date.now() - startTime;

    logRequest({
      requestId: req.requestId,
      partner: req.partner?.name || "unauthenticated",
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      upstreamUrl: req.upstreamUrl || null, // Set by proxy route handler
      error: req.proxyError || null,        // Set by error handler
    });
  });

  next();
};

module.exports = { requestIdMiddleware, requestLoggerMiddleware };
