import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: organizations, error } = await admin.from("organizations").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let closed = 0;
  let expiredMemberships = 0;
  const failures: string[] = [];
  for (const organization of organizations ?? []) {
    const { data, error: closeError } = await admin.rpc("auto_close_stale_attendance", {
      p_organization_id: organization.id,
      p_max_hours: 12,
    });
    if (closeError) failures.push(`${organization.id} attendance: ${closeError.message}`);
    else closed += Number(data ?? 0);
    const { data: expired, error: expiryError } = await admin.rpc("expire_stale_memberships", { p_organization_id: organization.id });
    if (expiryError) failures.push(`${organization.id} memberships: ${expiryError.message}`);
    else expiredMemberships += Number(expired ?? 0);
  }

  return NextResponse.json({ ok: failures.length === 0, closed, expiredMemberships, failures });
}
