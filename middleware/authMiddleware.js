/**
 * middleware/authMiddleware.js
 *
 * API Key Authentication Middleware
 *
 * Responsibilities:
 *  1. Extract x-api-key header from incoming request
 *  2. Validate key exists in partner registry
 *  3. Check partner account is active (not suspended)
 *  4. Attach partner object to req for downstream middleware
 *
 * On failure: returns 401 Unauthorized or 403 Forbidden
 * On success: calls next() and sets req.partner
 */

const { getPartnerByApiKey } = require("../config/partners");
const { logger } = require("../utils/logger");

const authMiddleware = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  // ── Step 1: Check header presence ──────────────────────────────────────────
  if (!apiKey) {
    logger.warn("Auth failed: missing x-api-key header", {
      requestId: req.requestId,
      ip: req.ip,
      path: req.path,
    });

    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing required header: x-api-key",
      requestId: req.requestId,
    });
  }

  // ── Step 2: Look up partner by API key ─────────────────────────────────────
  const partner = getPartnerByApiKey(apiKey);

  if (!partner) {
    logger.warn("Auth failed: invalid API key", {
      requestId: req.requestId,
      ip: req.ip,
      path: req.path,
      // Never log the actual key in full — only a hint for debugging
      keyHint: `${apiKey.substring(0, 8)}...`,
    });

    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid API key",
      requestId: req.requestId,
    });
  }

  // ── Step 3: Check partner is active ────────────────────────────────────────
  if (!partner.active) {
    logger.warn("Auth failed: partner account suspended", {
      requestId: req.requestId,
      partner: partner.name,
      path: req.path,
    });

    return res.status(403).json({
      error: "Forbidden",
      message: "Partner account is suspended. Contact support.",
      requestId: req.requestId,
    });
  }

  // ── Step 4: Attach partner context to request ──────────────────────────────
  req.partner = partner;

  logger.info("Auth success", {
    requestId: req.requestId,
    partner: partner.name,
    path: req.path,
  });

  next();
};

module.exports = authMiddleware;
