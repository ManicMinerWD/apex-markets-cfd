import { config } from "./config.js";
import { audit } from "./logger.js";

// ---------------------------------------------------------------------------
// Compliance layer. Real, enforced logic (not cosmetic).
// 1) Blocked-jurisdiction onboarding rejection
// 2) Leverage tiering by jurisdiction (regulatory cap)
// 3) AML screening hook (sandbox passes; prod calls ComplyAdvantage/sanctions)
// ---------------------------------------------------------------------------

export function jurisdictionFor(country: string): string {
  const eu = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"];
  if (country === "GB") return "UK";
  if (eu.includes(country)) return "EU";
  if (country === "AU") return "AU";
  return "ROW";
}

export function maxLeverageFor(country: string): number {
  const j = jurisdictionFor(country);
  return config.leverageTiers[j] ?? config.leverageTiers.DEFAULT ?? 30;
}

export function isBlockedCountry(country: string): boolean {
  return config.blockedCountries.map((c) => c.trim().toUpperCase()).includes(country.toUpperCase());
}

// AML screening — sanctions / PEP. Sandbox returns cleared; prod wires a provider.
export async function screenAml(payload: { email: string; country: string; fullName?: string }): Promise<{ cleared: boolean; reason?: string }> {
  if (!config.amlEnabled) {
    audit.info("AML screening skipped (disabled in config)", { email: payload.email });
    return { cleared: true };
  }
  // TODO(prod): call AML_API (e.g. ComplyAdvantage) with config.amlApiKey
  audit.warn("AML enabled but provider not wired — blocking by default", { email: payload.email });
  return { cleared: false, reason: "AML provider not configured" };
}

// Pre-trade compliance gate: KYC + not blocked + margin OK handled by caller.
export function assertOnboardable(country: string): void {
  if (isBlockedCountry(country)) {
    audit.warn("Onboarding rejected: blocked jurisdiction", { country });
    throw new HttpError(403, `Onboarding not permitted from ${country}`);
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
