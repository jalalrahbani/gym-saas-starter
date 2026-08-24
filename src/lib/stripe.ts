import { createHmac, timingSafeEqual } from "node:crypto";

export async function stripeRequest(path: string, params: URLSearchParams) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured.");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "Stripe request failed.");
  return body;
}

export function verifyStripeSignature(payload: string, signatureHeader: string | null, secret: string, toleranceSeconds = 300) {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return signatures.some((signature) => {
    try {
      const actual = Buffer.from(signature, "hex");
      return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
    } catch { return false; }
  });
}
