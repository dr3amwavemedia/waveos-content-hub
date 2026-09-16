/**
 * Public return origin for provider redirects (Stripe Checkout, SignWell).
 *
 * Provider return URLs must never be derived from the incoming request: inside
 * the Lovable preview that yields https://localhost:8080, which is unreachable
 * once the browser has left for the provider. The owner therefore configures a
 * single server setting, WAVEOS_PUBLIC_RETURN_URL, holding the public HTTPS
 * origin of the deployed app (scheme + host only).
 */

const PRIVATE_HOST =
  /^(localhost|127\.|0\.0\.0\.0$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$)/i;

export class ReturnOriginError extends Error {}

/**
 * Validated public origin, e.g. "https://waveos.dreamwavemedia.co".
 * Throws a message safe to show staff (never contains secrets).
 */
export function publicReturnOrigin(): string {
  const raw = (process.env['WAVEOS_PUBLIC_RETURN_URL'] ?? '').trim();
  if (!raw) {
    throw new ReturnOriginError(
      'The public return address is not configured yet. Save WAVEOS_PUBLIC_RETURN_URL (the public https address of this app) before starting a payment or signing request.',
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ReturnOriginError(
      'The saved public return address is not a valid web address. It must look like https://example.com with no path.',
    );
  }

  if (url.protocol !== 'https:') {
    throw new ReturnOriginError('The public return address must start with https://.');
  }
  if (url.username || url.password) {
    throw new ReturnOriginError('The public return address must not contain a username or password.');
  }
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new ReturnOriginError(
      'The public return address must be the bare site address only — no path, query or fragment.',
    );
  }
  if (PRIVATE_HOST.test(url.hostname) || url.hostname.endsWith('.local')) {
    throw new ReturnOriginError(
      'The public return address points at a local or private address, which a browser cannot reach after leaving the payment or signing page.',
    );
  }

  return url.origin;
}

/** Same validation, but returns null instead of throwing (for status screens). */
export function publicReturnOriginStatus(): { origin: string | null; problem: string | null } {
  try {
    return { origin: publicReturnOrigin(), problem: null };
  } catch (error) {
    return { origin: null, problem: error instanceof Error ? error.message : 'Not configured.' };
  }
}
