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
        canvas.drawString(0.65*inch,0.28*inch,"WaveOS | Operations, costs & growth guide | 2026-10-07")
        canvas.drawRightString(7.85*inch,0.28*inch,f"Page {doc.page}")
    canvas.restoreState()

story = []
story += [Spacer(1,0.72*inch), P("WaveOS", "CoverTitle"), P("OPERATIONS, COSTS & GROWTH GUIDE", "CoverTitle"),
          P("A plain-language handbook for the owner, app team, operations, and future hires", "CoverSub"), Spacer(1,0.22*inch)]
flyer = ROOT / "output" / "flyer" / "waveos-subscriptions-flyer.png"
if flyer.exists(): story.append(Image(str(flyer), width=3.15*inch, height=4.08*inch))
story += [Spacer(1,0.22*inch), P("Release reference: October 7, 2026", "CoverSub"),
          P("Production: waveos.dreamwavemedia.co | Repository: dr3amwavemedia/waveos-content-hub", "CoverSub"), PageBreak()]

story += section("1. Executive summary", "WaveOS combines a Dream Wave Media client portal with a public subscription product. The public app is separated as OS Data; Dream Wave client workspaces remain Client Data. Stripe owns payment collection and invoices, while Zernio supplies isolated social-account connections and publishing for each workspace.")
story += [P("How to read this guide", "H2x"), table(["Label", "Meaning", "Team action"], [
    ["LIVE NOW", "Built, published, and part of the current production workflow.", "Operate it and monitor it."],
    ["NEXT", "Recommended before the next growth stage or store launch.", "Budget and schedule it."],
    ["LATER", "Useful only after usage, cost, or compliance reaches a trigger.", "Do not buy early."],
], [0.9*inch,3.1*inch,2.55*inch])]
story += [P("Current release status", "H2x"), bullets([
    "Three public plans are configured: Ripple, Current, and Tidal.",
    "Monthly and annual Stripe Checkout sessions use subscription mode. Monthly means the same calendar date each month - not a fixed 30-day timer.",
    "Stripe webhook events save subscription status, renewal dates, payment failures, and a rolling invoice history inside each account.",
    "Current and Tidal include Generative AI Assist and scheduling. Ripple blocks both scheduling and AI Assist.",
    "Camera-roll uploads are temporary and are deleted only after every selected Zernio destination confirms success.",
    "Google Drive and Dropbox references can coexist with local files in WaveOS folders without duplicating the originals.",
    "Owner-only OS Data includes public accounts, promo trials, account caps, lifecycle status, and an emergency publishing pause.",
])]
story += [P("The simplest operating picture", "H2x"), P("A customer pays through Stripe. Stripe tells WaveOS whether access is active. WaveOS controls the customer workspace and feature permissions. Zernio connects the customer's social accounts and delivers posts. Supabase stores app data, permissions, invoices, drafts, and limited temporary media. Google Drive and Dropbox remain the preferred homes for large original files.")]
story += [P("What this handbook does not claim", "H2x"), P("A code audit can verify recurring configuration, webhook handling, access controls, and invoice persistence. It cannot make one real monthly renewal happen in minutes. The first live renewal must be checked in Stripe after the actual anniversary date. Cross-platform social publishing also requires real connected accounts and platform approval.")]
story.append(PageBreak())

