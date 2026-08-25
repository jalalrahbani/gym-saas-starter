import { NextResponse } from "next/server";
import { resolveAppContext } from "@/lib/app-context";
import { hmacAccessToken, normalizeAccessToken } from "@/lib/access/token";

type AccessCredentialLookup = {
  credential_id: string;
  member_id: string;
};

export async function POST(request: Request) {
  const ctx = await resolveAppContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!ctx.hasOrganization) return NextResponse.json({ error: "Gym setup is incomplete" }, { status: 409 });

  const body = await request.json().catch(() => null) as { scan?: string; mode?: "toggle" | "check_in" | "check_out" } | null;
  const scan = normalizeAccessToken(body?.scan ?? "");
  const mode = body?.mode ?? "toggle";
  if (!scan) return NextResponse.json({ error: "Scan or search value is required" }, { status: 400 });
  if (!["toggle", "check_in", "check_out"].includes(mode)) return NextResponse.json({ error: "Invalid terminal mode" }, { status: 400 });

  let memberId: string | null = null;
  let credentialId: string | null = null;
  let method = "manual";

  const secret = process.env.CARD_TOKEN_HMAC_SECRET;
  if (secret) {
    const tokenHmac = hmacAccessToken(scan, secret);
    const { data } = await ctx.supabase.rpc("lookup_access_credential", { p_organization_id: ctx.organization.id, p_token_hmac: tokenHmac }).maybeSingle();
    const credential = data as AccessCredentialLookup | null;
    if (credential) {
      memberId = credential.member_id;
      credentialId = credential.credential_id;
      method = "credential";
    }
  }

  if (!memberId && /^M-?\d+$/i.test(scan)) {
    const memberNumber = Number(scan.replace(/\D/g, ""));
    const { data } = await ctx.supabase.from("members").select("id").eq("organization_id", ctx.organization.id).eq("member_number", memberNumber).is("archived_at", null).maybeSingle();
    memberId = data?.id ?? null;
    method = "member_number";
  }

  if (!memberId && /^\+?[0-9 ()-]{6,}$/.test(scan)) {
    const { data } = await ctx.supabase.from("members").select("id").eq("organization_id", ctx.organization.id).eq("phone", scan).is("archived_at", null).limit(1).maybeSingle();
    memberId = data?.id ?? null;
    method = "phone";
  }

  if (!memberId) {
    const words = scan.split(/\s+/).filter(Boolean);
    if (words.length >= 1) {
      let q = ctx.supabase.from("members").select("id,first_name,last_name").eq("organization_id", ctx.organization.id).is("archived_at", null).ilike("first_name", `%${words[0]}%`).limit(5);
      const { data } = await q;
      const exactish = (data ?? []).filter((m) => `${m.first_name} ${m.last_name}`.toLowerCase().includes(scan.toLowerCase()));
      if (exactish.length === 1) memberId = exactish[0].id;
    }
  }

  if (!memberId) return NextResponse.json({ result: "denied", message: "No member or access credential matched that input." }, { status: 404 });

  const { data: member } = await ctx.supabase.from("members").select("id,member_number,first_name,last_name,status").eq("organization_id", ctx.organization.id).eq("id", memberId).single();
  const { data: accessResult, error } = await ctx.supabase.rpc("process_member_access", {
    p_organization_id: ctx.organization.id,
    p_location_id: ctx.location.id,
    p_member_id: memberId,
    p_mode: mode,
    p_method: method,
    p_terminal_id: null,
    p_credential_id: credentialId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ...accessResult, member });
}
