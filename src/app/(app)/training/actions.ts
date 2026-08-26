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

  const { data: session, error: readError } = await ctx.supabase
    .from("pt_sessions")
    .select("id,status,starts_at,ends_at,member_id,trainer_user_id")
    .eq("organization_id", ctx.organization.id)
    .eq("id", sessionId)
    .single();

  if (readError) throw new Error(readError.message);
  if (session.status !== "scheduled") throw new Error("Only scheduled PT sessions can be rescheduled.");

  const { error } = await ctx.supabase
    .from("pt_sessions")
    .update({ starts_at: startsAt, ends_at: endsAt })
    .eq("organization_id", ctx.organization.id)
    .eq("id", sessionId)
    .eq("status", "scheduled");

  if (error) throw new Error(error.message);

  await ctx.supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    actor_user_id: ctx.userId,
    action: "pt.session_rescheduled",
    entity_type: "pt_session",
    entity_id: sessionId,
    before_data: { starts_at: session.starts_at, ends_at: session.ends_at },
    after_data: { starts_at: startsAt, ends_at: endsAt },
  });

  revalidatePath("/training");
}

export async function cancelPtSessionAction(formData: FormData) {
  const ctx = await requireAppContext();
  const sessionId = required(formData, "session_id");

  const { data: session, error: readError } = await ctx.supabase
    .from("pt_sessions")
    .select("id,status,starts_at,ends_at,member_id,trainer_user_id")
    .eq("organization_id", ctx.organization.id)
    .eq("id", sessionId)
    .single();

  if (readError) throw new Error(readError.message);
  if (session.status === "cancelled") return;
  if (session.status !== "scheduled") throw new Error("Only scheduled PT sessions can be cancelled.");

  const { error } = await ctx.supabase
    .from("pt_sessions")
    .update({ status: "cancelled" })
    .eq("organization_id", ctx.organization.id)
    .eq("id", sessionId)
    .eq("status", "scheduled");

  if (error) throw new Error(error.message);

  await ctx.supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    actor_user_id: ctx.userId,
    action: "pt.session_cancelled",
    entity_type: "pt_session",
    entity_id: sessionId,
    before_data: { status: session.status, starts_at: session.starts_at, ends_at: session.ends_at },
    after_data: { status: "cancelled" },
  });

  revalidatePath("/training");
}
