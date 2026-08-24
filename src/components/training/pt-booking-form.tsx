"use client";

import { useMemo, useState } from "react";
import { createPtSessionAction } from "@/app/actions";

type Member = { id: string; first_name: string; last_name: string };
type Trainer = { user_id: string; role: string; profiles: { full_name?: string | null } | null };
type Package = { id: string; member_id: string; sessions_purchased: number; sessions_remaining: number; expires_on: string | null };

export function PtBookingForm({ members, trainers, packages, timezone }: { members: Member[]; trainers: Trainer[]; packages: Package[]; timezone: string }) {
  const [memberId, setMemberId] = useState("");
  const eligiblePackages = useMemo(() => packages.filter((p) => p.member_id === memberId), [packages, memberId]);

  return <form action={createPtSessionAction} className="mt-4 grid gap-3 sm:grid-cols-2">
    <select name="member_id" required value={memberId} onChange={(e) => setMemberId(e.target.value)} className="rounded-lg border border-[#dfe2e7] px-3 py-2">
      <option value="">Member…</option>{members.map((m)=><option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
    </select>
    <select name="trainer_user_id" required className="rounded-lg border border-[#dfe2e7] px-3 py-2"><option value="">Trainer…</option>{trainers.map((t)=><option key={t.user_id} value={t.user_id}>{t.profiles?.full_name || t.role}</option>)}</select>
    <input name="starts_at" type="datetime-local" required className="rounded-lg border border-[#dfe2e7] px-3 py-2"/>
    <input name="duration_minutes" type="number" min="15" max="480" defaultValue="60" className="rounded-lg border border-[#dfe2e7] px-3 py-2"/>
    <select name="pt_package_id" disabled={!memberId} className="rounded-lg border border-[#dfe2e7] px-3 py-2 sm:col-span-2 disabled:bg-[#f5f6f7]">
      <option value="">{memberId ? "No package / standalone session" : "Choose a member first"}</option>
      {eligiblePackages.map((p)=><option key={p.id} value={p.id}>{p.sessions_remaining}/{p.sessions_purchased} sessions remaining{p.expires_on ? ` · expires ${p.expires_on}` : ""}</option>)}
    </select>
    <p className="text-xs text-[#8a9099] sm:col-span-2">Schedule is interpreted in {timezone}. Trainer conflicts are rejected by the database.</p>
    <button className="sm:col-span-2 rounded-lg bg-[#111318] px-4 py-2 text-sm font-semibold text-white">Book session</button>
  </form>;
}
