import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveAppContext } from "@/lib/app-context";
import { hmacAccessToken, normalizeAccessToken } from "@/lib/access/token";
import { ROLE_GROUPS, roleAllowed } from "@/lib/roles";

type AccessCredentialLookup = {
  credential_id: string;
  member_id: string;
};

type RequestBody = {
  scan?: unknown;
  mode?: unknown;
};

const MAX_BODY_BYTES = 8 * 1024;
const MAX_SCAN_CHARS = 256;

function json(
  body: Record<string, unknown>,
  status: number,
  requestId: string,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-request-id": requestId,
    },
  });
}

function databaseFailure(
  requestId: string,
  operation: string,
  error: { code?: string; message?: string } | null,
) {
  console.error("Access API database failure", {
    requestId,
    operation,
    code: error?.code ?? "unknown",
    message: error?.message ?? "unknown",
  });

  return json(
    { error: "The access service is temporarily unavailable. Please try again." },
    503,
    requestId,
  );
}

export async function POST(request: Request) {
  const requestId = randomUUID();

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return json({ error: "Content-Type must be application/json." }, 415, requestId);
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request body is too large." }, 413, requestId);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ error: "Request body is too large." }, 413, requestId);
  }

  let body: RequestBody;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Invalid JSON payload." }, 400, requestId);
    }
    body = parsed as RequestBody;
  } catch {
    return json({ error: "Invalid JSON payload." }, 400, requestId);
  }

  if (typeof body.scan !== "string") {
    return json({ error: "Scan or search value is required." }, 400, requestId);
  }

  const scan = normalizeAccessToken(body.scan);
  if (!scan) {
    return json({ error: "Scan or search value is required." }, 400, requestId);
  }
  if (scan.length > MAX_SCAN_CHARS) {
    return json({ error: "Scan or search value is too long." }, 400, requestId);
  }

  const mode =
    body.mode === undefined ? "toggle" : String(body.mode);

  if (!["toggle", "check_in", "check_out"].includes(mode)) {
    return json({ error: "Invalid terminal mode." }, 400, requestId);
  }

  let ctx: Awaited<ReturnType<typeof resolveAppContext>>;
  try {
    ctx = await resolveAppContext();
  } catch (error) {
    console.error("Access API context resolution failed", {
      requestId,
      message: error instanceof Error ? error.message : "Unknown context error",
    });
    return json(
      { error: "The access service is temporarily unavailable. Please try again." },
      503,
      requestId,
    );
  }

  if (!ctx) return json({ error: "Not authenticated." }, 401, requestId);
  if (!ctx.hasOrganization) {
    return json({ error: "Gym setup is incomplete." }, 409, requestId);
  }
  if (!roleAllowed(ctx.role, ROLE_GROUPS.accessOperators)) {
    return json(
      { error: "Your role cannot process gym access." },
      403,
      requestId,
    );
  }

  let memberId: string | null = null;
  let credentialId: string | null = null;
  let method = "manual";

  const secret = process.env.CARD_TOKEN_HMAC_SECRET;
  if (secret) {
    let tokenHmac: string;
    try {
      tokenHmac = hmacAccessToken(scan, secret);
    } catch (error) {
      console.error("Access credential hashing failed", {
        requestId,
        message: error instanceof Error ? error.message : "Unknown hashing error",
      });
      return json(
        { error: "The access service is temporarily unavailable. Please try again." },
        503,
        requestId,
      );
    }

    const { data, error } = await ctx.supabase
      .rpc("lookup_access_credential", {
        p_organization_id: ctx.organization.id,
        p_token_hmac: tokenHmac,
      })
      .maybeSingle();

    if (error) return databaseFailure(requestId, "credential_lookup", error);

    const credential = data as AccessCredentialLookup | null;
    if (credential) {
      memberId = credential.member_id;
      credentialId = credential.credential_id;
      method = "credential";
    }
  }

  if (!memberId && /^M-?\d+$/i.test(scan)) {
    const memberNumber = Number(scan.replace(/\D/g, ""));
    const { data, error } = await ctx.supabase
      .from("members")
      .select("id")
      .eq("organization_id", ctx.organization.id)
      .eq("member_number", memberNumber)
      .is("archived_at", null)
      .maybeSingle();

    if (error) return databaseFailure(requestId, "member_number_lookup", error);

    memberId = data?.id ?? null;
    method = "member_number";
  }

  if (!memberId && /^\+?[0-9 ()-]{6,}$/.test(scan)) {
    const { data, error } = await ctx.supabase
      .from("members")
      .select("id")
      .eq("organization_id", ctx.organization.id)
      .eq("phone", scan)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();

    if (error) return databaseFailure(requestId, "phone_lookup", error);

    memberId = data?.id ?? null;
    method = "phone";
  }

  if (!memberId) {
    const words = scan.split(/\s+/).filter(Boolean);

    if (words.length >= 1) {
      const { data, error } = await ctx.supabase
        .from("members")
        .select("id,first_name,last_name")
        .eq("organization_id", ctx.organization.id)
        .is("archived_at", null)
        .ilike("first_name", `%${words[0]}%`)
        .limit(5);

      if (error) return databaseFailure(requestId, "name_lookup", error);

      const exactish = (data ?? []).filter((member) =>
        `${member.first_name} ${member.last_name}`
          .toLowerCase()
          .includes(scan.toLowerCase()),
      );

      if (exactish.length === 1) memberId = exactish[0].id;
    }
  }

  if (!memberId) {
    return json(
      {
        result: "denied",
        message: "No member or access credential matched that input.",
      },
      404,
      requestId,
    );
  }

  const { data: member, error: memberError } = await ctx.supabase
    .from("members")
    .select("id,member_number,first_name,last_name,status")
    .eq("organization_id", ctx.organization.id)
    .eq("id", memberId)
    .single();

  if (memberError) {
    return databaseFailure(requestId, "member_load", memberError);
  }

  const { data: accessResult, error } = await ctx.supabase.rpc(
    "process_member_access",
    {
      p_organization_id: ctx.organization.id,
      p_location_id: ctx.location.id,
      p_member_id: memberId,
      p_mode: mode as "toggle" | "check_in" | "check_out",
      p_method: method,
      p_terminal_id: null,
      p_credential_id: credentialId,
    },
  );

  if (error) {
    console.error("Access processing RPC failed", {
      requestId,
      code: error.code,
      message: error.message,
    });
    return json(
      { error: "Access could not be processed. Please try again." },
      400,
      requestId,
    );
  }

  const result =
    accessResult && typeof accessResult === "object" && !Array.isArray(accessResult)
      ? (accessResult as Record<string, unknown>)
      : { result: "denied", message: "Access could not be processed." };

  return json({ ...result, member }, 200, requestId);
}
