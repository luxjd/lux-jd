/**
 * Retry an async function with exponential backoff.
 *
 * @param {Function} fn - Async function to retry
 * @param {object} opts
 * @param {number} [opts.maxRetries=3] - Max retry attempts
 * @param {number} [opts.baseDelayMs=1000] - Initial delay in ms
 * @param {number} [opts.maxDelayMs=15000] - Max delay cap
 * @param {number} [opts.backoffFactor=2] - Multiplier per retry
 * @param {Function} [opts.shouldRetry] - fn(error, attempt) -> boolean. Default: retry on 429, 500, 502, 503, 529, network errors.
 * @param {string} [opts.label=""] - Label for logging
 * @returns {Promise<any>} - Result from fn
 */
export async function retryWithBackoff(fn, opts = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 15000,
    backoffFactor = 2,
    shouldRetry = defaultShouldRetry,
    label = "",
  } = opts;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries) {
        break;
      }

      if (!shouldRetry(error, attempt)) {
        throw error;
      }

      const delay = computeDelay(error, attempt, {
        baseDelayMs,
        maxDelayMs,
        backoffFactor,
      });

      console.log(
        `[retry] ${label} attempt ${attempt + 1}/${maxRetries} after ${delay}ms: ${error.message}`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Default predicate that decides whether an error is retryable.
 *
 * Retryable:
 *   - HTTP 429 (rate limit)
 *   - HTTP 500, 502, 503, 529 (server / overloaded)
 *   - Network errors (ECONNRESET, ETIMEDOUT, fetch failed, etc.)
 *
 * NOT retryable:
 *   - HTTP 400, 401, 403, 404, 422 (client errors)
 *   - Any other unrecognized error without a retryable signal
 */
function defaultShouldRetry(error) {
  const status = error.status ?? error.statusCode ?? error.response?.status;

  if (status !== undefined) {
    const retryableStatuses = new Set([429, 500, 502, 503, 529]);
    return retryableStatuses.has(status);
  }

  const msg = (error.message || "").toLowerCase();
  const code = (error.code || "").toUpperCase();

  const networkIndicators = [
    "econnreset",
    "etimedout",
    "econnrefused",
    "enotfound",
    "enetunreach",
    "epipe",
    "fetch failed",
    "network",
    "socket hang up",
    "abort",
  ];

  return networkIndicators.some(
    (indicator) => msg.includes(indicator) || code.includes(indicator.toUpperCase())
  );
}

/**
 * Compute the delay for a given attempt, respecting Retry-After on 429s.
 */
function computeDelay(error, attempt, { baseDelayMs, maxDelayMs, backoffFactor }) {
  // On 429, honour Retry-After header if present
  const status = error.status ?? error.statusCode ?? error.response?.status;
  if (status === 429) {
    const retryAfter = extractRetryAfter(error);
    if (retryAfter !== null) {
      // Cap it to maxDelayMs to avoid absurdly long waits
      return Math.min(retryAfter, maxDelayMs);
    }
  }

  // Exponential backoff with jitter: base * factor^attempt * (0.5 + rand*0.5)
  const jitter = 0.5 + Math.random() * 0.5;
  const raw = baseDelayMs * Math.pow(backoffFactor, attempt) * jitter;
  return Math.min(Math.round(raw), maxDelayMs);
}

/**
 * Try to extract a Retry-After value (in ms) from various error shapes.
 * Returns null if unavailable.
 */
function extractRetryAfter(error) {
  const headers =
    error.headers ?? error.response?.headers;

  if (!headers) return null;

  // headers may be a Headers object (with .get) or a plain object
  const raw = typeof headers.get === "function"
    ? headers.get("retry-after")
    : headers["retry-after"];

  if (raw == null) return null;

  const seconds = Number(raw);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000);
  }

  // Retry-After can also be an HTTP-date
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) {
    const ms = date - Date.now();
    return ms > 0 ? Math.ceil(ms) : 0;
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