story += section("2. Subscription catalog")
story.append(table(["Plan", "Monthly", "Annual", "Accounts", "Access"], [
    ["Ripple", "$39.99", "$479.88 (no discount)", "3", "Create/publish, analytics, media library, Post now. No AI Assist or scheduling."],
    ["Current", "$69.99", "$797.89 (5% off $839.88)", "4", "Ripple features + Generative AI Assist + Post later scheduling."],
    ["Tidal", "$119.99", "$1,295.89 (10% off $1,439.88)", "8", "Current features + multiple accounts from the same network."],
], [0.82*inch,0.72*inch,1.25*inch,0.62*inch,3.5*inch]))
story += [P("Account-limit behavior", "H2x"), P("When the plan cap is full, connected accounts remain green. Every unconnected platform turns rose/red, says 'Limit reached,' and its Connect button is disabled. Users are told to disconnect an account or upgrade in Settings. The server independently rechecks the cap, so a browser cannot bypass it."),
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
story += [P("Conservative fee estimate for U.S. domestic cards", "H2x"), P("Stripe's public U.S. standard card price is 2.9% + $0.30 per successful charge. Stripe Billing pay-as-you-go is listed as an additional 0.7% of Billing volume. The second number below is the conservative combined estimate (3.6% + $0.30); the actual Dashboard fee depends on your Stripe contract and payment method.")]
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
          P("Zernio test connections", "H2x"), P("Zernio does not expose a guaranteed free 'test' flag through this integration. Their public pricing uses connected accounts, with the first two free and additional accounts charged on a graduated, daily-prorated basis. Use no more than the free allowance when possible. After testing, disconnect every test account immediately. A future message such as 'all done with test' can be used as an instruction to perform that cleanup, but WaveOS cannot promise Zernio will waive already accrued prorated charges.")]
story.append(PageBreak())

story += section("5. Social publishing workflow")
story += [P("Tidal multi-account spaces", "H2x"), P("Tidal may connect more than one account from the same network - for example, two Instagram accounts or two LinkedIn accounts - while the workspace remains capped at eight connected accounts total. Each duplicate account is stored in an isolated Zernio sub-profile. When a post uses a network with multiple connected accounts, WaveOS requires the user to choose the exact destination account or accounts before publishing; it never silently chooses one or posts to all of them.")]
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
    "Local / phone camera roll: the browser's native file picker opens the phone's Photos/Files choices. No separate camera-roll API is required.",
    "Google Drive: WaveOS stores an authorized reference and streams the source when needed; the original stays in the user's Drive.",
    "Dropbox: same reference-first model; the original stays in Dropbox.",
]), P("Current limits", "H2x"), table(["Limit", "Value", "User experience"], [
    ["Single local file", "300 MB", "Oversized selection is rejected with a friendly message."],
    ["Workspace local storage", "500 MB", "Warning begins at 400 MB; saving is blocked before exceeding the cap."],
    ["Project-wide local storage", "1.5 GB", "Protects the Lovable/Supabase allocation from one tenant consuming all storage."],
], [1.6*inch,1.1*inch,3.9*inch]),
          P("Quality", "H2x"), P("WaveOS does not intentionally compress the selected source before Zernio receives it. Each social network may transcode or compress media after upload according to its own platform rules. Files must still meet the destination's supported type, duration, resolution, and size limits."),
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
story += [P("Target devices", "H2x"), P("The app is a responsive web app intended for current Safari on iPhone/iPad/macOS and current Chrome-based browsers on Android, Google Pixel, Samsung Internet/Chrome, Windows, and macOS. Native file inputs hand control to each operating system's supported photo/file picker."),
          P("Release checks", "H2x"), bullets([
              "Minimum 44px touch targets for primary actions and no hover-only critical controls.",
              "Responsive single-column stacking for narrow phones and multi-column layouts for tablets/desktops.",
              "Keyboard focus, labels, disabled-state semantics, readable contrast, and status text in addition to color.",
              "Session refresh and resume behavior for iOS home-screen mode and suspended mobile tabs.",
              "Popup fallback: if a browser blocks the Zernio connection popup, WaveOS navigates in the same tab.",
          ]), P("Known limitation", "Callout"), P("No web app can guarantee every social network's native behavior on every OS version. Release testing should include at least one real iPhone Safari, iPad Safari, Pixel Chrome, and Samsung Chrome/Internet device whenever publishing or file selection changes.")]
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
          P("Conclusion", "Callout"), P("WaveOS is strongest where it combines a client portal, billing records, media delivery, agency workflow, and social publishing in one branded system. It should not claim to be universally 'better' than every mature competitor yet. The highest-return path is reliability, reporting, and operational visibility - not adding many shallow features.")]
story.append(PageBreak())

