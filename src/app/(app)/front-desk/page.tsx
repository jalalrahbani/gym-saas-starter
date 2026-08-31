import { AccessDenied } from "@/components/access-denied";
import { MembershipSaleForm } from "@/components/front-desk/membership-sale-form";
import { requireAppContext } from "@/lib/app-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ROLE_GROUPS, roleAllowed } from "@/lib/roles";
import { dateInTimeZone } from "@/lib/time";

export default async function FrontDeskPage() {
  const ctx = await requireAppContext();
  if (!roleAllowed(ctx.role, ROLE_GROUPS.membershipManagers)) {
    return <AccessDenied area="front desk membership sales" />;
  }

  const [membersRes, plansRes, recentRes] = await Promise.all([
    ctx.supabase
      .from("members")
      .select("id,first_name,last_name,phone")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("first_name")
      .order("last_name")
      .limit(1000),
    ctx.supabase
      .from("membership_plans")
      .select("id,name,price_minor,currency,duration_days,included_visits,billing_type")
      .eq("organization_id", ctx.organization.id)
      .eq("is_active", true)
      .order("name"),
    ctx.supabase
      .from("payments")
      .select(
        "id,receipt_number,amount_minor,currency,payment_method,paid_at,members(first_name,last_name),memberships(membership_plans(name))",
      )
      .eq("organization_id", ctx.organization.id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(8),
  ]);

  if (membersRes.error) throw new Error(membersRes.error.message);
  if (plansRes.error) throw new Error(plansRes.error.message);
  if (recentRes.error) throw new Error(recentRes.error.message);

  const members = (membersRes.data ?? []) as any[];
  const plans = (plansRes.data ?? []) as any[];
  const recent = (recentRes.data ?? []) as any[];
  const today = dateInTimeZone(new Date(), ctx.organization.timezone);

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[#7a7f89]">Owner / reception workflow</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Front desk</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#7a7f89]">
            Choose a member, activate a membership, record today’s payment, and open the receipt
            immediately after confirmation.
          </p>
        </div>
        <a
          href="/members?new=1"
          className="rounded-xl border border-[#111318] bg-white px-4 py-2.5 text-sm font-semibold"
        >
          + New member
        </a>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a9099]">1 · Member</p>
          <p className="mt-2 text-sm font-semibold">Create or choose the client</p>
          <p className="mt-1 text-xs text-[#7a7f89]">New members can be added from the button above.</p>
        </div>
        <div className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a9099]">2 · Sale</p>
          <p className="mt-2 text-sm font-semibold">Plan + payment</p>
          <p className="mt-1 text-xs text-[#7a7f89]">The membership and initial payment are transactional.</p>
        </div>
        <div className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a9099]">3 · Receipt</p>
          <p className="mt-2 text-sm font-semibold">Print, save PDF, or WhatsApp</p>
          <p className="mt-1 text-xs text-[#7a7f89]">The immutable ledger receipt opens automatically.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="font-semibold">New membership sale</h2>
            <p className="mt-1 text-sm text-[#7a7f89]">
              Full plan price is prefilled after you choose the plan, but partial payments are allowed.
            </p>
          </div>

          {!members.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              No active members yet. Create the member first.
            </div>
          ) : !plans.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              No active membership plans are available. Create or activate a plan in Memberships.
            </div>
          ) : (
            <MembershipSaleForm members={members} plans={plans} today={today} />
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white">
          <div className="border-b border-[#eceef1] p-5">
            <h2 className="font-semibold">Recent receipts</h2>
            <p className="mt-1 text-sm text-[#7a7f89]">Latest paid transactions at this organization.</p>
          </div>
          <div className="divide-y divide-[#f0f1f3]">
            {recent.map((payment: any) => {
              const membership: any = payment.memberships;
              return (
                <a
                  key={payment.id}
                  href={`/receipts/${payment.id}`}
                  className="block p-4 transition hover:bg-[#fafbfc]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {payment.members?.first_name} {payment.members?.last_name}
                      </p>
                      <p className="mt-1 text-xs text-[#7a7f89]">
                        Receipt #{payment.receipt_number}
                        {membership?.membership_plans?.name
                          ? ` · ${membership.membership_plans.name}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-[#8a9099]">
                        {formatDateTime(payment.paid_at, ctx.organization.timezone)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatMoney(payment.amount_minor, payment.currency)}
                    </p>
                  </div>
                </a>
              );
            })}
            {!recent.length && (
              <p className="p-5 text-sm text-[#7a7f89]">No paid receipts yet.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
