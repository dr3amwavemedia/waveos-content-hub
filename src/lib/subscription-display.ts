export type SubscriptionDisplayTone = "positive" | "warning" | "danger" | "neutral" | "info";

export type SubscriptionDisplayInput = {
  status?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  internalTestAccess?: boolean | null;
};

export type SubscriptionDisplayState = {
  key:
    | "none"
    | "trial"
    | "active"
    | "canceling"
    | "canceled"
    | "past_due"
    | "pending"
    | "internal_test"
    | "unknown";
  label: string;
  detail: string;
  tone: SubscriptionDisplayTone;
};

function validDateLabel(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Converts persisted, Stripe-confirmed subscription fields into honest UI copy.
 * This deliberately does not inspect the legacy profiles.payments_enabled flag;
 * that field is an administrative marker and is not a billing lifecycle source.
 */
export function subscriptionDisplayState(
  input: SubscriptionDisplayInput | null | undefined,
): SubscriptionDisplayState {
  if (!input) {
    return {
      key: "none",
      label: "No subscription",
      detail: "No Stripe subscription is recorded for this workspace.",
      tone: "neutral",
    };
  }

  if (input.internalTestAccess) {
    return {
      key: "internal_test",
      label: "Internal test access",
      detail: "Access is provided without a Stripe subscription or payment.",
      tone: "info",
    };
  }

  const status = input.status?.trim().toLowerCase() ?? "";
  const periodEnd = validDateLabel(input.currentPeriodEnd ?? input.trialEndsAt);
  if (input.cancelAtPeriodEnd && (status === "active" || status === "trialing")) {
    return {
      key: "canceling",
      label: periodEnd ? `Canceling ${periodEnd}` : "Canceling",
      detail: periodEnd
        ? `Stripe reports access will remain active through ${periodEnd}.`
        : "Stripe reports this subscription will end at the close of its current period.",
      tone: "warning",
    };
  }

  if (status === "trialing") {
    const trialEnd = validDateLabel(input.trialEndsAt);
    return {
      key: "trial",
      label: "Trial",
      detail: trialEnd
        ? `Stripe reports the trial ends ${trialEnd}.`
        : "Stripe reports an active trial.",
      tone: "info",
    };
  }
  if (status === "active") {
    return {
      key: "active",
      label: "Active",
      detail: periodEnd
        ? `Stripe reports an active subscription through ${periodEnd}.`
        : "Stripe reports an active subscription.",
      tone: "positive",
    };
  }
  if (status === "past_due") {
    return {
      key: "past_due",
      label: "Past due",
      detail: "Stripe reports that this subscription needs payment attention.",
      tone: "danger",
    };
  }
  if (status === "canceled" || status === "expired") {
    return {
      key: "canceled",
      label: status === "expired" ? "Expired" : "Canceled",
      detail:
        status === "expired"
          ? "The recorded subscription or checkout has expired."
          : "Stripe reports that this subscription is canceled.",
      tone: "neutral",
    };
  }
  if (status === "checkout_pending") {
    return {
      key: "pending",
      label: "Checkout pending",
      detail: "WaveOS is waiting for Stripe to confirm a completed checkout.",
      tone: "warning",
    };
  }
  if (!status) {
    return {
      key: "none",
      label: "No subscription",
      detail: "No Stripe subscription is recorded for this workspace.",
      tone: "neutral",
    };
  }
  return {
    key: "unknown",
    label: "Needs review",
    detail: "WaveOS received a billing state it cannot safely label. Check Stripe before acting.",
    tone: "warning",
  };
}
