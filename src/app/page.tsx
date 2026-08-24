import Link from "next/link";

const features = [
  ["Members", "Profiles, photos, tags, notes and a complete activity timeline."],
  ["Memberships", "Plans, renewals, freezes, visit packs and expiry automation."],
  ["Check-in", "Fast QR, phone, member-ID or name-based reception workflows."],
  ["Payments", "Receipts, balances, payment methods, discounts and audit history."],
  ["Training", "PT packages, trainer calendars, bookings and attendance status."],
  ["Growth", "Leads, trials, follow-ups, campaigns and conversion reporting."],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#111318] text-white">
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        <div className="max-w-4xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-white/55">Working product foundation</p>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
            Run the gym. Grow the business. Keep every workflow connected.
          </h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-white/68">
            One system for members, memberships, check-ins, payments, personal training, leads and reporting — designed as a secure multi-tenant SaaS from day one.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/dashboard" className="rounded-xl bg-white px-5 py-3 font-semibold text-black">Open demo dashboard</Link>
            <Link href="/members" className="rounded-xl border border-white/20 px-5 py-3 font-semibold text-white">View members</Link>
          </div>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(([title, text]) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 leading-7 text-white/60">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
