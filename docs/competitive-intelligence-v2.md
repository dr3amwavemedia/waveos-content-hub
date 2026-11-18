# Competitive Intelligence v2 requirements

## Product outcome

Competitive Intelligence should tell a user, quickly and visually, how their company compares with selected competitors, what each brand appears to do well or poorly in reviewed public evidence, and what the user should do next. It should also produce a deeper, marketer-ready B2B analysis that demonstrates the power of WaveOS without overstating what public research can prove.

## Visual dashboard

The default experience is an executive scorecard rather than a long text report.

- Show the user's company and selected competitors together, with clear colors, logos when verified, research freshness and evidence coverage.
- Lead with an overall assessment, category score cards, comparison bars or radar visualization, category leaders and the largest gaps.
- Follow with **What you do well**, **What needs work**, **What competitors do well**, **Where competitors are weak**, **Open opportunities** and **Recommended next actions**.
- Keep detailed findings and citations available progressively instead of placing every paragraph on the first screen.
- Provide clear empty, stale, low-confidence, conflicting-source and blocked-source states.
- Make the important comparisons readable on phone and desktop without dense tables or technical-looking controls.

## Evidence-based score model

Each category may receive a 0–100 **WaveOS assessment score** only when its published rubric has enough evidence. Every score must show its evidence coverage, confidence, source count and “researched at” time.

Initial categories:

| Category | What the score may assess from supported evidence |
| --- | --- |
| Brand Visibility | Discoverability and consistency across the official site, indexed profiles, listings and supported channels. |
| Brand Recognition Signals | Observable identity consistency, branded search presence, reputation footprint and public recognition signals—not measured consumer awareness. |
| Messaging Clarity | Clarity and consistency of audience, problem, offer, value proposition and calls to action. |
| Differentiation | Evidence that the brand communicates distinctive positioning, proof, specialties or experience. |
| Content & Social Presence | Accessible channel coverage, recency, consistency, format variety and message alignment; no invented private engagement. |
| Website & SEO | Accessible technical/content signals, search presentation, local discoverability, structured information and landing-path clarity. |
| Reputation & Trust | Accessible reviews, testimonials, credentials, proof, policies and trust signals, with source and sample limitations. |
| Conversion Readiness | Observable next steps, contact/booking paths, offer clarity, friction and continuity from discovery to action. |

The overall score is a documented weighted calculation of eligible category scores. Missing categories remain **Not enough evidence** and do not silently become zero. Comparisons should use the same rubric and comparable research window. A score must be reproducible from stored rubric inputs and evidence; the language model must not invent a percentage directly.

## Research and company portfolios

- Accept a company name, official domain, Google listing or public social URL as the starting identity clue.
- Discover other attributable public sources across the open web and accessible public social/indexed pages.
- Never bypass authentication, privacy controls, robots restrictions, rate limits or anti-bot protections.
- Allow users to add multiple URLs for each business, including official sites, location pages, Google/Maps listings, Instagram, Facebook, LinkedIn, TikTok, YouTube, review profiles, directories, press and other relevant public sources.
- Resolve redirects, classify official versus supporting sources, deduplicate URLs and guard against mixing similarly named businesses.
- Display a source portfolio with accessed, partially accessible, blocked, stale, conflicting and not-found states.
- Preserve citations at the claim and scoring-criterion level. Unsupported conclusions are omitted or labeled as hypotheses requiring validation.
- Optionally combine connected first-party analytics for the user's own company with public evidence, but label the two data types separately and never imply equivalent competitor access.

## Deeper B2B intelligence

The B2B experience should be useful to agencies, in-house marketers and WaveOS product demonstrations. It must go beyond a generic two-column summary.

Include, when supported:

- executive summary and category landscape;
- company, market and audience profiles;
- positioning, messaging and value-proposition comparison;
- offer/service portfolio, pricing visibility and proof points;
- channel, content-format and editorial-theme analysis;
- website, SEO, local presence and discoverability;
- reviews, reputation and trust signals;
- acquisition and observable conversion journey;
- differentiators, parity areas, whitespace and competitive risks;
- evidence-backed content and campaign opportunities;
- prioritized quick wins and 30/60/90-day recommendations;
- an appendix of claims, sources, access limitations and research freshness.

Provide a polished marketer view and a share/export view suitable for an authorized client presentation or WaveOS demonstration. Shared output must contain only selected public findings and approved workspace context; it must never expose private notes, analytics, other clients or internal prompts.

## My Agent handoff

Every supported finding should offer relevant operating actions, such as:

- **Investigate this gap**
- **Create a campaign**
- **Create content**
- **Open in Creative Studio**
- **Prepare a post**
- **Save to client report**

The selected company, competitor, evidence, campaign and client context should carry into My Agent. These actions can create reviewable drafts immediately. Publishing, sending or externally sharing still requires a clear preview and explicit confirmation.

## Current-state gap confirmed November 9, 2026

- The current automated report schema is primarily qualitative sections, findings, ideas and citations; it does not produce category scorecards.
- The existing percentage calculation applies only to manually entered comparison metrics and is not the automated research dashboard requested here.
- The current overview emphasizes tracked-competitor counts and text cards rather than a visual company-versus-competitor performance view.
- The current B2B/independent comparison is a cited side-by-side qualitative report without a deep marketer scorecard or 30/60/90-day plan.
- The research prompt already instructs the provider to treat the initial URL as an identity clue and continue through other accessible public sources. The missing product behavior is a visible multi-source company portfolio, source coverage controls, structured scoring and a richer report experience.

This version must be implemented and validated before it is described as the live Competitive Intelligence experience.
