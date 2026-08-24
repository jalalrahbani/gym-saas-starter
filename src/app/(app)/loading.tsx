export default function ProductLoading() {
  return <section className="mx-auto max-w-7xl animate-pulse"><div className="h-4 w-28 rounded bg-[#e4e6ea]"/><div className="mt-3 h-9 w-72 max-w-full rounded bg-[#e4e6ea]"/><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:4}).map((_,i)=><div key={i} className="h-28 rounded-2xl border border-[#e4e6ea] bg-white"/>)}</div><div className="mt-6 h-72 rounded-2xl border border-[#e4e6ea] bg-white"/></section>;
}
