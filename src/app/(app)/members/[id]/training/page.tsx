import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { OperationKeyInput } from "@/components/operation-key-input";
import { requireAppContext } from "@/lib/app-context";
import { formatDate, formatDateTime } from "@/lib/format";
import { dateInTimeZone } from "@/lib/time";
import { createTrainingProgramAction } from "./actions";

function mondayOfWeek(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function trainerName(trainerNames: Map<string, string>, userId: string | null | undefined) {
  if (!userId) return "Unassigned";
  return trainerNames.get(userId) || "Trainer";
}

function sessionMuscles(session: any, trainedOnly = false) {
  return (session.pt_session_muscles ?? [])
    .filter((item: any) => !trainedOnly || item.is_trained)
    .map((item: any) => item.muscle_groups?.name)
    .filter(Boolean);
}

function setSummary(set: any) {
  const pieces: string[] = [];
  if (set.reps != null) pieces.push(`${set.reps} reps`);
  if (set.weight_kg != null) pieces.push(`${Number(set.weight_kg)} kg`);
  if (set.duration_seconds != null) pieces.push(`${set.duration_seconds}s`);
  if (set.distance_meters != null) pieces.push(`${Number(set.distance_meters)} m`);
  if (set.rpe != null) pieces.push(`RPE ${Number(set.rpe)}`);
  return pieces.length ? pieces.join(" · ") : "Completed set";
}

export default async function MemberTrainingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const canCoach = ["owner", "admin", "manager", "trainer"].includes(ctx.role);

  if (!canCoach) {
    return <AccessDenied area="member training history" />;
  }

  const today = dateInTimeZone(new Date(), ctx.organization.timezone);
  const weekStart = mondayOfWeek(today);

  const [memberRes, packagesRes, sessionsRes, programsRes, musclesRes, trainersRes, weeklyRes] =
    await Promise.all([
      ctx.supabase
        .from("members")
        .select("id,first_name,last_name,member_number,phone,archived_at")
        .eq("organization_id", ctx.organization.id)
        .eq("id", id)
        .maybeSingle(),
      ctx.supabase
        .from("pt_packages")
        .select(
          "id,trainer_user_id,membership_id,label,sessions_purchased,sessions_remaining,starts_on,expires_on,notes,created_at",
        )
        .eq("organization_id", ctx.organization.id)
        .eq("member_id", id)
        .order("created_at", { ascending: false }),
      ctx.supabase
        .from("pt_sessions")
        .select(
          "id,starts_at,ends_at,status,trainer_user_id,pt_package_id,notes,pt_session_workouts(session_goal,coach_notes,completed_at),pt_session_muscles(is_planned,is_trained,notes,muscle_groups(name)),pt_session_exercises(id,exercise_name,position,notes,pt_exercise_sets(set_number,reps,weight_kg,duration_seconds,distance_meters,rpe,completed,notes))",
        )
        .eq("organization_id", ctx.organization.id)
        .eq("member_id", id)
        .order("starts_at", { ascending: false })
        .limit(250),
      ctx.supabase
        .from("member_training_programs")
        .select("id,trainer_user_id,name,starts_on,ends_on,notes,is_active,created_at")
        .eq("organization_id", ctx.organization.id)
        .eq("member_id", id)
        .order("starts_on", { ascending: false })
        .limit(20),
      ctx.supabase
        .from("muscle_groups")
        .select("id,name,body_region,sort_order")
        .eq("organization_id", ctx.organization.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      ctx.supabase
        .from("organization_members")
        .select("user_id,role,profiles(full_name)")
        .eq("organization_id", ctx.organization.id)
        .eq("is_active", true)
        .in("role", ["owner", "admin", "manager", "trainer"]),
      ctx.supabase.rpc("get_member_weekly_muscle_progress", {
        p_organization_id: ctx.organization.id,
        p_member_id: id,
        p_week_start: weekStart,
      }),
    ]);

  if (memberRes.error) throw new Error(memberRes.error.message);
  if (packagesRes.error) throw new Error(packagesRes.error.message);
  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  if (programsRes.error) throw new Error(programsRes.error.message);
  if (musclesRes.error) throw new Error(musclesRes.error.message);
  if (trainersRes.error) throw new Error(trainersRes.error.message);
  if (weeklyRes.error) throw new Error(weeklyRes.error.message);

  const member: any = memberRes.data;
  if (!member) notFound();

  const packages = (packagesRes.data ?? []) as any[];
  const sessions = (sessionsRes.data ?? []) as any[];
  const programs = (programsRes.data ?? []) as any[];
  const muscles = (musclesRes.data ?? []) as any[];
  const weekly = (weeklyRes.data ?? []) as any[];

  const trainerNames = new Map<string, string>();
  for (const trainer of trainersRes.data ?? []) {
    trainerNames.set(
      (trainer as any).user_id,
      (trainer as any).profiles?.full_name || (trainer as any).role || "Trainer",
    );
  }

  const programIds = programs.map((program) => program.id);
  const targetsRes = programIds.length
    ? await ctx.supabase
        .from("member_program_muscle_targets")
        .select("program_id,muscle_group_id,target_sessions_per_week,muscle_groups(name)")
        .eq("organization_id", ctx.organization.id)
        .eq("member_id", id)
        .in("program_id", programIds)
    : { data: [] as any[], error: null };

  if (targetsRes.error) throw new Error(targetsRes.error.message);
  const targets = (targetsRes.data ?? []) as any[];

  const activeProgram =
    programs.find(
      (program) =>
        program.is_active &&
        program.starts_on <= today &&
        (!program.ends_on || program.ends_on >= today),
    ) ?? null;

  const activeTargets = activeProgram
    ? targets.filter((target) => target.program_id === activeProgram.id)
    : [];

  const packageById = new Map(packages.map((item) => [item.id, item]));
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const scheduledSessions = sessions.filter((session) => session.status === "scheduled");
  const remainingThisWeek = weekly.filter((row) => Number(row.remaining_sessions) > 0);

  const currentPackages = packages.filter((pkg) => {
    const started = !pkg.starts_on || pkg.starts_on <= today;
    const notExpired = !pkg.expires_on || pkg.expires_on >= today;
    return started && notExpired && Number(pkg.sessions_remaining) > 0;
  });

  const defaultTrainerId =
    ctx.role === "trainer"
      ? ctx.userId
      : currentPackages.find((pkg) => pkg.trainer_user_id)?.trainer_user_id || ctx.userId;

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[#7a7f89]">Member training</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {member.first_name} {member.last_name}
          </h1>
          <p className="mt-2 text-sm text-[#7a7f89]">
            PT package usage, weekly muscle targets, and the exact history of each coached session.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/members/${id}`}
            className="rounded-lg border border-[#dfe2e7] bg-white px-3 py-2 text-sm font-semibold"
          >
            Member profile
          </a>
          <a
            href="/training/today"
            className="rounded-lg bg-[#111318] px-3 py-2 text-sm font-semibold text-white"
          >
            Today agenda
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[#8a9099]">Active PT packages</p>
          <p className="mt-2 text-2xl font-semibold">{currentPackages.length}</p>
        </div>
        <div className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[#8a9099]">Sessions remaining</p>
          <p className="mt-2 text-2xl font-semibold">
            {currentPackages.reduce((sum, pkg) => sum + Number(pkg.sessions_remaining), 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[#8a9099]">Completed PT</p>
          <p className="mt-2 text-2xl font-semibold">{completedSessions.length}</p>
        </div>
        <div className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[#8a9099]">Upcoming PT</p>
          <p className="mt-2 text-2xl font-semibold">{scheduledSessions.length}</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white">
        <div className="border-b border-[#eceef1] p-5">
          <h2 className="font-semibold">PT packages</h2>
          <p className="mt-1 text-sm text-[#7a7f89]">
            Purchased, used, remaining, dates, and assigned coach.
          </p>
        </div>
        <div className="divide-y divide-[#f0f1f3]">
          {packages.map((pkg) => {
            const used = Math.max(
              0,
              Number(pkg.sessions_purchased) - Number(pkg.sessions_remaining),
            );
            return (
              <div key={pkg.id} className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <p className="font-semibold">
                    {pkg.label || `${pkg.sessions_purchased} session PT package`}
                  </p>
                  <p className="mt-1 text-xs text-[#7a7f89]">
                    {trainerName(trainerNames, pkg.trainer_user_id)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#8a9099]">Purchased</p>
                  <p className="mt-1 font-semibold">{pkg.sessions_purchased}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#8a9099]">Used</p>
                  <p className="mt-1 font-semibold">{used}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#8a9099]">Remaining</p>
                  <p className="mt-1 font-semibold">{pkg.sessions_remaining}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#8a9099]">Dates</p>
                  <p className="mt-1 text-sm">
                    {pkg.starts_on ? formatDate(pkg.starts_on) : "Started"} →{" "}
                    {pkg.expires_on ? formatDate(pkg.expires_on) : "No expiry"}
                  </p>
                </div>
              </div>
            );
          })}
          {!packages.length && (
            <p className="p-5 text-sm text-[#7a7f89]">No PT packages yet.</p>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">This week&apos;s muscle targets</h2>
              <p className="mt-1 text-sm text-[#7a7f89]">
                Week starting {formatDate(weekStart)}. Progress resets by week; history is retained.
              </p>
            </div>
            {activeProgram && (
              <span className="rounded-full bg-[#f1f3f5] px-3 py-1 text-xs font-semibold">
                {activeProgram.name}
              </span>
            )}
          </div>

          {weekly.length > 0 ? (
            <>
              <div className="mt-4 space-y-3">
                {weekly.map((row) => (
                  <div key={row.muscle_group_id} className="rounded-xl bg-[#f7f8f9] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{row.muscle_name}</p>
                      <span className="text-sm font-semibold">
                        {row.completed_sessions} / {row.target_sessions}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e3e6ea]">
                      <div
                        className="h-full rounded-full bg-[#111318]"
                        style={{
                          width: `${Math.min(
                            100,
                            Number(row.target_sessions)
                              ? (Number(row.completed_sessions) / Number(row.target_sessions)) * 100
                              : 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-[#7a7f89]">
                      {Number(row.remaining_sessions) > 0
                        ? `${row.remaining_sessions} session${Number(row.remaining_sessions) === 1 ? "" : "s"} still to train`
                        : "Weekly target reached"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-950">Still to train this week</p>
                <p className="mt-1 text-sm text-amber-900">
                  {remainingThisWeek.length
                    ? remainingThisWeek
                        .map((row) => `${row.muscle_name} ×${row.remaining_sessions}`)
                        .join(" · ")
                    : "All weekly muscle targets are complete."}
                </p>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-[#7a7f89]">
              No weekly target program is active for this member.
            </p>
          )}

          {activeProgram && (
            <div className="mt-4 rounded-xl border border-[#e4e6ea] p-4">
              <p className="text-sm font-semibold">Current program</p>
              <p className="mt-1 text-sm text-[#707680]">
                {activeProgram.name} · {formatDate(activeProgram.starts_on)} →{" "}
                {activeProgram.ends_on ? formatDate(activeProgram.ends_on) : "ongoing"}
              </p>
              <p className="mt-1 text-xs text-[#8a9099]">
                Coach: {trainerName(trainerNames, activeProgram.trainer_user_id)}
              </p>
              {activeTargets.length > 0 && (
                <p className="mt-2 text-xs text-[#707680]">
                  Targets:{" "}
                  {activeTargets
                    .map(
                      (target) =>
                        `${target.muscle_groups?.name || "Muscle"} ${target.target_sessions_per_week}×`,
                    )
                    .join(" · ")}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5">
          <h2 className="font-semibold">Set weekly training targets</h2>
          <p className="mt-1 text-sm text-[#7a7f89]">
            Create a program such as Chest 2×, Back 2×, Core 3× per week.
          </p>

          {activeProgram ? (
            <div className="mt-4 rounded-xl bg-[#f7f8f9] p-4 text-sm text-[#666d77]">
              This member already has an active program. A new overlapping program is intentionally
              blocked to protect historical reporting.
            </div>
          ) : (
            <form action={createTrainingProgramAction} className="mt-4 space-y-4">
              <OperationKeyInput />
              <input type="hidden" name="member_id" value={id} />

              <label className="block text-sm">
                Program name
                <input
                  name="name"
                  required
                  defaultValue="Weekly training plan"
                  className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2"
                />
              </label>

              {ctx.role === "trainer" ? (
                <input type="hidden" name="trainer_user_id" value={ctx.userId} />
              ) : (
                <label className="block text-sm">
                  Coach
                  <select
                    name="trainer_user_id"
                    required
                    defaultValue={defaultTrainerId}
                    className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2"
                  >
                    {(trainersRes.data ?? []).map((trainer: any) => (
                      <option key={trainer.user_id} value={trainer.user_id}>
                        {trainer.profiles?.full_name || trainer.role}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Starts
                  <input
                    name="starts_on"
                    type="date"
                    required
                    defaultValue={today}
                    className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  Ends <span className="text-[#8a9099]">(optional)</span>
                  <input
                    name="ends_on"
                    type="date"
                    min={today}
                    className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2"
                  />
                </label>
              </div>

              <div>
                <p className="text-sm font-medium">Sessions per week</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {muscles.map((muscle) => (
                    <label
                      key={muscle.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#e2e5e9] px-3 py-2 text-sm"
                    >
                      <span>{muscle.name}</span>
                      <input
                        name={`target__${muscle.id}`}
                        type="number"
                        min="0"
                        max="14"
                        step="1"
                        placeholder="0"
                        className="w-16 rounded-md border border-[#dfe2e7] px-2 py-1 text-center"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <label className="block text-sm">
                Coach notes <span className="text-[#8a9099]">(optional)</span>
                <textarea
                  name="notes"
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2"
                />
              </label>

              <button
                data-feedback="Creating training program…"
                className="w-full rounded-lg bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Create weekly program
              </button>
            </form>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white">
        <div className="border-b border-[#eceef1] p-5">
          <h2 className="font-semibold">PT session history</h2>
          <p className="mt-1 text-sm text-[#7a7f89]">
            Each completed session keeps its muscle focus, exercises, sets, reps, weight, RPE, and coach notes.
          </p>
        </div>

        <div className="divide-y divide-[#f0f1f3]">
          {sessions.map((session) => {
            const workout = Array.isArray(session.pt_session_workouts)
              ? session.pt_session_workouts[0]
              : session.pt_session_workouts;
            const trained = sessionMuscles(session, true);
            const planned = sessionMuscles(session, false);
            const exercises = (session.pt_session_exercises ?? [])
              .slice()
              .sort((a: any, b: any) => Number(a.position) - Number(b.position));
            const pkg = packageById.get(session.pt_package_id);

            return (
              <details key={session.id} className="group p-5">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">
                        {formatDateTime(session.starts_at, ctx.organization.timezone)}
                      </p>
                      <p className="mt-1 text-sm text-[#707680]">
                        {trained.length
                          ? trained.join(", ")
                          : workout?.session_goal || planned.join(", ") || "No workout detail"}
                      </p>
                      <p className="mt-1 text-xs text-[#8a9099]">
                        {trainerName(trainerNames, session.trainer_user_id)}
                        {pkg ? ` · ${pkg.label || `${pkg.sessions_purchased} session package`}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#f0f2f4] px-2.5 py-1 text-xs font-semibold capitalize">
                      {String(session.status).replace("_", " ")}
                    </span>
                  </div>
                </summary>

                <div className="mt-4 space-y-4 border-t border-[#eceef1] pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-[#f7f8f9] p-3">
                      <p className="text-xs uppercase tracking-wide text-[#8a9099]">Muscles trained</p>
                      <p className="mt-1 text-sm font-medium">
                        {trained.length ? trained.join(", ") : "Not recorded"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#f7f8f9] p-3">
                      <p className="text-xs uppercase tracking-wide text-[#8a9099]">Session goal</p>
                      <p className="mt-1 text-sm font-medium">{workout?.session_goal || "—"}</p>
                    </div>
                  </div>

                  {workout?.coach_notes && (
                    <div className="rounded-xl border border-[#e4e6ea] p-3">
                      <p className="text-xs uppercase tracking-wide text-[#8a9099]">Coach notes</p>
                      <p className="mt-1 text-sm">{workout.coach_notes}</p>
                    </div>
                  )}

                  {exercises.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold">Exercises</p>
                      <div className="mt-2 space-y-3">
                        {exercises.map((exercise: any) => {
                          const sets = (exercise.pt_exercise_sets ?? [])
                            .slice()
                            .sort((a: any, b: any) => Number(a.set_number) - Number(b.set_number));
                          return (
                            <div key={exercise.id} className="rounded-xl border border-[#e4e6ea] p-3">
                              <p className="font-medium">{exercise.exercise_name}</p>
                              <div className="mt-2 space-y-1">
                                {sets.map((set: any) => (
                                  <p key={`${exercise.id}-${set.set_number}`} className="text-sm text-[#666d77]">
                                    Set {set.set_number}: {setSummary(set)}
                                  </p>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!exercises.length && session.status === "completed" && (
                    <p className="text-sm text-[#7a7f89]">
                      This session used simple muscle-only logging; no exercise detail was entered.
                    </p>
                  )}
                </div>
              </details>
            );
          })}

          {!sessions.length && (
            <p className="p-5 text-sm text-[#7a7f89]">No PT sessions for this member yet.</p>
          )}
        </div>
      </section>
    </section>
  );
}
