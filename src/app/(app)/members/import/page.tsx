import Link from "next/link";
import { importMembersCsvAction } from "@/app/actions";
import { requireAppContext } from "@/lib/app-context";

export default async function MemberImportPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const ctx = await requireAppContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  return <section className="mx-auto max-w-3xl space-y-6">
    <div><Link href="/members" className="text-sm font-semibold">← Members</Link><p className="mt-5 text-sm text-[#7a7f89]">Data migration</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Import members</h1><p className="mt-2 text-sm leading-6 text-[#7a7f89]">Export your existing Excel sheet as CSV, review the columns, and import up to 5,000 member profiles in one atomic operation. If any row is invalid, none of the rows are written.</p></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    <section className="rounded-2xl border border-[#e4e6ea] bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">CSV format</h2><p className="mt-1 text-sm text-[#7a7f89]">Full Name or First Name + Last Name is required. Dates use YYYY-MM-DD.</p></div><a href="/api/export/member-import-template" className="rounded-lg border border-[#dfe2e7] px-3 py-2 text-sm font-semibold">Download template</a></div><div className="mt-4 overflow-x-auto rounded-xl bg-[#f7f8f9] p-4 text-xs"><code>Full Name,Phone,Email,Date of Birth,Join Date,Status</code></div></section>
    <section className="rounded-2xl border border-[#e4e6ea] bg-white p-6"><form action={importMembersCsvAction} className="space-y-4"><label className="block text-sm font-medium">Home location<select name="home_location_id" defaultValue={ctx.location.id} className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-2.5">{ctx.locations.map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label className="block text-sm font-medium">CSV file<input name="file" type="file" accept=".csv,text/csv" required className="mt-1.5 block w-full rounded-xl border border-[#dfe2e7] bg-white px-3 py-2.5 text-sm"/></label><button className="w-full rounded-xl bg-[#111318] px-4 py-3 text-sm font-semibold text-white">Validate & import members</button></form></section>
  </section>;
}
