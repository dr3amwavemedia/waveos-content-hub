type SubscriptionEmailKind = "paid" | "failed" | "started_paid" | "started_trial";

interface SubscriptionEmailInput {
  kind: SubscriptionEmailKind;
  workspaceId: string;
  customerEmail?: string | null;
  amountPaid?: number | null;
  currency?: string | null;
  attemptCount?: number;
  locked?: boolean;
  trialEndsAt?: string | null;
}

const safeEmail = (value: unknown) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ? value.trim().toLowerCase()
    : null;

const money = (amount: number | null | undefined, currency: string | null | undefined) => {
  if (!Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
    }).format((amount ?? 0) / 100);
  } catch {
    return `$${((amount ?? 0) / 100).toFixed(2)}`;
  }
};

function copyFor(input: SubscriptionEmailInput) {
  if (input.kind === "started_trial") {
    const endDate = input.trialEndsAt
      ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(input.trialEndsAt))
      : null;
    return {
      eventType: "social_subscription_trial_started",
      subject: "Your WaveOS free trial has started",
      heading: "Welcome to WaveOS — your free trial is active",
      message: `Your promotional trial is ready${endDate ? ` through ${endDate}` : ""}. You can now sign in to WaveOS and start using your social tools. Your selected paid plan begins automatically when the trial ends unless you cancel beforehand.`,
      button: "Sign in to WaveOS",
    };
  }
  if (input.kind === "started_paid") {
    return {
      eventType: "social_subscription_started",
      subject: "Welcome to WaveOS",
      heading: "Welcome to WaveOS — your subscription is active",
      message:
        "Your payment was confirmed and your WaveOS subscription is ready. Sign in to your portal to connect your social accounts and get started.",
      button: "Sign in to WaveOS",
    };
  }
  if (input.kind === "paid") {
    const amount = money(input.amountPaid, input.currency);
    return {
      eventType: "social_subscription_payment_succeeded",
      subject: "WaveOS payment received",
      heading: "Your WaveOS payment went through",
      message: `${amount ? `We received your ${amount} payment. ` : ""}Your subscription is active and your social tools are ready to use.`,
      button: "Open WaveOS",
    };
  }
  if (input.locked) {
    return {
      eventType: "social_subscription_payment_failed_locked",
      subject: "Action needed: WaveOS social tools are paused",
      heading: "Your WaveOS subscription needs attention",
      message:
        "A second payment attempt was unsuccessful, so social tools are paused. Your accounts, connections, and content are still safely stored. Update your payment method to restore access automatically after payment succeeds.",
      button: "Update billing",
    };
  }
  return {
    eventType: "social_subscription_payment_failed",
    subject: "Action needed: WaveOS payment did not go through",
    heading: "We couldn't process your WaveOS payment",
    message:
      "Your social tools are still available while Stripe retries the payment. Please update your payment method now to avoid a pause after the second unsuccessful attempt.",
    button: "Update billing",
  };
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

export async function sendSocialSubscriptionEmail(input: SubscriptionEmailInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: members } = await supabaseAdmin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", input.workspaceId);
  const users = await Promise.all(
    (members ?? []).map(({ user_id }) => supabaseAdmin.auth.admin.getUserById(user_id)),
  );
  const recipients = [
    ...new Set(
      [input.customerEmail, ...users.map(({ data }) => data.user?.email)]
        .map(safeEmail)
        .filter((email): email is string => Boolean(email)),
    ),
  ];
  const copy = copyFor(input);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TRANSACTIONAL_EMAIL_FROM ?? "WaveOS <jean@dwmsrq.com>";
  const portalUrl = new URL(
    input.kind === "started_paid" || input.kind === "started_trial" ? "/auth" : "/settings",
    process.env.WAVEOS_APP_URL ?? "https://waveos.dreamwavemedia.co",
  ).toString();
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#07111c;font-family:Arial,sans-serif;color:#eaf6ff"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" style="max-width:580px;background:#0d1b2a;border:1px solid #1c4058;border-radius:18px;overflow:hidden"><tr><td style="padding:24px 28px;color:#4fc3ff;font-size:22px;font-weight:700">WaveOS</td></tr><tr><td style="padding:18px 28px 34px"><h1 style="margin:0 0 14px;font-size:25px;color:#fff">${escapeHtml(copy.heading)}</h1><p style="font-size:16px;line-height:1.6;color:#b8cad6">${escapeHtml(copy.message)}</p><a href="${escapeHtml(portalUrl)}" style="display:inline-block;margin-top:8px;background:#39b8f2;color:#04111b;text-decoration:none;border-radius:10px;padding:13px 20px;font-weight:700">${escapeHtml(copy.button)} &rarr;</a></td></tr></table></td></tr></table></body></html>`;

  for (const recipient of recipients) {
    if (input.kind === "started_paid" || input.kind === "started_trial") {
      const { data: prior } = await supabaseAdmin
        .from("transactional_email_log")
        .select("id")
        .eq("workspace_id", input.workspaceId)
        .eq("event_type", copy.eventType)
        .eq("recipient_email", recipient)
        .eq("status", "sent")
        .limit(1)
        .maybeSingle();
      if (prior) continue;
    }
    let status: "sent" | "failed" | "skipped" = apiKey ? "failed" : "skipped";
    let providerMessageId: string | null = null;
    let errorMessage: string | null = null;
    if (apiKey) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [recipient], subject: copy.subject, html }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          id?: string;
          message?: string;
        };
        status = response.ok ? "sent" : "failed";
        providerMessageId = response.ok && result.id ? result.id : null;
        errorMessage = response.ok
          ? null
          : (result.message ?? `Email provider error (${response.status})`).slice(0, 500);
      } catch {
        errorMessage = "Email provider request failed";
      }
    }
    await supabaseAdmin.from("transactional_email_log").insert({
      workspace_id: input.workspaceId,
      event_type: copy.eventType,
      recipient_email: recipient,
      provider_message_id: providerMessageId,
      status,
      error_message: errorMessage,
    });
  }
}
