import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/payments/print-button";
import { requireAppContext } from "@/lib/app-context";
import { formatDateTime, formatMoney, memberDisplayNumber } from "@/lib/format";
import { whatsappHref } from "@/lib/member-insights";
import { ROLE_GROUPS, roleAllowed } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sale?: string }>;
}) {
  const { id } = await params;
  const saleCompleted = (await searchParams).sale === "1";
  const ctx = await requireAppContext();
  if (!roleAllowed(ctx.role, ROLE_GROUPS.financial)) notFound();

  const { data: payment, error } = await ctx.supabase
    .from("payments")
    .select(
      "id,receipt_number,amount_minor,currency,payment_method,status,paid_at,external_reference,note,member_id,members(member_number,first_name,last_name,phone,email),memberships(membership_plans(name))",
    )
    .eq("organization_id", ctx.organization.id)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!payment) notFound();

  const member: any = payment.members;
  const membership: any = payment.memberships;
  const planName = membership?.membership_plans?.name || "Gym payment";
  const amountDisplay = formatMoney(payment.amount_minor, payment.currency);
  const paidAtDisplay = formatDateTime(payment.paid_at, ctx.organization.timezone);
  const methodDisplay = String(payment.payment_method).replaceAll("_", " ");

  const receiptMessage = [
    `Hi ${member?.first_name || "there"}, thank you for your payment to ${ctx.organization.name}.`,
    `Receipt #${payment.receipt_number}: ${amountDisplay} for ${planName}.`,
    `Paid ${paidAtDisplay} via ${methodDisplay}.`,
    "Thank you.",
  ].join("\n");

  const whatsapp = whatsappHref(member?.phone ?? null, receiptMessage);

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-5 py-10 text-[#111318] print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl">
        {saleCompleted && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 print:hidden">
            <p className="text-sm font-semibold text-emerald-950">Membership sale completed</p>
            <p className="mt-1 text-sm text-emerald-900">
              The membership is active and payment was recorded. Receipt #{payment.receipt_number} is ready.
            </p>
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/front-desk"
              className="rounded-lg border border-[#dfe2e7] bg-white px-3 py-2 text-sm font-semibold"
            >
              ← Front desk
            </Link>
            <Link
              href={`/members/${payment.member_id}`}
              className="rounded-lg border border-[#dfe2e7] bg-white px-3 py-2 text-sm font-semibold"
            >
              Member profile
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-emerald-700 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800"
              >
                Send on WhatsApp
              </a>
            ) : (
              <span className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-900">
                Add member phone for WhatsApp
              </span>
            )}
            <PrintButton />
          </div>
        </div>

        <article className="rounded-2xl border border-[#dedfe2] bg-white p-7 sm:p-10 print:border-0 print:p-0">
          <div className="flex flex-wrap items-start justify-between gap-5 border-b border-[#eceef1] pb-7">
            <div>
              <p className="text-2xl font-bold">{ctx.organization.name}</p>
              <p className="mt-1 text-sm text-[#747a84]">{ctx.location.name}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#8a9099]">Receipt</p>
              <p className="mt-1 text-xl font-semibold">#{payment.receipt_number}</p>
            </div>
          </div>

          <div className="grid gap-6 border-b border-[#eceef1] py-7 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a9099]">Received from</p>
              <p className="mt-2 font-semibold">
                {member?.first_name} {member?.last_name}
              </p>
              <p className="mt-1 text-sm text-[#747a84]">
                {memberDisplayNumber(member?.member_number)}
                {member?.phone ? ` · ${member.phone}` : ""}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a9099]">Payment date</p>
              <p className="mt-2 font-medium">{paidAtDisplay}</p>
              <p className="mt-1 text-sm capitalize text-[#747a84]">
                {methodDisplay} · {payment.status}
              </p>
            </div>
          </div>

          <div className="py-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-[#747a84]">{planName}</p>
                {payment.external_reference && (
                  <p className="mt-1 text-xs text-[#8a9099]">
                    Reference: {payment.external_reference}
                  </p>
                )}
              </div>
              <p className="text-3xl font-semibold">{amountDisplay}</p>
            </div>
            {payment.note && (
              <p className="mt-5 rounded-xl bg-[#f7f8f9] p-4 text-sm">{payment.note}</p>
            )}
          </div>

          <div className="border-t border-[#eceef1] pt-5 text-xs text-[#8a9099]">
            Generated from the gym’s immutable payment ledger. Voids/refunds remain visible in financial history.
          </div>
        </article>
      </div>
    </main>
  );
}
