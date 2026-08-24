"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { durationBetween, formatDateTime } from "@/lib/format";

type Visit = { id: string; checked_in_at: string; checked_out_at: string | null; members: { first_name: string; last_name: string } | null };
type Result = { result?: "allowed" | "denied" | "ignored"; action?: "in" | "out"; message?: string; member?: { first_name: string; last_name: string; member_number: number }; error?: string };

export function CheckInTerminal({ initialInside, initialVisits, timezone }: { initialInside: number; initialVisits: Visit[]; timezone: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"toggle" | "check_in" | "check_out">("toggle");
  const [scan, setScan] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>({ message: "Swipe, tap, scan, or search for a member." });

  async function process(event: FormEvent) {
    event.preventDefault();
    const value = scan.trim();
    if (!value || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/access/process", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scan: value, mode }) });
      const body = await response.json() as Result;
      setResult(body);
      if (response.ok) router.refresh();
    } catch {
      setResult({ error: "The access request could not be completed. Check the network connection and try again." });
    } finally {
      setPending(false);
      setScan("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  const status = result.error ? "error" : result.result ?? "neutral";
  return <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
    <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a9099]">Front desk terminal</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Member access</h2><p className="mt-1 max-w-xl text-sm text-[#727883]">Keyboard-wedge card/RFID readers, QR scanners, member numbers, phone numbers and exact names all enter through one field.</p></div><div className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-right"><p className="text-xs text-[#7b818b]">Currently inside</p><p className="text-2xl font-semibold">{initialInside}</p></div></div>
      <div className="mt-6 flex flex-wrap gap-2" aria-label="Terminal mode">{([['toggle','Smart in / out'],['check_in','Check-in only'],['check_out','Check-out only']] as const).map(([value,label])=><button type="button" key={value} onClick={()=>setMode(value)} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode===value?'bg-[#111318] text-white':'border border-[#e1e4e8] bg-white text-[#505660]'}`}>{label}</button>)}</div>
      <form onSubmit={process} className="mt-6"><label htmlFor="access-scan" className="text-sm font-semibold">Swipe / tap / scan</label><div className="mt-2 flex gap-2"><input ref={inputRef} id="access-scan" autoFocus autoComplete="off" value={scan} onChange={(e)=>setScan(e.target.value)} placeholder="Card, M-00001, phone, or member name" className="min-w-0 flex-1 rounded-xl border border-[#dcdfe4] px-4 py-3 text-base outline-none focus:border-[#111318]" /><button disabled={pending} className="rounded-xl bg-[#111318] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending?'Checking…':'Process'}</button></div></form>
      <div aria-live="polite" className={`mt-6 rounded-2xl border p-5 ${status==='allowed'?'border-emerald-200 bg-emerald-50/50':status==='denied'||status==='error'?'border-red-200 bg-red-50/50':status==='ignored'?'border-amber-200 bg-amber-50/50':'border-[#e4e6ea] bg-[#fafbfc]'}`}><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold">{result.error || result.message}</p>{result.member && <p className="mt-1 text-sm text-[#747a84]">{result.member.first_name} {result.member.last_name} · M-{String(result.member.member_number).padStart(5,'0')}</p>}</div>{result.action && <span className="rounded-full border border-current/10 bg-white px-3 py-1 text-xs font-semibold uppercase">{result.result==='allowed' ? (result.action==='in'?'Checked in':'Checked out') : result.result}</span>}</div></div>
    </section>
    <section className="rounded-2xl border border-[#e4e6ea] bg-white"><div className="border-b border-[#eceef1] p-5"><h2 className="font-semibold">Recent visits</h2><p className="mt-1 text-sm text-[#7a7f89]">Live check-in, check-out and duration.</p></div><div className="divide-y divide-[#f0f1f3]">{initialVisits.length===0?<div className="p-5 text-sm text-[#7d838d]">No visits recorded yet.</div>:initialVisits.map((visit)=><div key={visit.id} className="p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{visit.members?.first_name} {visit.members?.last_name}</p><span className="text-xs font-semibold">{visit.checked_out_at?'Completed':'Inside'}</span></div><p className="mt-1 text-xs text-[#858b94]">In {formatDateTime(visit.checked_in_at,timezone)} · Out {visit.checked_out_at?formatDateTime(visit.checked_out_at,timezone):'—'} · {durationBetween(visit.checked_in_at,visit.checked_out_at)}</p></div>)}</div></section>
  </div>;
}