story += section("11. People, positions, and permission layers")
story += [P("LIVE NOW - access model", "H2x"), P("WaveOS currently enforces staff versus client identity, workspace membership, client service tiers, public subscription entitlements, and individual feature gates. Staff can use View as Client to see the exact customer experience without losing attribution. Public subscribers receive only the features included in Ripple, Current, or Tidal."),
          table(["Layer", "What the person should do", "What they should not control"], [
              ["Owner / Super Admin", "Pricing, refunds, Stripe/Zernio ownership, emergency pause, staff access, policies, and final incident decisions.", "Do not share this login or use it for daily content work."],
              ["Staff Admin", "Onboarding, workspace setup, client support, invoice status, and escalations.", "Bank details, ownership transfer, or production secrets unless specifically assigned."],
              ["Social Operations", "Connections, schedules, publishing failures, Zernio cleanup, and platform health.", "Plan pricing, refunds, or unrelated client financial data."],
              ["Creative / Editor", "Media, captions, Brand Voice drafts, and client revisions.", "Billing, staff permissions, or emergency controls."],
              ["Client Admin", "Own workspace, team invites where entitled, connections, content, and billing portal.", "Other workspaces, OS Data, or staff tools."],
              ["Client Member / Reviewer", "Assigned content review, approvals, uploads, or posting tasks.", "Owner billing and role changes unless explicitly granted."],
              ["Test User", "Validate one plan's visible features and account limit.", "Real client data or long-lived paid social connections."],
          ], [1.25*inch,3.35*inch,2.25*inch]),
          P("NEXT - role refinement", "H2x"), P("Add named Staff Admin, Social Operations, Creative Editor, Billing Support, and Read-only Auditor permissions in the database. Today, the feature-gate system is strong, but staff duties should become narrower before several employees handle production. Every sensitive action should record who performed it, the workspace, the time, and the reason."),
          P("Recommended staffing by size", "H2x"), table(["Stage", "Minimum operating team", "Add when needed"], [
              ["0-25 paying workspaces", "Owner + content/social operator + contract developer on call.", "Bookkeeper monthly and a named backup operator."],
              ["25-100 workspaces", "Add client success/support and part-time QA/operations.", "Part-time DevOps ownership and weekend incident coverage."],
              ["100-500 workspaces", "Dedicated support, social operations lead, engineer, QA, and finance operations.", "Security/privacy consultant and formal on-call rotation."],
              ["500+ or enterprise", "Product, engineering, support, security/compliance, finance, and customer success owners.", "24/7 vendor escalation and formal service-level commitments."],
          ], [1.25*inch,3.35*inch,2.25*inch])]
story.append(PageBreak())

