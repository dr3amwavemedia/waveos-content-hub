export const SOCIAL_PLANS = {
  trial: { name: "Promo trial", accountLimit: 3, monthlyCents: 0, annualCents: 0 },
  standard: { name: "Ripple", accountLimit: 3, monthlyCents: 3999, annualCents: 47988 },
  full: { name: "Current", accountLimit: 3, monthlyCents: 7000, annualCents: 79800 },
  expanded: { name: "Tidal", accountLimit: 8, monthlyCents: 12000, annualCents: 129600 },
} as const;

export type SocialPlan = keyof typeof SOCIAL_PLANS;
export type SocialBillingInterval = "monthly" | "annual";

export function socialPlanPrice(
  plan: Exclude<SocialPlan, "trial">,
  interval: SocialBillingInterval,
) {
  const price =
    interval === "annual" ? SOCIAL_PLANS[plan].annualCents : SOCIAL_PLANS[plan].monthlyCents;
  if (price === null) throw new Error("unsupported_social_billing_interval");
  return price;
}

export function socialPlanAllowsBillingInterval(
  plan: Exclude<SocialPlan, "trial">,
  interval: SocialBillingInterval,
) {
  return Boolean(SOCIAL_PLANS[plan][interval === "annual" ? "annualCents" : "monthlyCents"]);
}

export function socialPlanIncludesPremiumTools(plan: SocialPlan) {
  return plan === "full" || plan === "expanded";
}
