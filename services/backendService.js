/**
 * services/backendService.js
 *
 * Upstream Proxy Service
 *
 * Responsible for forwarding requests to the upstream backend (JSONPlaceholder).
 * Abstracts Axios configuration, timeout handling, and error classification.
 *
 * In production, this layer is where you'd add:
 *  - Circuit breaker (opossum)
 *  - Response caching (node-cache / Redis)
 *  - Retry logic with exponential backoff
 *  - Request/response transformation
 */

const axios = require("axios");
const gatewayConfig = require("../config/gateway");
const { logger } = require("../utils/logger");

// Shared Axios instance with base URL and default timeout
const upstreamClient = axios.create({
  baseURL: gatewayConfig.upstreamBaseUrl,
  timeout: gatewayConfig.upstreamTimeoutMs,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    // Identify the gateway to upstream (useful for upstream logs)
    "User-Agent": "API-Gateway/1.0",
  },
});

/**
 * Forward an inbound Express request to the upstream backend.
 *
 * @param {Object} options
 * @param {string} options.method     - HTTP method (GET, POST, etc.)
 * @param {string} options.upstreamPath - Path on upstream service (e.g. /users/1)
 * @param {Object} options.query      - Query string params
 * @param {Object} options.body       - Request body (for POST/PUT/PATCH)
 * @param {string} options.requestId  - For correlation in logs
 * @returns {{ data, status, headers }}
 */
const forwardRequest = async ({ method, upstreamPath, query, body, requestId }) => {
  const config = {
    method: method.toLowerCase(),
    url: upstreamPath,
    params: query,
    // Only include body for methods that carry a payload
    ...(["post", "put", "patch"].includes(method.toLowerCase()) && { data: body }),
  };

  logger.info("Forwarding to upstream", {
    requestId,
    upstream: `${gatewayConfig.upstreamBaseUrl}${upstreamPath}`,
    method: config.method.toUpperCase(),
  });

  const response = await upstreamClient(config);

  return {
    data: response.data,
    status: response.status,
    headers: {
      "content-type": response.headers["content-type"],
    },
  };
};

/**
 * Classify upstream Axios errors into a structured error object.
 * Distinguishes between:
 *  - Upstream returned an HTTP error (4xx/5xx)
 *  - Network/timeout failure (upstream unreachable)
 */
const classifyUpstreamError = (error) => {
  if (error.response) {
    // Upstream responded with a non-2xx status
    return {
      type: "UPSTREAM_ERROR",
      status: error.response.status,
      message: `Upstream returned ${error.response.status}`,
      data: error.response.data,
    };
  } else if (error.code === "ECONNABORTED") {
    // Request timed out
    return {
      type: "UPSTREAM_TIMEOUT",
      status: 504,
      message: "Upstream service timed out",
    };
  } else {
    // Network failure (DNS, connection refused, etc.)
    return {
      type: "UPSTREAM_UNAVAILABLE",
      status: 502,
      message: "Upstream service is unavailable",
    };
  }
};

module.exports = { forwardRequest, classifyUpstreamError };

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * PRODUCTION UPGRADE: Circuit Breaker with Opossum
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Wrap forwardRequest with a circuit breaker to stop cascading failures:
 *
 *   const CircuitBreaker = require('opossum');
 *
 *   const breaker = new CircuitBreaker(forwardRequest, {
 *     timeout: 5000,           // Trip if request takes > 5s
 *     errorThresholdPercentage: 50, // Trip if >50% of calls fail
 *     resetTimeout: 30000,     // Try again after 30s
 *   });
 *
 *   breaker.fallback(() => ({ status: 503, data: { error: 'Service unavailable' } }));
 *   breaker.on('open', () => logger.error('Circuit breaker OPEN'));
 *   breaker.on('halfOpen', () => logger.warn('Circuit breaker HALF-OPEN'));
 *   breaker.on('close', () => logger.info('Circuit breaker CLOSED'));
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
