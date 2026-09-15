# Provider return URL for staging

Add `WAVEOS_PUBLIC_RETURN_URL` as a user-managed secure server setting in Lovable. Its value must be the public HTTPS **origin** of the staging WaveOS app, such as `https://your-staging-domain.example` (no path or query). The staging app must use the same test backend as the Stripe and SignWell webhook endpoints.

Stripe and SignWell will send the client's browser back to this address after payment or signing. Preview requests can report `https://localhost:8080`; that address is unavailable to the client browser once it leaves Lovable. The server now rejects a local return URL before creating a new Checkout session or SignWell document.

Before trying Pay again, inspect the earlier Stripe Checkout session and the invoice ledger. A payment may have succeeded even though the return page failed. Create a fresh fake test invoice only after confirming that the earlier one was not paid. Previously created provider sessions and documents keep their old return URLs.
