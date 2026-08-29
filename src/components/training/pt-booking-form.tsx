"use client";

import { useMemo, useState } from "react";
import { createPtSessionAction } from "@/app/actions";
import { OperationKeyInput } from "@/components/operation-key-input";

type Member = { id: string; first_name: string; last_name: string };
type Trainer = {
  user_id: string;
  role: string;
  profiles: { full_name?: string | null } | null;
};
type Package = {
  id: string;
  member_id: string;
  sessions_purchased: number;
  sessions_remaining: number;
  expires_on: string | null;
};

export function PtBookingForm({
  members,
  trainers,
  packages,
  timezone,
  currentUserId,
  role,
}: {
  members: Member[];
  trainers: Trainer[];
  packages: Package[];
  timezone: string;
  currentUserId: string;
  role: string;
}) {
  const [memberId, setMemberId] = useState("");
  const eligiblePackages = useMemo(
    () => packages.filter((pkg) => pkg.member_id === memberId),
    [packages, memberId],
  );
  const isTrainer = role === "trainer";
  const selfTrainer = trainers.find((trainer) => trainer.user_id === currentUserId);

  return (
    <form action={createPtSessionAction} className="mt-4 grid gap-3 sm:grid-cols-2">
      <OperationKeyInput />
      <select
        name="member_id"
        required
        value={memberId}
        onChange={(event) => setMemberId(event.target.value)}
        className="rounded-lg border border-[#dfe2e7] px-3 py-2"
      >
        <option value="">Member…</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.first_name} {member.last_name}
          </option>
        ))}
      </select>

      {isTrainer ? (
        <>
          <input type="hidden" name="trainer_user_id" value={currentUserId} />
          <div className="rounded-lg border border-[#dfe2e7] bg-[#f7f8f9] px-3 py-2 text-sm font-medium">
            Trainer: {selfTrainer?.profiles?.full_name || "You"}
          </div>
        </>
      ) : (
        <select
          name="trainer_user_id"
          required
          className="rounded-lg border border-[#dfe2e7] px-3 py-2"
        >
          <option value="">Trainer…</option>
          {trainers.map((trainer) => (
            <option key={trainer.user_id} value={trainer.user_id}>
              {trainer.profiles?.full_name || trainer.role}
            </option>
          ))}
        </select>
      )}

      <input
        name="starts_at"
        type="datetime-local"
        required
        className="rounded-lg border border-[#dfe2e7] px-3 py-2"
      />
      <input
        name="duration_minutes"
        type="number"
        min="15"
        max="480"
        defaultValue="60"
        className="rounded-lg border border-[#dfe2e7] px-3 py-2"
      />
      <select
        name="pt_package_id"
        disabled={!memberId}
        className="rounded-lg border border-[#dfe2e7] px-3 py-2 sm:col-span-2 disabled:bg-[#f5f6f7]"
      >
        <option value="">
          {memberId ? "No package / standalone session" : "Choose a member first"}
        </option>
        {eligiblePackages.map((pkg) => (
          <option key={pkg.id} value={pkg.id}>
            {pkg.sessions_remaining}/{pkg.sessions_purchased} sessions remaining
            {pkg.expires_on ? ` · expires ${pkg.expires_on}` : ""}
          </option>
        ))}
      </select>

      <p className="text-xs text-[#8a9099] sm:col-span-2">
        Schedule is interpreted in {timezone}. PT and class conflicts are checked
        together before the booking is committed.
      </p>
      <button
        data-feedback="Booking PT session…"
        className="sm:col-span-2 rounded-lg bg-[#111318] px-4 py-2 text-sm font-semibold text-white"
      >
        Book session
      </button>
    </form>
  );
}
