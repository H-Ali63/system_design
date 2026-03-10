/**
 * config/partners.js
 *
 * Central registry of all external partners.
 * In production, this would live in a database (PostgreSQL/DynamoDB)
 * with an admin UI for managing partner configurations.
 *
 * Schema per partner:
 *   name          - Human-readable partner name
 *   apiKey        - Secret key sent in x-api-key header
 *   allowedRoutes - Array of route prefixes this partner can access
 *   rateLimit     - Max requests per windowMs
 *   windowMs      - Rate limit window in milliseconds
 *   active        - Whether this partner is currently enabled
 */

const PARTNERS = {
  // Partner A: Full-service partner — can access users and posts
  "partner-a-key-abc123": {
    name: "PartnerA",
    apiKey: "partner-a-key-abc123",
    allowedRoutes: ["/api/users", "/api/posts", "/api/comments"],
    rateLimit: {
      maxRequests: 100,
      windowMs: 60 * 1000, // 1 minute
    },
    active: true,
  },

  // Partner B: Limited partner — todos only
  "partner-b-key-def456": {
    name: "PartnerB",
    apiKey: "partner-b-key-def456",
    allowedRoutes: ["/api/todos"],
    rateLimit: {
      maxRequests: 50,
      windowMs: 60 * 1000, // 1 minute
    },
    active: true,
  },

  // Partner C: Media partner — albums and photos
  "partner-c-key-ghi789": {
    name: "PartnerC",
    apiKey: "partner-c-key-ghi789",
    allowedRoutes: ["/api/albums", "/api/photos"],
    rateLimit: {
      maxRequests: 200,
      windowMs: 60 * 1000, // 1 minute
    },
    active: true,
  },

  // Partner D: Inactive/suspended partner
  "partner-d-key-jkl000": {
    name: "PartnerD",
    apiKey: "partner-d-key-jkl000",
    allowedRoutes: ["/api/users"],
    rateLimit: {
      maxRequests: 100,
      windowMs: 60 * 1000,
    },
    active: false, // Suspended — will be rejected at auth layer
  },
};

/**
 * Look up a partner by their API key.
 * Returns the partner object or null if not found.
 */
const getPartnerByApiKey = (apiKey) => {
  return PARTNERS[apiKey] || null;
};

/**
 * Check if a partner has access to a given route prefix.
 * Uses startsWith so /api/users/1 matches /api/users permission.
 */
const isRouteAllowed = (partner, requestPath) => {
  return partner.allowedRoutes.some((allowedRoute) =>
    requestPath.startsWith(allowedRoute)
  );
};

module.exports = { PARTNERS, getPartnerByApiKey, isRouteAllowed };
