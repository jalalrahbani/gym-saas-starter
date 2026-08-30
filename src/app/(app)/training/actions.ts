"use server";

import { revalidatePath } from "next/cache";
import { requireAppContext } from "@/lib/app-context";
import { addMinutesIso, wallTimeToUtcIso } from "@/lib/time";

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optionalTrainingField(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function trainingMuscleIds(formData: FormData) {
  return [...new Set(
    formData
      .getAll("muscle_group_ids")
      .map((value) => String(value).trim())
      .filter(Boolean),
  )];
}

function parseExerciseLines(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const [nameRaw, setsRaw = "1", repsRaw = "", weightRaw = "", rpeRaw = ""] =
      line.split("|").map((part) => part.trim());

    if (!nameRaw) throw new Error(`Exercise line ${index + 1} needs a name.`);

    const setCount = Number(setsRaw || "1");
    if (!Number.isInteger(setCount) || setCount < 1 || setCount > 20) {
      throw new Error(`Exercise line ${index + 1}: sets must be between 1 and 20.`);
    }

    const reps = repsRaw === "" ? null : Number(repsRaw);
    if (reps !== null && (!Number.isInteger(reps) || reps < 0 || reps > 1000)) {
      throw new Error(`Exercise line ${index + 1}: reps must be a non-negative whole number.`);
    }

    const weight = weightRaw === "" ? null : Number(weightRaw);
    if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 5000)) {
      throw new Error(`Exercise line ${index + 1}: weight must be a valid non-negative number.`);
    }

    const rpe = rpeRaw === "" ? null : Number(rpeRaw);
    if (rpe !== null && (!Number.isFinite(rpe) || rpe < 0 || rpe > 10)) {
      throw new Error(`Exercise line ${index + 1}: RPE must be between 0 and 10.`);
    }

    return {
      exercise_id: null,
      name: nameRaw,
      sets: Array.from({ length: setCount }, () => ({
        reps,
        weight_kg: weight,
        rpe,
        completed: true,
      })),
    };
  });
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
  revalidatePath("/training/today");
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
  revalidatePath("/training/today");
}

export async function savePtSessionPlanAction(formData: FormData) {
  const ctx = await requireAppContext();
  const sessionId = required(formData, "session_id");
  const memberId = required(formData, "member_id");

  const { error } = await ctx.supabase.rpc("save_pt_session_plan", {
    p_organization_id: ctx.organization.id,
    p_session_id: sessionId,
    p_program_id: optionalTrainingField(formData, "program_id"),
    p_session_goal: optionalTrainingField(formData, "session_goal"),
    p_planned_muscle_group_ids: trainingMuscleIds(formData),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/training");
  revalidatePath("/training/today");
  revalidatePath(`/members/${memberId}`);
}

export async function completePtSessionWithWorkoutAction(formData: FormData) {
  const ctx = await requireAppContext();
  const sessionId = required(formData, "session_id");
  const memberId = required(formData, "member_id");
  const muscles = trainingMuscleIds(formData).map((muscleGroupId) => ({
    muscle_group_id: muscleGroupId,
  }));
  const exercises = parseExerciseLines(String(formData.get("exercise_lines") ?? ""));

  const { error } = await ctx.supabase.rpc("complete_pt_session_with_workout", {
    p_organization_id: ctx.organization.id,
    p_session_id: sessionId,
    p_program_id: optionalTrainingField(formData, "program_id"),
    p_session_goal: optionalTrainingField(formData, "session_goal"),
    p_coach_notes: optionalTrainingField(formData, "coach_notes"),
    p_muscles: muscles,
    p_exercises: exercises,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/training");
  revalidatePath("/training/today");
  revalidatePath(`/members/${memberId}`);
}
