from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, Image, ListFlowable, ListItem
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "WaveOS_App_Team_Handbook_2026-10-07.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#06111f")
SURFACE = colors.HexColor("#0d2235")
CYAN = colors.HexColor("#22d3ee")
BLUE = colors.HexColor("#38bdf8")
MINT = colors.HexColor("#5eead4")
SLATE = colors.HexColor("#475569")
LIGHT = colors.HexColor("#e6f6ff")
PALE = colors.HexColor("#eefaff")
ROSE = colors.HexColor("#e11d48")
AMBER = colors.HexColor("#d97706")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=29, leading=33, textColor=colors.white, alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="CoverSub", parent=styles["Normal"], fontName="Helvetica", fontSize=12, leading=18, textColor=LIGHT, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=21, leading=25, textColor=NAVY, spaceAfter=12))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=colors.HexColor("#0369a1"), spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13.2, textColor=colors.HexColor("#172033"), spaceAfter=6))
styles.add(ParagraphStyle(name="Smallx", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.8, leading=10.6, textColor=SLATE))
styles.add(ParagraphStyle(name="Callout", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=NAVY, backColor=colors.HexColor("#dff8ff"), borderColor=CYAN, borderWidth=0.7, borderPadding=9, spaceBefore=7, spaceAfter=9))
styles.add(ParagraphStyle(name="TableHead", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white, alignment=TA_LEFT))
styles.add(ParagraphStyle(name="TableBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.6, leading=10, textColor=NAVY))

def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])

def bullets(items):
    return ListFlowable([ListItem(P(item), leftIndent=10) for item in items], bulletType="bullet", leftIndent=16, bulletFontSize=6, spaceAfter=6)

def table(headers, rows, widths=None):
    data = [[P(h, "TableHead") for h in headers]] + [[P(str(v), "TableBody") for v in row] for row in rows]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#075985")),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, PALE]),
        ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#bae6fd")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    return t

def section(title, body=None):
    out = [P(title, "H1x")]
    if body: out.append(P(body))
    return out

def page_number(canvas, doc):
    canvas.saveState()
    if doc.page == 1:
        canvas.setFillColor(NAVY); canvas.rect(0,0,letter[0],letter[1],fill=1,stroke=0)
    else:
        canvas.setStrokeColor(colors.HexColor("#c8edf8")); canvas.line(0.65*inch,0.48*inch,7.85*inch,0.48*inch)
        canvas.setFont("Helvetica", 7.5); canvas.setFillColor(SLATE)
        canvas.drawString(0.65*inch,0.28*inch,"WaveOS • Internal owner & app-team handbook • 2026-10-07")
        canvas.drawRightString(7.85*inch,0.28*inch,f"Page {doc.page}")
    canvas.restoreState()

story = []
story += [Spacer(1,0.85*inch), P("WaveOS", "CoverTitle"), P("OWNER & APP-TEAM HANDBOOK", "CoverTitle"),
          P("How the product works, what is live, and how to operate it safely", "CoverSub"), Spacer(1,0.28*inch)]
flyer = ROOT / "output" / "flyer" / "waveos-subscriptions-flyer.png"
if flyer.exists(): story.append(Image(str(flyer), width=3.15*inch, height=4.08*inch))
story += [Spacer(1,0.22*inch), P("Release reference: October 7, 2026", "CoverSub"),
          P("Production: waveos.dreamwavemedia.co • Repository: dr3amwavemedia/waveos-content-hub", "CoverSub"), PageBreak()]

story += section("1. Executive summary", "WaveOS combines a Dream Wave Media client portal with a public subscription product. The public app is separated as OS Data; Dream Wave client workspaces remain Client Data. Stripe owns payment collection and invoices, while Zernio supplies isolated social-account connections and publishing for each workspace.")
story += [P("Current release status", "H2x"), bullets([
    "Three public plans are configured: Ripple, Current, and Tidal.",
    "Monthly and annual Stripe Checkout sessions use subscription mode. Monthly means the same calendar date each month—not a fixed 30-day timer.",
    "Stripe webhook events save subscription status, renewal dates, payment failures, and a rolling invoice history inside each account.",
    "Current and Tidal include Generative AI Assist and scheduling. Ripple blocks both scheduling and AI Assist.",
    "Camera-roll uploads are temporary and are deleted only after every selected Zernio destination confirms success.",
    "Google Drive and Dropbox references can coexist with local files in WaveOS folders without duplicating the originals.",
    "Owner-only OS Data includes public accounts, promo trials, account caps, lifecycle status, and an emergency publishing pause.",
])]
story += [P("What this handbook does not claim", "H2x"), P("A code audit can verify recurring configuration, webhook handling, access controls, and invoice persistence. It cannot make one real monthly renewal happen in minutes. The first live renewal must be checked in Stripe after the actual anniversary date. Cross-platform social publishing also requires real connected accounts and platform approval.")]
story.append(PageBreak())