story += section("12. Customer, staff, and email workflows")
story += [P("Public subscriber journey", "H2x"), table(["Step", "Customer sees", "Behind the scenes"], [
    ["1. Choose", "Three clear plan buttons and monthly/annual switch.", "WaveOS records the selected plan and billing interval."],
    ["2. Pay", "Stripe-hosted checkout; card details never enter WaveOS.", "Stripe creates the customer and recurring subscription."],
    ["3. Activate", "Workspace opens after confirmed payment.", "Verified Stripe webhook applies the exact entitlements."],
    ["4. Connect", "Customer links social accounts up to the plan cap.", "WaveOS maps the workspace to isolated Zernio profiles/accounts."],
    ["5. Create", "Caption, AI Assist when included, media, and exact destinations.", "Permissions, storage, and account limits are rechecked server-side."],
    ["6. Publish", "Post now or Post later when allowed.", "Zernio receives idempotent platform jobs; WaveOS tracks every result."],
    ["7. Confirm", "Success/failure and platform links appear in history.", "Temporary local media is deleted only after all destinations succeed."],
    ["8. Renew", "Invoice appears inside collapsed Billing history.", "Stripe invoice events update status, period, amount, and links."],
], [0.72*inch,2.7*inch,3.45*inch]),
P("LIVE NOW - Dream Wave email controls", "H2x"), bullets([
    "Master client-email switch and optional staff copies.",
    "Project reminders at 30, 5, 3, and 1 day before a shoot or event.",
    "Unpaid invoice reminders at 3, 5, and 7 days after issue.",
    "Media/revision notifications and test buttons for project, invoice, and upload templates.",
]),
P("NEXT - subscription and operations email sequence", "H2x"), table(["Event", "Customer email", "Internal action"], [
    ["Welcome/payment confirmed", "Receipt, plan, account cap, and first three setup steps.", "Confirm webhook and workspace activation."],
    ["Invoice paid", "Invoice link and next renewal date.", "No action unless amount/status mismatches."],
    ["Payment failed - day 0", "Update-card link and what remains available.", "Open lifecycle record; do not disconnect yet."],
    ["Payment failed - day 3/6", "Reminder and exact disconnect date.", "Client success follows up only if high value or requested."],
    ["Day 7 unresolved", "Social accounts disconnected; reactivation steps.", "Verify Zernio shows zero active connections."],
    ["Post failed", "Friendly reason and next step; no duplicate retry promise.", "Social Ops sees provider reason and controlled retry option."],
    ["Five-month inactive", "Archive/deletion warning with payment and export options.", "Review legal/financial retention exceptions."],
    ["Six-month inactive", "Workspace archived and how to contact support.", "Preserve legally required invoices; delete/anonymize per policy."],
], [1.35*inch,3.1*inch,2.55*inch])]
story.append(PageBreak())

story += section("13. Cost sheet and unit economics")
story += [P("Costs we can state today", "H2x"), table(["Cost", "Current public rate", "How it grows"], [
    ["Stripe card processing", "2.9% + $0.30 per successful U.S. domestic card charge.", "Variable with every payment; international cards and currency conversion cost more."],
    ["Stripe Billing", "About 0.7% of Billing volume on the referenced pay-as-you-go rate.", "Variable; confirm the exact product line on the Stripe account."],
    ["Zernio", "First 2 accounts free; accounts 3-10: $6 each; 11-100: $3 each; 101-2,000: $1 each/month.", "Graduated and daily prorated. Active connections across all customers count."],
    ["Supabase Pro", "Starts at $25/month; includes 100 GB file storage and 100,000 MAU.", "Storage above 100 GB about $0.021/GB; compute, egress, PITR, and add-ons can add cost."],
    ["Apple Developer", "$99/year.", "Annual membership; app transaction economics depend on the approved payment model."],
    ["Google Play", "$25 one-time registration.", "Digital subscriptions sold inside the app may carry Play service fees."],
    ["Samsung Galaxy Store", "$0 sign-up/annual publishing fee.", "Samsung Checkout transactions use revenue sharing."],
    ["Lovable/domain/email", "Account-specific - enter the actual monthly invoices here.", "Review monthly; never estimate these as zero in the business budget."],
], [1.35*inch,2.6*inch,3.05*inch]),
P("Illustrative monthly economics", "H2x"), P("These examples assume every workspace is monthly, every allowed social slot is connected, U.S. domestic cards, the conservative Stripe processing + Billing estimate, and exclude tax, refunds, payroll, Lovable, email, domain, and Supabase. They are planning examples, not a profit forecast."),
table(["Example", "Revenue", "Stripe est.", "Zernio est.", "Before fixed costs"], [
    ["10 Current users / 40 accounts", "$699.90", "$28.20", "$138", "$533.70"],
    ["25 mixed users / 110 accounts", "$1,699.75", "$68.70", "$328", "$1,303.05"],
    ["100 mixed users / 440 accounts", "$6,799.00", "$274.80", "$658", "$5,866.20"],
], [2.05*inch,1.05*inch,1.05*inch,1.05*inch,1.25*inch]),
P("Mixed examples", "Smallx"), P("25 users = 10 Ripple + 10 Current + 5 Tidal. 100 users = 40 Ripple + 40 Current + 20 Tidal. A customer who connects fewer than the plan maximum lowers Zernio cost."),
P("Monthly finance checklist", "H2x"), bullets([
    "Reconcile Stripe gross sales, fees, refunds, disputes, tax, and payouts against WaveOS invoices.",
    "Compare Zernio active-account count with WaveOS active subscriptions; investigate any inactive workspace still connected.",
    "Record Supabase/Lovable/domain/email/monitoring costs and calculate gross margin by plan.",
    "Flag any plan whose provider cost exceeds 25% of revenue or whose support time is consistently unprofitable.",
])]
story.append(PageBreak())

