import Link from "next/link";

const features = [
  ["Members", "One profile for contact details, photo, notes, memberships, payments, access cards and attendance history."],
  ["Access & attendance", "Swipe, tap or scan at reception. Eligibility is checked instantly and every arrival, exit and visit duration is recorded."],
  ["Memberships", "Create plans, renew members, handle visit packs and freezes, and surface upcoming expiries automatically."],
  ["Payments", "Track cash, terminal, transfer and other payments with balances, receipt numbers and non-destructive financial history."],
  ["Training & classes", "Manage PT packages, trainer calendars, class capacity, bookings and waitlists from the same member data."],
  ["Growth & reporting", "Convert leads, follow up on renewals, identify inactive members and understand attendance, revenue and conversion."],
];

const flow = [
  "Capture a lead or create/import a member",
  "Assign the right membership and record payment",
  "Issue a QR/card/RFID credential",
  "Track check-in, check-out and time in the gym",
  "Book PT and classes from the same profile",
  "Surface renewals, follow-ups and business performance",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#111318] text-white">
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-24">
        <nav className="flex items-center justify-between gap-4">
          <div><p className="text-lg font-bold tracking-tight">Gym Operations Platform</p><p className="text-xs text-white/45">working product name</p></div>
          <div className="flex gap-2"><Link href="/login" className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold">Sign in</Link><Link href="/signup" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">Start free trial</Link></div>
        </nav>

        <div className="mt-20 max-w-4xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-white/50">From first enquiry to every visit after</p>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">Run your whole gym from one connected workspace.</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-white/68">Members, renewals, payments, card access, check-ins and check-outs, PT, classes, leads and reporting all use the same record—so reception moves faster and owners stop reconciling disconnected spreadsheets.</p>
          <div className="mt-9 flex flex-wrap gap-3"><Link href="/signup" className="rounded-xl bg-white px-5 py-3 font-semibold text-black">Create your gym</Link><Link href="/login" className="rounded-xl border border-white/20 px-5 py-3 font-semibold text-white">Sign in</Link></div>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(([title,text])=><article key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 leading-7 text-white/60">{text}</p></article>)}</div>

        <section className="mt-20 rounded-3xl border border-white/10 bg-white/[0.04] p-7 lg:p-10"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">The daily flow</p><div className="mt-7 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{flow.map((item,index)=><div key={item} className="flex gap-3 rounded-xl bg-black/15 p-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-black">{index+1}</span><p className="text-sm leading-6 text-white/75">{item}</p></div>)}</div></section>
      </section>
    </main>
  );
}
