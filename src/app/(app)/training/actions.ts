"use server";

import { revalidatePath } from "next/cache";
import { requireAppContext } from "@/lib/app-context";
import { addMinutesIso, wallTimeToUtcIso } from "@/lib/time";

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}


export async function reschedulePtSessionAction(formData: FormData) {
  const ctx = await requireAppContext();
  const sessionId = required(formData, "session_id");
  const startsAt = wallTimeToUtcIso(required(formData, "starts_at"), ctx.organization.timezone);
  const duration = Number(String(formData.get("duration_minutes") || "60"));
  const endsAt = addMinutesIso(startsAt, duration);

  const { error } = await ctx.supabase.rpc("reschedule_pt_session", {
    p_organization_id: ctx.organization.id,
    p_session_id: sessionId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/training");
}


export async function cancelPtSessionAction(formData: FormData) {
  const ctx = await requireAppContext();
  const sessionId = required(formData, "session_id");

  const { error } = await ctx.supabase.rpc("cancel_pt_session", {
    p_organization_id: ctx.organization.id,
    p_session_id: sessionId,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/training");
}