story += section("2. Subscription catalog")
story.append(table(["Plan", "Monthly", "Annual", "Accounts", "Access"], [
    ["Ripple", "$39.99", "$479.88 (no discount)", "3", "Create/publish, analytics, media library, Post now. No AI Assist or scheduling."],
    ["Current", "$69.99", "$797.89 (5% off $839.88)", "4", "Ripple features + Generative AI Assist + Post later scheduling."],
    ["Tidal", "$119.99", "$1,295.89 (10% off $1,439.88)", "8", "Current features + higher account capacity for growing teams."],
], [0.82*inch,0.72*inch,1.25*inch,0.62*inch,3.5*inch]))
story += [P("Account-limit behavior", "H2x"), P("When the plan cap is full, connected accounts remain green. Every unconnected platform turns rose/red, says “Limit reached,” and its Connect button is disabled. Users are told to disconnect an account or upgrade in Settings. The server independently rechecks the cap, so a browser cannot bypass it."),
          P("Plan names and labels", "H2x"), P("Internal IDs remain <b>standard</b>, <b>full</b>, and <b>expanded</b> for database compatibility. User-facing and OS Data labels are <b>Ripple</b>, <b>Current</b>, and <b>Tidal</b>.")]
story.append(PageBreak())

story += section("3. Billing, Stripe, and invoices")
story += [P("Checkout and renewal", "H2x"), bullets([
    "Checkout uses Stripe mode=subscription and recurring interval=month or year.",
    "A card is collected through Stripe Checkout; card data never enters WaveOS.",
    "Successful Checkout and Stripe subscription events attach the customer and subscription IDs to the exact workspace.",
    "invoice.paid restores access and clears payment-failure locks. invoice.payment_failed records the attempt and may lock service after the configured threshold.",
    "Each Stripe invoice is upserted by Stripe invoice ID with status, amount, billing period, hosted invoice link, and PDF link.",
    "Settings keeps invoices inside a collapsed Billing history control instead of a long page.",
])]
story += [P("Conservative fee estimate for U.S. domestic cards", "H2x"), P("Stripe’s public U.S. standard card price is 2.9% + $0.30 per successful charge. Stripe Billing pay-as-you-go is listed as an additional 0.7% of Billing volume. The second number below is the conservative combined estimate (3.6% + $0.30); the actual Dashboard fee depends on your Stripe contract and payment method.")]
story.append(table(["Charge", "Card processing only", "With 0.7% Billing estimate", "Estimated net after both"], [
    ["Ripple monthly $39.99", "$1.46", "$1.74", "$38.25"],
    ["Current monthly $69.99", "$2.33", "$2.82", "$67.17"],
    ["Tidal monthly $119.99", "$3.78", "$4.62", "$115.37"],
    ["Ripple annual $479.88", "$14.22", "$17.58", "$462.30"],
    ["Current annual $797.89", "$23.44", "$29.02", "$768.87"],
    ["Tidal annual $1,295.89", "$37.88", "$46.95", "$1,248.94"],
], [1.65*inch,1.35*inch,1.65*inch,1.55*inch]))
story += [P("Live renewal audit checklist", "H2x"), bullets([
    "In Stripe live mode, confirm the subscription is Active or Trialing and the next invoice date matches the calendar anniversary.",
    "Confirm the webhook endpoint received checkout.session.completed, customer.subscription.*, invoice.paid, and invoice.payment_failed events.",
    "After the first real renewal, confirm the newest invoice appears in the WaveOS Billing history and current_period_end advanced.",
    "Never use a $1 one-time payment as proof of recurring renewal; it proves only that live payment collection works.",
])]
story.append(PageBreak())

