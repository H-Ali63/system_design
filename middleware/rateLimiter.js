/**
 * middleware/rateLimiter.js
 *
 * Per-Partner Rate Limiting Middleware
 *
 * Uses express-rate-limit with a per-partner key strategy so each
 * partner's quota is tracked independently.
 *
 * Current implementation: In-memory store (fine for single instance)
 * Production upgrade: Swap the store for RedisStore to share state
 *   across multiple gateway instances (see production notes below).
 *
 * Rate limit config is read from req.partner (set by authMiddleware),
 * so this middleware MUST run after authMiddleware.
 */

const rateLimit = require("express-rate-limit");
const { logger } = require("../utils/logger");
const gatewayConfig = require("../config/gateway");

/**
 * Dynamic rate limiter factory.
 *
 * express-rate-limit doesn't natively support per-key dynamic limits,
 * so we use a Map to cache one limiter instance per partner.
 * This avoids recreating limiter objects on every request.
 */
const limiterCache = new Map();

/**
 * Get or create a rate limiter for a specific partner.
 * Limiter is keyed by partner name and their configured limits.
 */
const getLimiterForPartner = (partner) => {
  const cacheKey = partner.name;

  if (limiterCache.has(cacheKey)) {
    return limiterCache.get(cacheKey);
  }

  const { maxRequests, windowMs } =
    partner.rateLimit || gatewayConfig.defaultRateLimit;

  const limiter = rateLimit({
    windowMs,
    max: maxRequests,

    // Key each counter by partner name (not IP), so different IPs
    // from the same partner share one quota pool
    keyGenerator: (req) => req.partner?.name || req.ip,

    // Custom response when limit is exceeded
    handler: (req, res) => {
      logger.warn("Rate limit exceeded", {
        requestId: req.requestId,
        partner: req.partner?.name,
        path: req.path,
        limit: maxRequests,
        windowMs,
      });

      res.status(429).json({
        error: "Too Many Requests",
        message: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000}s window.`,
        retryAfter: Math.ceil(windowMs / 1000),
        requestId: req.requestId,
      });
    },

    // Expose standard rate limit headers to partners
    standardHeaders: true, // RateLimit-* headers (RFC 6585)
    legacyHeaders: false,  // Disable X-RateLimit-* legacy headers

    // Skip successful responses from counting (optional — comment out to count all)
    // skipSuccessfulRequests: false,
  });

  limiterCache.set(cacheKey, limiter);
  return limiter;
};

/**
 * Middleware that dynamically selects the right rate limiter
 * based on the authenticated partner attached to req.partner.
 */
const rateLimiterMiddleware = (req, res, next) => {
  // authMiddleware must run before this
  if (!req.partner) {
    return res.status(500).json({ error: "Internal error: partner context missing" });
  }

  const limiter = getLimiterForPartner(req.partner);
  limiter(req, res, next);
};

module.exports = rateLimiterMiddleware;

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * PRODUCTION UPGRADE: Redis-backed distributed rate limiting
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * When running multiple gateway instances behind a load balancer, the
 * in-memory store above won't work — each instance has its own counters.
 *
 * Solution: Use ioredis + rate-limit-redis as the shared store:
 *
 *   const RedisStore = require('rate-limit-redis');
 *   const Redis = require('ioredis');
 *   const redisClient = new Redis({ host: process.env.REDIS_HOST });
 *
 *   const limiter = rateLimit({
 *     store: new RedisStore({
 *       sendCommand: (...args) => redisClient.call(...args),
 *       prefix: `rl:${partner.name}:`,
 *     }),
 *     windowMs,
 *     max: maxRequests,
 *     ...
 *   });
 *
 * This gives you atomic counters across all gateway replicas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
