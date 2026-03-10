/**
 * routes/proxyRoutes.js
 *
 * Proxy Route Handler
 *
 * Catches all /api/* requests that have passed authentication,
 * rate limiting, and access control. Translates the external
 * path to an upstream path and proxies the request.
 *
 * External:  GET /api/users/1       → Upstream: GET /users/1
 * External:  POST /api/posts        → Upstream: POST /posts
 * External:  DELETE /api/todos/5    → Upstream: DELETE /todos/5
 */

const { Router } = require("express");
const { forwardRequest, classifyUpstreamError } = require("../services/backendService");
const gatewayConfig = require("../config/gateway");
const { logger } = require("../utils/logger");

const router = Router();

/**
 * Translate an external gateway path to an upstream service path.
 *
 * Example: /api/users/1 → /users/1
 *
 * The route map allows for future flexibility — e.g., remapping
 * /api/accounts → /users if the upstream renames a service.
 */
const resolveUpstreamPath = (externalPath) => {
  for (const [gatewayPrefix, upstreamPrefix] of Object.entries(gatewayConfig.routeMap)) {
    if (externalPath.startsWith(gatewayPrefix)) {
      return externalPath.replace(gatewayPrefix, upstreamPrefix);
    }
  }
  return null; // No mapping found
};

/**
 * Universal proxy handler — handles all HTTP methods on all /api/* routes.
 *
 * Express wildcard `*` here catches: /api/users, /api/users/1,
 * /api/posts/1/comments, etc.
 */
router.all("/{*path}", async (req, res) => {
  const externalPath = req.path; // e.g., /api/users/1
  const upstreamPath = resolveUpstreamPath(externalPath);

  // Guard: route not in our gateway route map
  if (!upstreamPath) {
    return res.status(404).json({
      error: "Not Found",
      message: `No upstream mapping found for path: ${externalPath}`,
      requestId: req.requestId,
    });
  }

  // Store for logging middleware (req.on('finish') in requestLogger)
  req.upstreamUrl = `${gatewayConfig.upstreamBaseUrl}${upstreamPath}`;

  try {
    const { data, status, headers } = await forwardRequest({
      method: req.method,
      upstreamPath,
      query: req.query,
      body: req.body,
      requestId: req.requestId,
    });

    // Forward upstream headers (content-type, etc.) to the partner
    Object.entries(headers).forEach(([key, value]) => {
      if (value) res.setHeader(key, value);
    });

    // Attach gateway metadata headers
    res.setHeader("X-Gateway-Version", "1.0");
    res.setHeader("X-Partner", req.partner.name);

    return res.status(status).json(data);
  } catch (error) {
    const classified = classifyUpstreamError(error);

    // Attach error for logging middleware
    req.proxyError = error;

    logger.error("Upstream proxy error", {
      requestId: req.requestId,
      partner: req.partner?.name,
      upstreamUrl: req.upstreamUrl,
      errorType: classified.type,
      errorMessage: classified.message,
    });

    return res.status(classified.status).json({
      error: classified.type,
      message: classified.message,
      requestId: req.requestId,
      ...(classified.data && { upstream: classified.data }),
    });
  }
});

module.exports = router;