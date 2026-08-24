import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/payments/print-button";
import { requireAppContext } from "@/lib/app-context";
import { formatDateTime, formatMoney, memberDisplayNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const { data: payment, error } = await ctx.supabase.from("payments")
    .select("id,receipt_number,amount_minor,currency,payment_method,status,paid_at,external_reference,note,member_id,members(member_number,first_name,last_name,phone,email),memberships(membership_plans(name))")
    .eq("organization_id",ctx.organization.id).eq("id",id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!payment) notFound();
  const member:any=payment.members;
  const membership:any=payment.memberships;
  return <main className="min-h-screen bg-[#f6f7f9] px-5 py-10 text-[#111318] print:bg-white print:p-0">
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between gap-3 print:hidden"><Link href="/payments" className="text-sm font-semibold">← Payments</Link><PrintButton/></div>
      <article className="rounded-2xl border border-[#dedfe2] bg-white p-7 sm:p-10 print:border-0 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-5 border-b border-[#eceef1] pb-7"><div><p className="text-2xl font-bold">{ctx.organization.name}</p><p className="mt-1 text-sm text-[#747a84]">{ctx.location.name}</p></div><div className="text-right"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#8a9099]">Receipt</p><p className="mt-1 text-xl font-semibold">#{payment.receipt_number}</p></div></div>
        <div className="grid gap-6 border-b border-[#eceef1] py-7 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#8a9099]">Received from</p><p className="mt-2 font-semibold">{member?.first_name} {member?.last_name}</p><p className="mt-1 text-sm text-[#747a84]">{memberDisplayNumber(member?.member_number)}{member?.phone?` · ${member.phone}`:""}</p></div><div className="sm:text-right"><p className="text-xs font-semibold uppercase tracking-wide text-[#8a9099]">Payment date</p><p className="mt-2 font-medium">{formatDateTime(payment.paid_at,ctx.organization.timezone)}</p><p className="mt-1 text-sm capitalize text-[#747a84]">{String(payment.payment_method).replaceAll("_"," ")} · {payment.status}</p></div></div>
        <div className="py-8"><div className="flex items-end justify-between gap-4"><div><p className="text-sm text-[#747a84]">{membership?.membership_plans?.name || "Gym payment"}</p>{payment.external_reference&&<p className="mt-1 text-xs text-[#8a9099]">Reference: {payment.external_reference}</p>}</div><p className="text-3xl font-semibold">{formatMoney(payment.amount_minor,payment.currency)}</p></div>{payment.note&&<p className="mt-5 rounded-xl bg-[#f7f8f9] p-4 text-sm">{payment.note}</p>}</div>
        <div className="border-t border-[#eceef1] pt-5 text-xs text-[#8a9099]">Generated from the gym’s payment ledger. Voids/refunds remain visible in the financial history.</div>
      </article>
    </div>
  </main>;
}