story += section("14. Expansion plan and upgrade triggers")
story += [P("Important: WaveOS already has servers", "Callout"), P("Supabase and Lovable already provide managed hosting, database, authentication, storage, and server functions. Do not buy a physical server. Add managed capacity or a separate background worker only when usage measurements show a real need."),
table(["Stage", "Stay with / add", "Upgrade trigger", "Planning budget"], [
    ["NOW: 0-25 paying workspaces", "Supabase Pro, Lovable hosting, Zernio, Stripe, Drive/Dropbox-first media, weekly backups review.", "Move off any free production database/storage tier immediately; complete real renewal and device tests.", "$25+/mo infrastructure plus account-specific Lovable/email/domain, Zernio, and Stripe."],
    ["NEXT: 25-100 workspaces", "External uptime/error monitoring, dedicated background worker/queue, backup restore drill, role separation.", "Scheduled jobs miss two cycles, p95 API latency exceeds 500 ms, or support cannot identify failures quickly.", "Roughly $50-$250/mo additional managed tooling."],
    ["GROWTH: 100-500 workspaces", "Separate object storage for retained media, job queue with dead-letter replay, on-call rotation, formal QA, penetration test.", "Local storage over 50 GB, webhook backlog, repeated provider incidents, or enterprise clients request controls.", "$250-$1,500+/mo plus $3k-$15k periodic security testing."],
    ["SCALE: 500+ / enterprise", "Dedicated compute, read replicas when metrics require, Team/Enterprise support, SSO/MFA, compliance program.", "Contractual SLA, regulated clients, 24/7 support need, or database/queue saturation.", "Supabase Team starts around $599/mo; enterprise and staffing are custom."],
], [1.2*inch,2.45*inch,2.15*inch,1.05*inch]),
P("When to consider direct social APIs", "H2x"), P("Keep Zernio while it is reliable and cheaper than maintaining several platform integrations. Consider direct Meta/LinkedIn/TikTok/etc. connections only when Zernio spend is consistently above roughly $2,000/month, a required feature is unavailable, or dependency risk blocks sales - and only when WaveOS can fund platform reviews, OAuth/security work, webhook maintenance, breaking API changes, and on-call support. Direct integration commonly costs tens of thousands of dollars across several networks; it is not automatically cheaper."),
P("Recommended 12-month sequence", "H2x"), table(["Timing", "Priority"], [
    ["0-30 days", "Verify first real renewal; activate monitoring; document incident contacts; complete restore test; finish privacy/terms/deletion pages."],
    ["30-90 days", "Narrow staff roles; add failed-post operations queue/email alerts; measure publish success, webhook delay, storage, and support time."],
    ["3-6 months", "Decide PWA versus store app; run closed mobile beta; add job queue only if triggers are met; complete six-month retention automation review."],
    ["6-12 months", "Store submissions if ready; branded reports; stronger audit exports; penetration test; evaluate direct APIs only from measured cost/feature gaps."],
], [1.15*inch,5.7*inch])]
story.append(PageBreak())

