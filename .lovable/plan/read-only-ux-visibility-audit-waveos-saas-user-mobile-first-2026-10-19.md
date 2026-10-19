# Read-only UX visibility audit (WaveOS SaaS user, mobile-first)

No code, data, settings or publishing changes. The only output is a written report.

## Steps
1. Sign the preview in as an eligible WaveOS SaaS (os_data) user. If several accounts exist, ask which one to use. Also sign in once as the owner to compare what admins see.
2. Phone width (430x932), then desktop (1280 wide). Capture screenshots of:
   - First login: the "New Update" box (is it clear, can it be closed with X or by tapping outside, does it stay closed after a refresh)
   - Home / Overview, bottom bar, center Create sheet, More menu groups
   - Create Post, Calendar, Creative Studio (Templates panel), Trending Now, Brand Voice, Analytics, Campaign Manager, Payments/Invoices where shown
   - Locked or plan-gated screens and their explanations
   - Empty states (no posts, no connected accounts, no campaigns)
3. On each screen, measure tap target sizes, whether text wraps or gets cut off, how far you have to scroll to reach the main action, and whether anything sits under the header or bottom bar.
4. Compare the menu items an ordinary user sees with the owner's menu to spot admin or business items an ordinary user shouldn't see.
5. Check the code only to label each feature as working, partly working (for example, no saving or no live data), or planned only.

## Report format
- Evidence for each area listed in the request, with screenshots described
- Problems ranked High / Medium / Low, each naming the screen or part of the app involved
- Scores from 1 to 10 for: discoverability, navigation clarity, mobile usability, visual hierarchy, first-time experience, overall UX
- A clear split between what works now and what is only planned

## Technical notes
- Browser checks run against the local preview with a minted session. The "seen" mark the update box saves is the app's normal behavior. To avoid even that write, I'll check the update box with an account that has already seen it, or ask before showing it to a fresh account.
