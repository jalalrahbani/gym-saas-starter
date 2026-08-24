"use client";

export default function ProductError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-6"><p className="text-sm font-semibold text-red-700">This action could not be completed</p><h1 className="mt-2 text-2xl font-semibold">Your existing data was left unchanged.</h1><p className="mt-3 text-sm leading-6 text-[#6f7580]">{error.message || "An unexpected application error occurred."}</p><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={reset} className="rounded-lg bg-[#111318] px-4 py-2 text-sm font-semibold text-white">Try again</button><a href="/dashboard" className="rounded-lg border border-[#dfe2e7] px-4 py-2 text-sm font-semibold">Return to dashboard</a></div></section>;
}