story += section("15. Apple, Google Play, and Samsung readiness")
story += [P("Current status", "H2x"), P("WaveOS is a responsive production web app, not yet a native App Store/Play/Galaxy binary. It can be used now from Safari, Chrome, and Samsung browsers. The lowest-risk next step is a polished installable web app (PWA) while the team prepares store policy, billing, testing, and support requirements."),
P("Recommended product path", "H2x"), table(["Option", "Time estimate", "Best use", "Main caution"], [
    ["Installable PWA", "2-4 weeks", "Fast mobile-like access without store review.", "Less native integration and discoverability."],
    ["Capacitor/native wrapper", "6-10 weeks", "One codebase with store binaries and push/file integrations.", "Must feel genuinely app-like and satisfy store billing/privacy rules."],
    ["Full native iOS + Android", "3-6+ months", "Deep native features and long-term dedicated mobile roadmap.", "Highest build and maintenance cost; unnecessary before demand is proven."],
], [1.25*inch,1.05*inch,2.45*inch,2.1*inch]),
P("Store launch checklist", "H2x"), bullets([
    "Create organization developer accounts, verify legal entity/contact information, and obtain a D-U-N-S number where required.",
    "Publish privacy policy, terms, support page, and a clear account-deletion web page. Add in-app deletion/request flow.",
    "Complete Apple privacy details and Google Data Safety forms based on actual Stripe, Supabase, Zernio, analytics, email, and crash-reporting data flows.",
    "Prepare icons, screenshots, descriptions, age/content ratings, review notes, and working reviewer test credentials.",
    "Add crash reporting, release signing, separate development/staging/production environments, and store-safe secret handling.",
    "Test camera roll, large media, OAuth return, background/resume, notifications, billing, cancellation, restoration, and deletion on real iPhone, iPad, Pixel, and Samsung devices.",
    "Run TestFlight, Google internal/closed testing, and Samsung beta before public release.",
]),
P("Subscription billing decision", "H2x"), P("This is the most important store-policy decision. Apple supports SaaS subscriptions through In-App Purchase and limits when outside purchase methods may be promoted. Google Play generally requires Play Billing for digital subscriptions sold inside a Play-distributed app, while allowing consumption-only apps that only sign in to previously purchased access. For the safest public native launch, either (1) integrate StoreKit and Google Play Billing and reconcile those entitlements with WaveOS, or (2) launch a login-only companion app with no in-app Stripe purchase path and obtain store-policy review before submission. Do not simply wrap the current Stripe checkout and assume approval."),
P("Planning estimates - not vendor quotes", "H2x"), bullets([
    "PWA polish: roughly $2,000-$8,000 depending on install prompts, offline shell, notifications, and QA.",
    "Store-ready wrapper: roughly $8,000-$20,000 plus Apple/Google/Samsung account setup and ongoing release maintenance.",
    "Full native pair: commonly $35,000-$100,000+; budget 15%-25% of build cost annually for maintenance.",
])]
story.append(PageBreak())

story += section("16. What is not ready yet")
story += [table(["Recommendation", "Why it matters", "Do it when"], [
    ["First real recurring-renewal verification", "A $1 payment proves collection, not a month/year renewal lifecycle.", "At the first actual Stripe renewal; inspect event, access, and saved invoice."],
    ["Independent uptime/error monitoring", "Lovable/Supabase status alone does not test WaveOS login, checkout, and publish flow.", "Now."],
    ["Scheduled private publish canaries", "Detects expired permissions and provider changes before customers do.", "After dedicated platform test pages can be maintained safely."],
    ["Webhook dead-letter/replay dashboard", "Lets staff recover Stripe/Zernio events without engineering database work.", "Before 100 paying workspaces or after the first missed webhook incident."],
    ["Formal staff sub-roles", "Reduces accidental access and makes audits clearer.", "Before more than three staff members operate production."],
    ["Restore drill and written recovery targets", "A backup is only useful after a proven restore.", "Now, then quarterly."],
    ["App Store/Play/Galaxy binaries", "Adds distribution and native features but creates billing/compliance obligations.", "After closed beta, policies, deletion, monitoring, and store billing decision are complete."],
    ["Direct social APIs", "Reduces one vendor dependency but multiplies platform maintenance.", "Only after measured spend/feature limits justify a dedicated integration team."],
    ["Dedicated compute/server", "Improves capacity only when the current system is measured as constrained.", "Use latency, queue age, database, and error metrics - not user count alone."],
], [1.85*inch,3.05*inch,1.95*inch]),
P("Incident rule", "Callout"), P("If payments, permissions, or publishing behave unexpectedly: pause publishing if necessary, preserve logs, do not blindly retry posts, check Stripe/Zernio/Supabase/Lovable status, identify affected workspaces, communicate plainly, and resume only after a controlled test succeeds.")]
story.append(PageBreak())

