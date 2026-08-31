"use client";

import { useMemo, useState } from "react";
import { OperationKeyInput } from "@/components/operation-key-input";
import { sellMembershipAction } from "@/app/(app)/front-desk/actions";

type Member = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
};

type Plan = {
  id: string;
  name: string;
  price_minor: number;
  currency: string;
  duration_days: number | null;
  included_visits: number | null;
  billing_type: string;
};

function amountInput(minor: number) {
  return (Number(minor) / 100).toFixed(2);
}

function money(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(minor) / 100);
}

export function MembershipSaleForm({
  members,
  plans,
  today,
}: {
  members: Member[];
  plans: Plan[];
  today: string;
}) {
  const [planId, setPlanId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === planId) ?? null,
    [planId, plans],
  );

  return (
    <form action={sellMembershipAction} className="space-y-5">
      <OperationKeyInput />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          Member
          <select
            name="member_id"
            required
            defaultValue=""
            className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] bg-white px-3 py-2.5"
          >
            <option value="">Choose member…</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.first_name} {member.last_name}
                {member.phone ? ` · ${member.phone}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium">
          Membership plan
          <select
            name="plan_id"
            required
            value={planId}
            onChange={(event) => {
              const nextId = event.target.value;
              setPlanId(nextId);
              const nextPlan = plans.find((plan) => plan.id === nextId);
              setAmountPaid(nextPlan ? amountInput(nextPlan.price_minor) : "");
            }}
            className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] bg-white px-3 py-2.5"
          >
            <option value="">Choose plan…</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} · {money(plan.price_minor, plan.currency)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedPlan && (
        <div className="grid gap-3 rounded-xl bg-[#f7f8f9] p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#8a9099]">Price</p>
            <p className="mt-1 text-sm font-semibold">
              {money(selectedPlan.price_minor, selectedPlan.currency)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#8a9099]">Duration</p>
            <p className="mt-1 text-sm font-semibold">
              {selectedPlan.duration_days
                ? `${selectedPlan.duration_days} days`
                : "Open-ended"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#8a9099]">Visits</p>
            <p className="mt-1 text-sm font-semibold">
              {selectedPlan.included_visits == null
                ? "Unlimited / plan rules"
                : `${selectedPlan.included_visits} visits`}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium">
          Starts on
          <input
            name="starts_on"
            type="date"
            required
            defaultValue={today}
            className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] bg-white px-3 py-2.5"
          />
        </label>

        <label className="text-sm font-medium">
          Amount paid today
          <input
            name="amount_paid"
            inputMode="decimal"
            required
            value={amountPaid}
            onChange={(event) => setAmountPaid(event.target.value)}
            placeholder="0.00"
            className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] bg-white px-3 py-2.5"
          />
          <span className="mt-1 block text-xs font-normal text-[#8a9099]">
            Full price is filled automatically. Edit it for a partial payment.
          </span>
        </label>

        <label className="text-sm font-medium">
          Payment method
          <select
            name="payment_method"
            defaultValue="cash"
            className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] bg-white px-3 py-2.5"
          >
            <option value="cash">Cash</option>
            <option value="card_terminal">Card terminal</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="whish">Whish</option>
            <option value="omt">OMT</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium">
        Note <span className="font-normal text-[#8a9099]">(optional)</span>
        <textarea
          name="note"
          rows={3}
          placeholder="Discount, installment note, sales context…"
          className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] bg-white px-3 py-2.5"
        />
      </label>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        Confirming this sale creates the active membership and payment ledger entry in the same
        database transaction. A receipt number is generated by the ledger.
      </div>

      <button
        data-feedback="Completing membership sale…"
        className="w-full rounded-xl bg-[#111318] px-4 py-3 text-sm font-semibold text-white"
      >
        Confirm membership & payment
      </button>
    </form>
  );
}
