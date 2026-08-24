"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white print:hidden">Print / Save PDF</button>;
}
