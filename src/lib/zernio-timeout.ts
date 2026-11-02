// Pure helpers for Zernio request time limits. No app imports so unit tests
// can load this file directly.

/** Longer limit for creating a post: TikTok immediate publish can be slow. */
export const ZERNIO_CREATE_POST_TIMEOUT_MS = 60_000;

export const ZERNIO_TIMEOUT_ERROR_CODE = "zernio_timeout";

export const ZERNIO_TIMEOUT_MESSAGE =
  "Zernio did not answer before WaveOS's time limit. The post may still be processing. Wait a few minutes, then retry without changing or re-exporting the media.";

/** True for fetch aborts caused by AbortSignal.timeout (or a plain abort). */
export function isZernioTimeoutError(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const error = reason as { name?: unknown; code?: unknown; message?: unknown };
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  // DOMException TIMEOUT_ERR (23) / ABORT_ERR (20)
  if (error.code === 23 || error.code === 20) return true;
  return typeof error.message === "string" && /aborted due to timeout/i.test(error.message);
}

/** Stable application code and wording for a timed-out create-post request. */
export function normalizeZernioRequestError(reason: unknown): {
  code: string;
  message: string;
  details: unknown;
} {
  if (isZernioTimeoutError(reason))
    return { code: ZERNIO_TIMEOUT_ERROR_CODE, message: ZERNIO_TIMEOUT_MESSAGE, details: {} };
  const error = (reason ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  return {
    code: typeof error.code === "string" && error.code ? error.code : "zernio_request_failed",
    message:
      typeof error.message === "string" && error.message
        ? error.message
        : "Zernio request failed.",
    details: error.details ?? {},
  };
}
