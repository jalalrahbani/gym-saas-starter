import { NextResponse } from "next/server";
import { requireAppContext } from "@/lib/app-context";
import { ROLE_GROUPS, roleAllowed } from "@/lib/roles";

export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const ctx = await requireAppContext();
  if (!roleAllowed(ctx.role, ROLE_GROUPS.memberManagers)) {
    return NextResponse.json({ error: "Your role cannot export member data." }, { status: 403 });
  }

  const { data, error } = await ctx.supabase
    .from("members")
    .select("member_number,first_name,last_name,phone,email,date_of_birth,status,joined_at,created_at")
    .eq("organization_id", ctx.organization.id)
    .order("member_number");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const headers = ["member_number","first_name","last_name","phone","email","date_of_birth","status","joined_at","created_at"];
  const rows = [headers.join(","), ...(data ?? []).map((row: any) => headers.map((key) => csvCell(row[key])).join(","))];
  const filename = `${ctx.organization.slug}-members-${new Date().toISOString().slice(0,10)}.csv`;
  return new NextResponse(rows.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
