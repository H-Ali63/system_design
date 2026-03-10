/**
 * middleware/accessControl.js
 *
 * Route-Level Access Control Middleware (Authorization)
 *
 * Authentication (authMiddleware) confirms WHO the partner is.
 * Authorization (this middleware) confirms WHAT they can access.
 *
 * Checks the requested path against the partner's allowedRoutes list.
 * Must run AFTER authMiddleware (depends on req.partner being set).
 */

const { isRouteAllowed } = require("../config/partners");
const { logger } = require("../utils/logger");

const accessControlMiddleware = (req, res, next) => {
  // Guard: ensure auth ran first
  if (!req.partner) {
    return res.status(500).json({ error: "Internal error: partner context missing" });
  }

  // Check if the partner has permission to access this route
  if (!isRouteAllowed(req.partner, req.path)) {
    logger.warn("Access denied: route not permitted for partner", {
      requestId: req.requestId,
      partner: req.partner.name,
      path: req.path,
      allowedRoutes: req.partner.allowedRoutes,
    });

    return res.status(403).json({
      error: "Forbidden",
      message: `Your partner account does not have access to ${req.path}`,
      allowedRoutes: req.partner.allowedRoutes,
      requestId: req.requestId,
    });
  }

  next();
};

module.exports = accessControlMiddleware;
