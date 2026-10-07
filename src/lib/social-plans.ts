export const SOCIAL_PLANS = {
  trial: { name: "Promo trial", accountLimit: 3, monthlyCents: 0, annualCents: 0 },
  standard: { name: "Standard", accountLimit: 3, monthlyCents: 3999, annualCents: 47988 },
  expanded: { name: "Expanded", accountLimit: 6, monthlyCents: null, annualCents: 78000 },
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
  return !(plan === "expanded" && interval === "monthly");
}
