import { getRequest } from "@tanstack/react-start/server";
import { publicHttpsOrigin } from "@/lib/public-provider-origin";

/** Provider callbacks must return to an address the client's browser can open. */
export function providerReturnOrigin(): string {
  const configured = process.env.WAVEOS_PUBLIC_RETURN_URL?.trim();
  if (configured) {
    const origin = publicHttpsOrigin(configured);
    if (!origin) {
      throw new Error("WAVEOS_PUBLIC_RETURN_URL must be a public HTTPS site origin.");
    }
    return origin;
  }

  const requestOrigin = new URL(getRequest().url).origin;
  const origin = publicHttpsOrigin(requestOrigin);
  if (!origin) {
    throw new Error(
      "Provider return URL is local. Set WAVEOS_PUBLIC_RETURN_URL to the published staging WaveOS address before testing checkout or signing.",
    );
  }
  return origin;
}
