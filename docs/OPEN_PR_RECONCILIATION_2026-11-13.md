# Open pull request reconciliation — November 13, 2026

Review against current main. No merge, deployment, database change, billing change or live-client mutation is included. Existing branches remain recoverable. Closing a PR does not delete its branch.

| PR | Evidence and disposition |
| --- | --- |
| 171 | Superseded. Both invoice/catalog picker files match current main exactly. Current navigation already has Personal, Business, OS, Services & Pricing and wrapping labels; invoice steps have been further simplified. Preserve current implementation and close old PR. |
| 208 | Keep open pending full residual review. Core analytics transparency, trend model, Content and Trending pages match current main exactly. Several commits are patch-equivalent. Main also contains newer campaign, transcript, review and provider work. Do not replace current files with this older branch. |
| 209 | Keep for visual decision. MobileClassicHome is already present; remaining color differences exist. Global phone theme overrides could conflict with current branding. Do not apply automatically. |
| 212 | Keep for a corrected, tested citation fix. Proposed identity code contains overescaped regular expressions, drops all query parameters (which can distinguish different pages), and does not use its new identity consistently for website/channel validation. Porting verbatim is inappropriate. |
| 215 | Keep for isolated background-crop repair. Current replacement targeting exists; proposed dimension-aware crop calculation is still different. Requires portrait/landscape, overlay preservation, undo and export verification. |
| 221 | Keep; split before implementation. Promo editor already has current implementation, but 90-day migration is missing. Branch also changes publishing order and status mapping, beyond its stated promo scope. Current publishing order has newer review-related handling. Preserve active redemptions and billing; validate any future migration independently. |
| 223 | Keep as reference for saved-history work. Actual branch includes session-storage helpers, cloud endpoint scaffolding, lockfile and CI changes—not just the eight-to-forty message change in its description. Cloud code explicitly requires agent_conversations and policies before UI wiring. Do not merge this bundle or assume durable history works. |
| 227 | Carry its exact eleven-line phone-modal CSS repair onto current main in this replacement review branch. No OAuth, data or permission changes. Close original only after replacement PR exists. Physical iPhone verification remains outstanding; this does not fix Google authentication. |

## Validation and release boundaries

Thirteen focused existing access, mobile, dashboard and review checks passed before the port. Full typecheck/build/unit validation is recorded in the replacement PR. CSS is phone-only; real iPhone scroll/header, safe-area, keyboard, and Google Picker interaction remain manual preview gates. No live-app regression guarantee is inferred from unit tests.

Saved My Agent history continues as a separate phase after reconciliation, with private user/workspace boundaries and cross-device conflict/recovery tests. No new Lovable prompts are used for this pass.
