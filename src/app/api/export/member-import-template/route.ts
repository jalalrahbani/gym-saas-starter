import { NextResponse } from "next/server";
import { requireAppContext } from "@/lib/app-context";

export async function GET() {
  await requireAppContext();
  const csv = 'Full Name,Phone,Email,Date of Birth,Join Date,Status\r\n"Jane Doe","+96170000000","jane@example.com","1995-05-14","2026-08-25","active"\r\n';
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="member-import-template.csv"', "cache-control": "private, no-store" } });
}
