import Link from "next/link";

const modules = [
  ["01", "Member CRM", "Every contact detail, membership, payment, visit, note and engagement signal in one member timeline."],
  ["02", "Access intelligence", "QR, barcode, RFID/NFC-ready access workflows with eligibility checks, live sessions and visit history."],
  ["03", "Revenue operations", "Plans, renewals, visit packs, freezes, receipts and immutable payment history built around real gym workflows."],
  ["04", "PT & classes", "Trainer calendars, PT packages, booking conflict prevention, class capacity and waitlists from one workspace."],
  ["05", "Retention engine", "Spot expiring, at-risk and inactive members, recognize streaks and open personalized WhatsApp follow-ups."],
  ["06", "Multi-location control", "Give owners a unified view while keeping branches, schedules, staff and operational activity location-aware."],
];

const pulseBars = [42, 61, 48, 72, 56, 84, 68, 92, 74, 88, 63, 96, 79, 89];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#05070b] text-white">
      <section className="relative min-h-[860px] border-b border-white/10">
        <div className="landing-grid absolute inset-0 opacity-35" />
        <div className="fx-orb fx-orb-one pointer-events-none absolute left-[8%] top-28 h-[28rem] w-[28rem] rounded-full bg-violet-600/25 blur-[100px]" />
        <div className="fx-orb fx-orb-two pointer-events-none absolute right-[4%] top-10 h-[34rem] w-[34rem] rounded-full bg-cyan-500/15 blur-[110px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

        <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-7 lg:px-10">
          <nav className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 backdrop-blur-xl sm:px-5">
            <Link href="/" className="flex items-center gap-3">
              <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white text-sm font-black text-[#06080d]">
                G
                <span className="absolute inset-x-1 bottom-1 h-px bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400" />
              </span>
              <div>
                <p className="text-sm font-bold tracking-tight sm:text-base">Gym Operations Platform</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Connected gym intelligence</p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <Link href="/login" className="rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-[#061016] shadow-[0_0_30px_rgba(103,232,249,0.22)] transition hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg,#a7f3d0 0%,#67e8f9 52%,#c4b5fd 100%)" }}
              >
                Start free trial
              </Link>
            </div>
          </nav>

          <div className="grid items-center gap-14 pb-10 pt-20 lg:grid-cols-[1.02fr_.98fr] lg:pt-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-semibold text-cyan-100">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_14px_#67e8f9]" />
                Built for modern multi-location gyms
              </div>

              <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[76px]">
                Your gym,
                <span className="block bg-gradient-to-r from-white via-cyan-100 to-violet-300 bg-clip-text text-transparent">
                  running as one system.
                </span>
              </h1>

              <p className="mt-7 max-w-2xl text-base leading-7 text-white/58 sm:text-lg sm:leading-8">
                Replace disconnected spreadsheets, front-desk workarounds and scattered follow-ups with one operating system for members, access, payments, PT, classes, leads, retention and reporting.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="rounded-xl px-6 py-3.5 text-sm font-black text-[#071014] shadow-[0_14px_40px_rgba(103,232,249,0.18)] transition hover:-translate-y-0.5"
                  style={{ background: "linear-gradient(135deg,#d1fae5 0%,#67e8f9 48%,#c4b5fd 100%)" }}
                >
                  Create your gym →
                </Link>
                <Link href="/login" className="rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/[0.09]">
                  Open workspace
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-white/42">
                <span>14-day trial</span>
                <span>Multi-tenant architecture</span>
                <span>Custom gym branding</span>
                <span>WhatsApp-ready workflows</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[640px]">
              <div className="absolute -inset-8 rounded-[40px] bg-gradient-to-br from-violet-500/15 via-transparent to-cyan-400/15 blur-2xl" />
              <div className="hero-console relative overflow-hidden rounded-[28px] border border-white/12 bg-[#0b0f17]/90 p-3 shadow-[0_45px_120px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/8 px-3 pb-3 pt-1">
                  <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400/70"/><span className="h-2.5 w-2.5 rounded-full bg-amber-300/70"/><span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70"/></div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/28">Live operations view</p>
                  <span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[8px] font-bold text-emerald-200">SYSTEM ONLINE</span>
                </div>

                <div className="grid min-h-[480px] grid-cols-[118px_1fr] overflow-hidden rounded-b-[20px]">
                  <aside className="border-r border-white/8 bg-white/[0.025] p-3">
                    <div className="mb-6 flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-400 to-cyan-300 text-[10px] font-black text-[#071014]">A</span>
                      <div><p className="text-[9px] font-bold">Apex Fitness</p><p className="text-[7px] text-white/30">Downtown</p></div>
                    </div>
                    {["Dashboard","Members","Access","Payments","Training","Classes","Messages"].map((item,index)=><div key={item} className={`mb-1 rounded-md px-2 py-2 text-[8px] ${index===0?"bg-white text-black font-bold":"text-white/42"}`}>{item}</div>)}
                  </aside>

                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div><p className="text-[8px] text-white/30">Wednesday · Downtown</p><h2 className="mt-1 text-base font-semibold">Good evening, Maya.</h2></div>
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-400 to-cyan-300 text-[8px] font-black text-[#071014]">MK</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[["Members","684","+18"],["Visits today","126","+9%"],["Renewals","18","Due"],["Revenue","$31.4k","+12%"]].map(([label,value,meta])=><div key={label} className="rounded-xl border border-white/8 bg-white/[0.04] p-3"><p className="text-[7px] text-white/30">{label}</p><p className="mt-1 text-sm font-bold">{value}</p><p className="mt-1 text-[7px] text-emerald-300/80">{meta}</p></div>)}
                    </div>

                    <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.035] p-3">
                      <div className="flex items-center justify-between"><div><p className="text-[9px] font-bold">Attendance pulse</p><p className="mt-0.5 text-[7px] text-white/28">Live traffic across today</p></div><span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[7px] font-bold text-cyan-200">LIVE</span></div>
                      <div className="mt-4 flex h-24 items-end gap-1.5">
                        {pulseBars.map((height,index)=><span key={index} className="pulse-bar flex-1 rounded-t-sm bg-gradient-to-t from-violet-500/70 to-cyan-300/90" style={{height:`${height}%`,animationDelay:`${index*70}ms`}}/>)}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-[1.1fr_.9fr]">
                      <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3">
                        <div className="flex items-center justify-between"><p className="text-[9px] font-bold">Retention radar</p><span className="text-[7px] text-white/28">Auto-segmented</span></div>
                        <div className="mt-3 space-y-2">
                          {[["Maya Haddad","Renewal in 2 days","bg-amber-300"],["Karim Saad","At risk · 12 days absent","bg-violet-300"],["Rami T.","14-day visit streak","bg-emerald-300"]].map(([name,status,dot])=><div key={name} className="flex items-center gap-2 rounded-lg bg-black/15 p-2"><span className={`h-1.5 w-1.5 rounded-full ${dot}`}/><div><p className="text-[8px] font-semibold">{name}</p><p className="text-[7px] text-white/30">{status}</p></div></div>)}
                        </div>
                      </div>
                      <div className="relative overflow-hidden rounded-xl border border-white/8 bg-gradient-to-br from-violet-500/15 to-cyan-300/5 p-3">
                        <div className="scan-line absolute inset-x-0 h-px bg-cyan-200/80 shadow-[0_0_12px_#67e8f9]" />
                        <p className="text-[9px] font-bold">Access desk</p>
                        <div className="mt-4 grid place-items-center rounded-lg border border-dashed border-cyan-200/20 bg-black/20 py-7">
                          <div className="grid h-12 w-12 place-items-center rounded-full border border-cyan-200/30 bg-cyan-300/5 text-xl">✓</div>
                          <p className="mt-2 text-[8px] font-bold text-cyan-100">ACCESS GRANTED</p>
                          <p className="mt-1 text-[7px] text-white/28">Member 00482</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-5 left-6 rounded-xl border border-white/10 bg-[#0d121c]/90 px-4 py-3 shadow-2xl backdrop-blur">
                <p className="text-[8px] uppercase tracking-[0.16em] text-white/30">One connected record</p>
                <p className="mt-1 text-xs font-semibold">Member → payment → access → retention</p>
              </div>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/8 bg-white/8 sm:grid-cols-4">
            {[["Reception","Faster check-ins"],["Owners","Live KPIs"],["Trainers","Clean schedules"],["Members","Better follow-up"]].map(([title,text])=><div key={title} className="bg-[#080b11] p-5"><p className="text-xs font-bold">{title}</p><p className="mt-1 text-[11px] text-white/35">{text}</p></div>)}
          </div>
        </div>
      </section>

      <section className="relative border-b border-white/8 bg-[#080b11]">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200/65">One source of truth</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Everything your gym does, connected.</h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-white/45 lg:justify-self-end">
              The system is built around a shared operational record instead of isolated modules. A renewal affects access. A visit influences retention. PT and class activity live beside the member profile. Owners see the whole business without rebuilding the story in Excel.
            </p>
          </div>

          <div className="mt-14 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {modules.map(([number,title,text])=><article key={title} className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025] p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/20 hover:bg-white/[0.045]">
              <div className="absolute right-4 top-3 text-5xl font-black tracking-tighter text-white/[0.025]">{number}</div>
              <p className="text-[10px] font-bold tracking-[0.18em] text-cyan-200/45">{number}</p>
              <h3 className="mt-6 text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/40">{text}</p>
              <div className="mt-6 h-px w-10 bg-gradient-to-r from-violet-400 to-cyan-300 transition-all duration-300 group-hover:w-20" />
            </article>)}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-white/8 bg-[#05070b]">
        <div className="pointer-events-none absolute inset-0 landing-grid opacity-20" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 lg:px-10">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200/65">Make it yours</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Your software should look like your gym.</h2>
              <p className="mt-6 max-w-xl text-sm leading-7 text-white/45">
                New owners can brand the workspace during setup with their logo, profile photo and color palette. The interface adapts to the gym identity while keeping the operational structure consistent for every team.
              </p>
              <div className="mt-8 flex flex-wrap gap-2 text-xs">
                {["Gym logo","Owner avatar","Accent color","Workspace background","Sidebar theme"].map(item=><span key={item} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-white/55">{item}</span>)}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4 shadow-[0_30px_90px_rgba(0,0,0,.35)]">
              <div className="grid gap-3 sm:grid-cols-3">
                {[["Midnight","#7c3aed","#111827","#f6f7fb"],["Electric","#2563eb","#0f172a","#f4f8ff"],["Forest","#059669","#102c26","#f3f8f6"]].map(([name,accent,sidebar,bg])=><div key={name} className="overflow-hidden rounded-2xl border border-white/10">
                  <div className="grid h-36 grid-cols-[38%_62%]">
                    <div style={{backgroundColor:sidebar}} className="p-2"><div className="h-6 w-6 rounded-md" style={{backgroundColor:accent}}/><div className="mt-4 space-y-2">{[1,2,3,4].map(i=><div key={i} className="h-2 rounded-full bg-white/10"/>)}</div></div>
                    <div style={{backgroundColor:bg}} className="p-2"><div className="h-5 rounded bg-white"/><div className="mt-2 grid grid-cols-2 gap-1">{[1,2,3,4].map(i=><div key={i} className="h-9 rounded bg-white shadow-sm"/>)}</div></div>
                  </div>
                  <div className="bg-[#0b0f17] px-3 py-2.5 text-xs font-semibold">{name}</div>
                </div>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#080b11]">
        <div className="mx-auto max-w-7xl px-6 py-24 text-center lg:px-10">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200/60">Your gym. One operating system.</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Build the workspace your team actually wants to use.</h2>
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-white/42">Start with your gym identity, then run memberships, payments, access, PT, classes, retention and reporting from the same connected platform.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="rounded-xl px-6 py-3.5 text-sm font-black text-[#071014] transition hover:-translate-y-0.5" style={{background:"linear-gradient(135deg,#d1fae5,#67e8f9 48%,#c4b5fd)"}}>Start 14-day trial →</Link>
              <Link href="/login" className="rounded-xl border border-white/15 bg-white/[0.035] px-6 py-3.5 text-sm font-bold text-white">Sign in</Link>
            </div>
          </div>
          <div className="mt-20 border-t border-white/8 pt-7 text-xs text-white/25">Gym Operations Platform · Multi-tenant SaaS · Built for modern gym operations</div>
        </div>
      </section>
    </main>
  );
}