story += section("4. Sign-up, access, and reactivation")
story += [P("Public WaveOS journey", "H2x"), P("A new public user selects a plan, creates an account, receives an isolated OS Data workspace, and completes Stripe Checkout. Subscription gates remain locked until Stripe confirms eligible access."),
          P("Failed payment / cancellation", "H2x"), bullets([
              "Access locks immediately when the subscription reaches the configured locked or terminal condition.",
              "The workspace enters a 7-day grace queue. If payment succeeds, the lifecycle returns to active automatically.",
              "If unresolved after 7 days, WaveOS disconnects each Zernio account and clears local provider references so connection charges stop.",
              "The account, invoices, and workspace are retained for six months. During retention, the user can sign in, update Stripe billing, and reconnect without creating a new app account.",
              "After six months of unresolved inactivity, the workspace is archived. This release deliberately archives rather than silently hard-deleting financial records.",
          ]),
          P("Zernio test connections", "H2x"), P("Zernio does not expose a guaranteed free ‘test’ flag through this integration. Their public pricing uses connected accounts, with the first two free and additional accounts charged on a graduated, daily-prorated basis. Use no more than the free allowance when possible. After testing, disconnect every test account immediately. A future message such as ‘all done with test’ can be used as an instruction to perform that cleanup, but WaveOS cannot promise Zernio will waive already accrued prorated charges.")]
story.append(PageBreak())

story += section("5. Social publishing workflow")
story.append(table(["Step", "What WaveOS does", "Safety rule"], [
    ["Draft", "Saves caption, platforms, media references, and per-platform variants.", "Ripple may draft and Post now but cannot schedule ahead."],
    ["AI Assist", "Proposes Brand Voice caption replacements after confirmation.", "Available only to Current and Tidal; primary/selected captions are not overwritten silently."],
    ["Post now", "Creates one idempotent Zernio attempt per platform.", "Workspace profile and connected account are resolved server-side."],
    ["Post later", "Stores a scheduled timestamp and the five-minute publisher sends it when due.", "Current/Tidal only; Ripple button stays locked."],
    ["Confirmation", "Webhook/status refresh marks success or failure and stores the platform URL.", "Temporary local media is deleted only when every destination succeeds."],
    ["Stale attempt", "After 30 minutes, maintenance asks Zernio for status if a provider ID exists.", "No blind retry without a provider ID; WaveOS marks failed to prevent duplicate posts."],
], [0.82*inch,3.1*inch,2.65*inch]))
story += [P("Emergency operations", "H2x"), P("The Dream Wave owner can pause all publishing from OS Data. The pause is enforced on the server for both immediate and scheduled posts. Resuming is also audited. This is the quickest response if Zernio or a social platform begins behaving unexpectedly.")]
story.append(PageBreak())

story += section("6. Media and storage")
story += [P("Three supported source types", "H2x"), bullets([
    "Local / phone camera roll: the browser’s native file picker opens the phone’s Photos/Files choices. No separate camera-roll API is required.",
    "Google Drive: WaveOS stores an authorized reference and streams the source when needed; the original stays in the user’s Drive.",
    "Dropbox: same reference-first model; the original stays in Dropbox.",
]), P("Current limits", "H2x"), table(["Limit", "Value", "User experience"], [
    ["Single local file", "300 MB", "Oversized selection is rejected with a friendly message."],
    ["Workspace local storage", "500 MB", "Warning begins at 400 MB; saving is blocked before exceeding the cap."],
    ["Project-wide local storage", "1.5 GB", "Protects the Lovable/Supabase allocation from one tenant consuming all storage."],
], [1.6*inch,1.1*inch,3.9*inch]),
          P("Quality", "H2x"), P("WaveOS does not intentionally compress the selected source before Zernio receives it. Each social network may transcode or compress media after upload according to its own platform rules. Files must still meet the destination’s supported type, duration, resolution, and size limits."),
          P("Folders", "H2x"), P("A WaveOS folder can contain local assets plus Google Drive and Dropbox references. This creates one organizational view without copying every cloud file into WaveOS storage.")]
story.append(PageBreak())

story += section("7. App map")
story.append(table(["Area", "Purpose", "Who sees it"], [
    ["Overview", "Workspace status, useful summaries, weekly publishing goal.", "Members according to workspace permissions."],
    ["Create Post", "Caption, Brand Voice, media, platforms, Post now/Post later.", "Authorized social users; feature-gated by plan."],
    ["Social Media", "Connections, publishing history, analytics, inbox signals.", "Social-enabled subscriptions/retainers."],
    ["Media Library", "Local, Drive, and Dropbox assets organized into folders.", "Authorized workspace members."],
    ["Calendar", "Scheduled content and strategy planning.", "Current/Tidal or entitled Dream Wave clients."],
    ["Brand Voice", "Tone/profile used by Generative AI Assist.", "Current/Tidal or entitled clients."],
    ["Settings / Your Information", "Profile, branding, billing history, connections, team access.", "Workspace owners/admins; one-time Dream Wave projects have team/storage controls blocked."],
    ["OS Data", "Public user support, plans, promo trials, lifecycle queue, emergency pause.", "Dream Wave owner only."],
    ["Client portal", "Approvals, Deliveries, Invoices & Payments, information, requests.", "Dream Wave clients according to their service tier."],
], [1.18*inch,3.35*inch,2.15*inch]))
story.append(PageBreak())

