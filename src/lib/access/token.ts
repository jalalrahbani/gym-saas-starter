import { createHmac } from "node:crypto";

/**
 * Normalize an identifier emitted by a gym access reader.
 * Keep this deliberately conservative: trim framing whitespace/control chars,
 * but do not alter case or remove meaningful digits/characters.
 */
export function normalizeAccessToken(raw: string) {
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

/**
 * Convert a raw membership-card/RFID identifier into the value stored in
 * access_credentials.token_hmac. The raw identifier must never be persisted.
 */
export function hmacAccessToken(raw: string, secret: string) {
  const normalized = normalizeAccessToken(raw);
  if (!normalized) throw new Error("Access token is empty after normalization.");
  if (secret.length < 32) throw new Error("CARD_TOKEN_HMAC_SECRET must be at least 32 characters.");
  return createHmac("sha256", secret).update(normalized, "utf8").digest("hex");
}

export function accessTokenLastFour(raw: string) {
  const normalized = normalizeAccessToken(raw);
  return normalized.slice(-4);
}
