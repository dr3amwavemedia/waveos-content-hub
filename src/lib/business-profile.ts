import logoAsset from "@/assets/dream-wave-media-logo.png.asset.json";

/**
 * Single source of truth for the business details rendered on invoices,
 * contracts and other client-facing documents. Verified values only — do not
 * invent a street address, email, legal suffix, tax number or payment
 * instructions here. Fields left null are flagged before production sending.
 */
export interface BusinessProfile {
  name: string;
  website: string;
  location: string;
  phone: string;
  logoUrl: string;
  /** Verified values required before a production invoice may be sent. */
  email: string | null;
  streetAddress: string | null;
  legalEntity: string | null;
  taxId: string | null;
  paymentInstructions: string | null;
}

export const businessProfile: BusinessProfile = {
  name: "Dream Wave Media",
  website: "https://dwmsrq.com",
  location: "Sarasota, FL",
  phone: "(941) 294-5727",
  logoUrl: logoAsset.url,
  // Verified directly by the owner on September 18, 2026.
  email: "jessehayes@dwmsrq.com",
  streetAddress: "290 Via Anina Dr, Sarasota, FL 34243",
  legalEntity: "Dream Wave Media LLC",
  // Still unverified — never invent these.
  taxId: null,
  paymentInstructions: null,
};

export const businessFooterLine = [
  businessProfile.website.replace(/^https?:\/\//, ""),
  businessProfile.location,
  businessProfile.phone,
].join(" · ");

/**
 * Protected contract variables supplied by WaveOS. These never belong in the
 * per-client contract form and are intentionally derived from the verified
 * business profile above.
 */
export const businessContractValues: Readonly<Record<string, string>> = {
  dwm_name: businessProfile.name,
  dwm_business_name: businessProfile.name,
  dwm_legal_name: businessProfile.legalEntity ?? businessProfile.name,
  dwm_legal_entity: businessProfile.legalEntity ?? businessProfile.name,
  dwm_logo_url: businessProfile.logoUrl,
  dwm_street_address: businessProfile.streetAddress ?? "",
  dwm_address: businessProfile.streetAddress ?? "",
  dwm_email: businessProfile.email ?? "",
  dwm_phone: businessProfile.phone,
  dwm_website: businessProfile.website,
  dwm_location: businessProfile.location,
};

/** Fields a valid production invoice still needs from the owner. */
export function missingBusinessProfileFields(
  profile: BusinessProfile = businessProfile,
): string[] {
  const required: Array<[keyof BusinessProfile, string]> = [
    ["email", "Billing email address"],
    ["streetAddress", "Street address"],
    ["paymentInstructions", "Payment instructions"],
  ];
  return required.filter(([key]) => !profile[key]).map(([, label]) => label);
}
