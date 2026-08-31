"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAppContext } from "@/lib/app-context";
import { ROLE_GROUPS, roleAllowed } from "@/lib/roles";

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function idempotencyKey(formData: FormData) {
  const raw = String(formData.get("operation_key") ?? "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    return raw;
  }
  return crypto.randomUUID();
}

function moneyToMinor(raw: string) {
  const normalized = raw.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter a valid non-negative amount with at most 2 decimals.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large.");
  return Number(minor);
}

export async function sellMembershipAction(formData: FormData) {
  const ctx = await requireAppContext();
  if (!roleAllowed(ctx.role, ROLE_GROUPS.membershipManagers)) {
    throw new Error("You are not authorized to complete membership sales.");
  }

  const memberId = required(formData, "member_id");
  const { data, error } = await ctx.supabase.rpc("enroll_membership_idempotent", {
    p_organization_id: ctx.organization.id,
    p_member_id: memberId,
    p_plan_id: required(formData, "plan_id"),
    p_starts_on: required(formData, "starts_on"),
    p_amount_paid_minor: moneyToMinor(required(formData, "amount_paid")),
    p_payment_method: String(formData.get("payment_method") || "cash"),
    p_note: optional(formData, "note"),
    p_idempotency_key: idempotencyKey(formData),
  });

  if (error) throw new Error(error.message);

  const result = (data ?? {}) as {
    membership_id?: string;
    payment_id?: string | null;
  };

  revalidatePath("/front-desk");
  revalidatePath("/memberships");
  revalidatePath("/payments");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/dashboard");

  if (result.payment_id) {
    redirect(`/receipts/${result.payment_id}?sale=1`);
  }

  redirect(`/members/${memberId}`);
}
