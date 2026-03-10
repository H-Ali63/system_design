/**
 * routes/adminRoutes.js
 *
 * Health Check & Admin Endpoints
 *
 * These endpoints are NOT protected by partner authentication —
 * they're intended for internal use (load balancers, monitoring).
 *
 * In production, /admin/* would be IP-restricted or use a separate
 * internal auth mechanism (mTLS, internal JWT, etc.).
 */

const { Router } = require("express");
const { PARTNERS } = require("../config/partners");
const gatewayConfig = require("../config/gateway");

const router = Router();

/**
 * GET /health
 *
 * Simple liveness probe for load balancers and container orchestrators.
 * Returns 200 if the gateway process is alive.
 */
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "api-gateway",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

/**
 * GET /health/upstream
 *
 * Readiness probe — checks connectivity to the upstream service.
 * Returns 200 only if upstream is reachable.
 */
router.get("/health/upstream", async (req, res) => {
  const axios = require("axios");
  try {
    await axios.get(`${gatewayConfig.upstreamBaseUrl}/users/1`, { timeout: 3000 });
    res.status(200).json({ status: "ok", upstream: gatewayConfig.upstreamBaseUrl });
  } catch {
    res.status(503).json({ status: "degraded", upstream: gatewayConfig.upstreamBaseUrl });
  }
});

/**
 * GET /admin/partners
 *
 * Returns a summary of registered partners (no secret keys exposed).
 * Useful for ops dashboards and debugging.
 */
router.get("/admin/partners", (req, res) => {
  const summary = Object.values(PARTNERS).map((p) => ({
    name: p.name,
    active: p.active,
    allowedRoutes: p.allowedRoutes,
    rateLimit: p.rateLimit,
    // NEVER expose the real apiKey here
    apiKeyHint: `${p.apiKey.substring(0, 8)}...`,
  }));

  res.json({ partners: summary, total: summary.length });
});

module.exports = router;
