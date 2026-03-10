/**
 * utils/logger.js
 *
 * Structured logger using Winston.
 * Outputs JSON in production for easy ingestion into
 * log aggregation systems (Datadog, CloudWatch, ELK stack).
 * Outputs human-readable colored logs in development.
 */

const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize, json, errors } = format;

const isDev = process.env.NODE_ENV !== "production";

// Human-readable format for local development
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? `\n  ${JSON.stringify(meta, null, 2)}`
      : "";
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

// Structured JSON format for production (ship to log aggregator)
const prodFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: isDev ? devFormat : prodFormat,
  transports: [
    new transports.Console(),
    // In production, add file or external transports:
    // new transports.File({ filename: 'logs/error.log', level: 'error' }),
    // new transports.File({ filename: 'logs/combined.log' }),
  ],
});

/**
 * Log a completed API request with all relevant context.
 * Called at the end of every request by the logging middleware.
 */
const logRequest = ({
  requestId,
  partner,
  method,
  path,
  statusCode,
  durationMs,
  upstreamUrl,
  error,
}) => {
  const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

  logger[level]("API Request", {
    requestId,
    partner,
    method,
    path,
    statusCode,
    durationMs: `${durationMs}ms`,
    upstreamUrl,
    ...(error && { error: error.message }),
  });
};

module.exports = { logger, logRequest };