story += section("17. Technical file map and release notes")
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
    "114/114 unit tests passed.",
    "Prices and entitlements match across source, Stripe Checkout payload, Settings, OS Data labels, and flyer.",
    "Security and deployment still require a live-domain smoke check after Lovable finishes repository sync/deploy.",
])]
story.append(PageBreak())

story += section("18. Test users - internal only")
story += [P("These accounts are special-access product testers. Do not share outside Dream Wave Media. Connect personal social pages only for the shortest necessary test window, then disconnect them.", "Callout")]
story.append(table(["Tier", "Login", "Password", "Expected access"], [
    ["Ripple", "waveos.ripple.test@dwmsrq.com", "WaveOS-Ripple-7H!29x", "3 accounts; Post now; no AI Assist; no scheduling."],
    ["Current", "waveos.current.test@dwmsrq.com", "WaveOS-Current-4K!83p", "4 accounts; AI Assist; Post now + Post later."],
    ["Tidal", "waveos.tidal.test@dwmsrq.com", "WaveOS-Tidal-9M!52q", "8 accounts; duplicate networks; AI Assist; Post now + Post later."],
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

story.append(PageBreak())
story += section("19. Sources and review cadence")
story += [P("Official pricing and platform references checked October 7, 2026", "H2x"), bullets([
    "Stripe pricing: https://stripe.com/pricing",
    "Zernio connected-account pricing: https://docs.zernio.com/pricing",
    "Supabase pricing: https://supabase.com/pricing",
    "Supabase billing and usage: https://supabase.com/docs/guides/platform/billing-on-supabase",
    "Apple Developer Program enrollment: https://developer.apple.com/help/account/membership/program-enrollment",
    "Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/",
    "Apple in-app purchase overview: https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/",
    "Google Play developer registration: https://support.google.com/googleplay/android-developer/answer/6112435",
    "Google Play payments policy: https://support.google.com/googleplay/android-developer/answer/10281818",
    "Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469",
    "Google Play account deletion: https://support.google.com/googleplay/android-developer/answer/13327111",
    "Samsung Galaxy Store preparation: https://developer.samsung.com/galaxy-store/prepare.html",
    "Samsung Galaxy Store FAQ: https://developer.samsung.com/galaxy-store/faq.html",
]),
P("Internal source of truth", "H2x"), bullets([
    "WaveOS production repository and migrations for plan gates, roles, invoices, storage limits, lifecycle jobs, and social publishing.",
    "Stripe Dashboard for actual fees, subscription status, refunds, disputes, and payouts.",
    "Zernio Dashboard for actual connected-account days and provider-specific usage.",
    "Supabase/Lovable billing dashboards for actual infrastructure and hosting charges.",
]),
P("Review schedule", "H2x"), table(["Frequency", "Review"], [
    ["Weekly", "Failed posts, lifecycle errors, storage warnings, provider incidents, and customer support patterns."],
    ["Monthly", "Revenue, fees, Zernio connections, infrastructure invoices, margin by plan, inactive account cleanup."],
    ["Quarterly", "Restore drill, staff access review, dependency/security review, device/browser regression test."],
    ["Before every price/store change", "Update this guide, public plan copy, Stripe products, policies, screenshots, and test cases."],
], [1.25*inch,5.6*inch]),
P("Important", "Callout"), P("Vendor prices and store policies change. Recheck the official pages before approving a budget, changing a plan, or submitting a mobile app.")]

doc = SimpleDocTemplate(str(OUT), pagesize=letter, rightMargin=0.62*inch, leftMargin=0.62*inch, topMargin=0.62*inch, bottomMargin=0.62*inch, title="WaveOS Operations, Costs and Growth Guide", author="Dream Wave Media")
doc.build(story, onFirstPage=page_number, onLaterPages=page_number)
print(OUT)