story += section("8. Mobile, accessibility, and browser support")
story += [P("Target devices", "H2x"), P("The app is a responsive web app intended for current Safari on iPhone/iPad/macOS and current Chrome-based browsers on Android, Google Pixel, Samsung Internet/Chrome, Windows, and macOS. Native file inputs hand control to each operating system’s supported photo/file picker."),
          P("Release checks", "H2x"), bullets([
              "Minimum 44px touch targets for primary actions and no hover-only critical controls.",
              "Responsive single-column stacking for narrow phones and multi-column layouts for tablets/desktops.",
              "Keyboard focus, labels, disabled-state semantics, readable contrast, and status text in addition to color.",
              "Session refresh and resume behavior for iOS home-screen mode and suspended mobile tabs.",
              "Popup fallback: if a browser blocks the Zernio connection popup, WaveOS navigates in the same tab.",
          ]), P("Known limitation", "Callout"), P("No web app can guarantee every social network’s native behavior on every OS version. Release testing should include at least one real iPhone Safari, iPad Safari, Pixel Chrome, and Samsung Chrome/Internet device whenever publishing or file selection changes.")]
story.append(PageBreak())

story += section("9. Security, reliability, and data boundaries")
story += [bullets([
    "Supabase Row Level Security protects public tables. New operations tables are service-role-only.",
    "OS Data and Client Data are explicitly separated; public subscription webhooks refuse to mutate Dream Wave client workspaces.",
    "Zernio and Stripe secrets remain server-side. Browser responses never reveal API keys.",
    "Publishing uses workspace-scoped Zernio profiles and server-resolved accounts, preventing cross-client selection.",
    "Idempotency keys use content item + platform to reduce duplicate posts.",
    "Security headers now include nosniff, strict referrer policy, DENY framing, a Permissions Policy, and report-only CSP for observation before enforcement.",
    "Activity logs record sensitive owner actions such as payment access updates and global publishing pause/resume.",
]), P("Operational alerts to watch", "H2x"), table(["Signal", "Meaning", "Action"], [
    ["Lifecycle error > 0", "A Zernio disconnect or archive check failed.", "Open OS Data, inspect logs, retry after provider recovery."],
    ["Stale publish > 0", "A post has remained sending longer than 30 minutes.", "Maintenance reconciles it; investigate persistent provider errors."],
    ["Stripe webhook failure", "Access/invoice state may lag Stripe.", "Replay the verified Stripe event after fixing endpoint health."],
    ["Storage warning", "Workspace local files exceeded 400 MB.", "Delete unused drafts or prefer Drive/Dropbox references."],
], [1.3*inch,2.55*inch,2.8*inch])]
story.append(PageBreak())

story += section("10. Competitive technical review")
story += [P("Benchmark used", "H2x"), P("Official 2026 product pages for Buffer, Hootsuite, Later, and Sprout Social show that scheduling, AI assistance, analytics, content calendars, team permissions, inbox/community tools, and reliable mobile access are now baseline expectations."),
          table(["Area", "WaveOS position", "Recommended next investment"], [
              ["Publishing safety", "Strong: isolated profiles, server-side caps, idempotency, stale reconciliation, emergency pause.", "Add a real connected-account canary that publishes/deletes a private test post on a schedule."],
              ["Media workflow", "Strong: local + Drive + Dropbox in one folder; temporary cleanup.", "Add resumable uploads only if local-file demand grows beyond the current capped model."],
              ["AI", "Differentiated Brand Voice flow but narrower than enterprise competitors.", "Add version history, reusable prompt presets, and measurable quality feedback."],
              ["Analytics", "Useful publishing/engagement signals.", "Add exportable, branded client reports and longer trend windows."],
              ["Engagement", "Comment signals exist but not a full unified inbox.", "Prioritize a permission-aware inbox only after publish reliability is proven."],
              ["Operations", "Better-than-basic owner controls and data separation.", "Add external uptime alerts, webhook dead-letter replay, and quarterly restore drills."],
          ], [1.15*inch,2.7*inch,2.8*inch]),
          P("Conclusion", "Callout"), P("WaveOS is strongest where it combines a client portal, billing records, media delivery, agency workflow, and social publishing in one branded system. It should not claim to be universally ‘better’ than every mature competitor yet. The highest-return path is reliability, reporting, and operational visibility—not adding many shallow features.")]
