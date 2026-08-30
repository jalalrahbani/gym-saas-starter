"use server";

import { revalidatePath } from "next/cache";
import { requireAppContext } from "@/lib/app-context";

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

export async function createTrainingProgramAction(formData: FormData) {
  const ctx = await requireAppContext();
  const memberId = required(formData, "member_id");
  const targets: Array<{ muscle_group_id: string; target_sessions_per_week: number }> = [];

  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("target__")) continue;
    const muscleGroupId = key.slice("target__".length);
    const value = String(rawValue).trim();
    if (!value) continue;

    const target = Number(value);
    if (!Number.isInteger(target) || target < 0 || target > 14) {
      throw new Error("Weekly muscle targets must be whole numbers between 0 and 14.");
    }
    if (target > 0) {
      targets.push({
        muscle_group_id: muscleGroupId,
        target_sessions_per_week: target,
      });
    }
  }

  if (!targets.length) {
    throw new Error("Set at least one weekly muscle target above 0.");
  }

  const { error } = await ctx.supabase.rpc("create_training_program_idempotent", {
    p_organization_id: ctx.organization.id,
    p_member_id: memberId,
    p_trainer_user_id: required(formData, "trainer_user_id"),
    p_name: required(formData, "name"),
    p_starts_on: required(formData, "starts_on"),
    p_ends_on: optional(formData, "ends_on"),
    p_notes: optional(formData, "notes"),
    p_targets: targets,
    p_idempotency_key: idempotencyKey(formData),
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/members/${memberId}/training`);
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/training/today");
}
