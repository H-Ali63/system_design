/**
 * config/gateway.js
 *
 * Central configuration for the API Gateway itself.
 * Values can be overridden via environment variables for
 * different deployment environments (dev / staging / prod).
 */

const config = {
  // Server
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || "development",

  // Upstream backend service
  // In production, this could be a service discovery URL or internal load balancer
  upstreamBaseUrl:
    process.env.UPSTREAM_BASE_URL || "https://jsonplaceholder.typicode.com",

  // Request timeout for upstream calls (ms)
  upstreamTimeoutMs: parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 10000,

  // Global fallback rate limit (applies if partner config is missing)
  defaultRateLimit: {
    maxRequests: 60,
    windowMs: 60 * 1000,
  },

  // Route prefix exposed externally (all partner requests go through /api/*)
  apiPrefix: "/api",

  // Map of external route prefixes → upstream paths
  // Gateway strips /api and forwards the rest to the upstream
  routeMap: {
    "/api/users": "/users",
    "/api/posts": "/posts",
    "/api/comments": "/comments",
    "/api/todos": "/todos",
    "/api/albums": "/albums",
    "/api/photos": "/photos",
  },
};

module.exports = config;