story.append(PageBreak())

story += section("11. Technical file map and release notes")
story.append(table(["File / area", "Responsibility"], [
    ["src/lib/social-plans.ts", "Canonical plan names, prices, annual discounts, and account limits."],
    ["src/lib/social-subscriptions.functions.ts", "Checkout, billing portal, subscription and invoice reads."],
    ["src/lib/social-subscription-webhook.server.ts", "Stripe subscription/invoice state and lifecycle scheduling."],
    ["src/lib/zernio-publish.server.ts", "Workspace-isolated publishing, attempts, provider status, cleanup."],
    ["src/routes/api/public/hooks/publish-due.ts", "Five-minute scheduled publisher and operations-maintenance trigger."],
    ["src/routes/api/public/hooks/maintain-social-operations.ts", "Stale-publish reconcile, Zernio disconnect, six-month archive."],
    ["src/lib/temporary-media-cleanup.server.ts", "Deletes temporary camera-roll media after full confirmation."],
    ["src/routes/_authenticated/settings.tsx", "Plan cards, annual switch, billing history, one-time-client restrictions."],
    ["src/routes/_authenticated/social.tsx", "Connections, cap visuals/disabled buttons, analytics, account health."],
    ["src/routes/_authenticated/os-data.tsx", "Owner-only public-account and operations dashboard."],
    ["supabase/migrations/", "RLS, subscriptions, invoices, media quotas, tier rules, lifecycle controls."],
    ["docs/", "Offboarding and technical readiness decisions."],
], [2.75*inch,4.0*inch]))
story += [P("Verification completed before release", "H2x"), bullets([
    "TypeScript typecheck passed.",
    "Production build passed.",
    "113/113 unit tests passed.",
    "Prices and entitlements match across source, Stripe Checkout payload, Settings, OS Data labels, and flyer.",
    "Security and deployment still require a live-domain smoke check after Lovable finishes repository sync/deploy.",
])]
story.append(PageBreak())

story += section("12. Test users — internal only")
story += [P("These accounts are special-access product testers. Do not share outside Dream Wave Media. Connect personal social pages only for the shortest necessary test window, then disconnect them.", "Callout")]
story.append(table(["Tier", "Login", "Password", "Expected access"], [
    ["Ripple", "waveos.ripple.test@dwmsrq.com", "WaveOS-Ripple-7H!29x", "3 accounts; Post now; no AI Assist; no scheduling."],
    ["Current", "waveos.current.test@dwmsrq.com", "WaveOS-Current-4K!83p", "4 accounts; AI Assist; Post now + Post later."],
    ["Tidal", "waveos.tidal.test@dwmsrq.com", "WaveOS-Tidal-9M!52q", "8 accounts; AI Assist; Post now + Post later."],
], [0.75*inch,2.15*inch,1.7*inch,2.2*inch]))
story += [P("Tester checklist", "H2x"), bullets([
    "Sign in on desktop and one phone-sized browser.",
    "Confirm the plan label and account cap.",
    "Ripple: verify AI Assist and Post later are blocked.",
    "Current/Tidal: verify AI Assist confirmation and scheduling controls are available.",
    "Connect accounts only up to the cap; confirm remaining cards turn red and Connect is disabled.",
    "Create a harmless test post, confirm Zernio success, then verify temporary media cleanup.",
    "When finished, disconnect all test social accounts and verify the connected count returns to zero.",
])]
story += [P("End of handbook", "H2x"), P("Keep this document with release records. Update it whenever plan pricing, provider integration, storage limits, access rules, or production operations change.")]

doc = SimpleDocTemplate(str(OUT), pagesize=letter, rightMargin=0.62*inch, leftMargin=0.62*inch, topMargin=0.62*inch, bottomMargin=0.62*inch, title="WaveOS Owner and App-Team Handbook", author="Dream Wave Media")
doc.build(story, onFirstPage=page_number, onLaterPages=page_number)
print(OUT)
