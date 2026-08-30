import crypto from "crypto";
import { config } from "./config.js";
import { audit } from "./logger.js";
import { HttpError } from "./compliance.js";

// ---------------------------------------------------------------------------
// Sumsub KYC/AML integration.
// Sandbox: we generate an applicant token locally and accept webhooks without
//   signature verification so you can click through the flow end-to-end.
// Production: SUMSUB_SANDBOX=false + real appToken/secretKey; verify the
//   webhook HMAC-SHA256 signature (see verifyWebhook below).
// Docs: https://developers.sumsub.com/
// ---------------------------------------------------------------------------

function hmac(path: string, body: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const data = ts + path + body;
  const sig = crypto.createHmac("sha256", config.sumsub.secretKey).update(data).digest("hex");
  return `${ts}.${sig}`;
}

// Create an applicant + return an SDK access token for the front-end widget.
export async function createApplicant(userId: string, email: string, country: string): Promise<{ applicantId: string; sdkToken: string }> {
  if (config.sumsub.sandbox || !config.sumsub.appToken) {
    // Synthetic token for sandbox so the UI flow works without credentials.
    const applicantId = `sandbox_${userId}`;
    audit.info("Sumsub applicant (sandbox)", { userId, applicantId });
    return { applicantId, sdkToken: `sandbox_sdk_${userId}_${Date.now()}` };
  }
  const applicant = {
    externalUserId: userId,
    info: { email, country }
  };
  const body = JSON.stringify(applicant);
  const path = "/resources/applicants?levelName=basic-kyc-level";
  const res = await fetch(config.sumsub.baseUrl + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + config.sumsub.appToken
    },
    body
  });
  if (!res.ok) throw new HttpError(502, `Sumsub applicant failed: ${res.status}`);
  const data: any = await res.json();
  const tokenRes = await fetch(`${config.sumsub.baseUrl}/resources/accessTokens/sdk/${data.id}`, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: "Bearer " + config.sumsub.appToken, "X-Applicant-Id": data.id }
  });
  const tok: any = await tokenRes.json();
  return { applicantId: data.id, sdkToken: tok.token };
}

// Webhook receiver. Verify signature in production.
export function verifyWebhook(rawBody: string, signature: string | undefined): boolean {
  if (config.sumsub.sandbox) return true; // sandbox: trust for dev
  if (!signature || !config.sumsub.webhookSecret) return false;
  const expected = crypto.createHmac("sha256", config.sumsub.webhookSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Parse Sumsub review result and return new KYC status.
export function reviewToStatus(payload: any): "verified" | "rejected" | "pending" {
  const r = payload?.reviewResult?.reviewAnswer;
  if (r === "GREEN") return "verified";
  if (r === "RED") return "rejected";
  return "pending";
}
