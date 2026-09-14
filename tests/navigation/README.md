# Project navigation regression

This standalone fixture imports the production navigation guard and runs a real
TanStack browser router. Notes and simulated saves live only in memory; it has
no account, database, provider, or production connection.

Run `npx playwright test --config tests/navigation/playwright.config.ts` after
installing dependencies and Playwright Chromium. The config starts its own
fixture server on port 5188; stop any manual fixture server first.

Coverage: links, programmatic navigation, Back/Forward, cancellation, explicit
discard, Escape, failed/successful synthetic saves, pristine and reverted drafts.
This does not verify database persistence, production role access, or the parent
project/tool switch controls. Refresh/tab-close warnings still need an interactive
browser check; browsers control when those native warnings appear.
