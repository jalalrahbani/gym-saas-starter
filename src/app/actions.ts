"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAppContext, requireUser } from "@/lib/app-context";
import { accessTokenLastFour, hmacAccessToken } from "@/lib/access/token";
import { addMinutesIso, dateInTimeZone, wallTimeToUtcIso } from "@/lib/time";

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function moneyToMinor(raw: string) {
  const normalized = raw.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Enter a valid non-negative amount with at most 2 decimals.");
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (minor > 9007199254740991n) throw new Error("Amount is too large.");
  return Number(minor);
}

export async function loginAction(formData: FormData) {
  const supabase = await createClient();
  const email = required(formData, "email").toLowerCase();
  const password = required(formData, "password");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signupAction(formData: FormData) {
  const supabase = await createClient();
  const fullName = required(formData, "full_name");
  const email = required(formData, "email").toLowerCase();
  const password = required(formData, "password");
  if (password.length < 8) redirect("/signup?error=Password%20must%20be%20at%20least%208%20characters");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      ...(siteUrl ? { emailRedirectTo: `${siteUrl}/auth/confirm` } : {}),
    },
  });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  if (data.session) redirect("/onboarding");
  redirect("/login?message=Check%20your%20email%20to%20confirm%20your%20account");
}


export async function setActiveLocationAction(formData: FormData) {
  const ctx = await requireAppContext();
  const locationId = required(formData, "location_id");
  if (!ctx.locations.some((location: { id: string }) => location.id === locationId)) {
    throw new Error("You do not have access to that location.");
  }
  const cookieStore = await cookies();
  cookieStore.set("active_location_id", locationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function createOrganizationAction(formData: FormData) {
  const { supabase } = await requireUser();
  const name = required(formData, "name");
  const country = required(formData, "country_code").toUpperCase();
  const timezone = required(formData, "timezone");
  const currency = required(formData, "base_currency").toUpperCase();
  const locationName = required(formData, "location_name");

  const { error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_country_code: country,
    p_timezone: timezone,
    p_base_currency: currency,
    p_location_name: locationName,
  });
  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function createMemberAction(formData: FormData) {
  const ctx = await requireAppContext();
  const firstName = required(formData, "first_name");
  const lastName = required(formData, "last_name");
  const { data, error } = await ctx.supabase
    .from("members")
    .insert({
      organization_id: ctx.organization.id,
      home_location_id: String(formData.get("home_location_id") || ctx.location.id),
      first_name: firstName,
      last_name: lastName,
      phone: optional(formData, "phone"),
      email: optional(formData, "email")?.toLowerCase() ?? null,
      date_of_birth: optional(formData, "date_of_birth"),
      emergency_contact_name: optional(formData, "emergency_contact_name"),
      emergency_contact_phone: optional(formData, "emergency_contact_phone"),
      status: "active",
      joined_at: dateInTimeZone(new Date(), ctx.organization.timezone),
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await ctx.supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    actor_user_id: ctx.userId,
    action: "member.created",
    entity_type: "member",
    entity_id: data.id,
    after_data: { first_name: firstName, last_name: lastName },
  });
  revalidatePath("/members");
  revalidatePath("/dashboard");
  redirect(`/members/${data.id}`);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ""; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== '\r') field += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export async function importMembersCsvAction(formData: FormData) {
  const ctx = await requireAppContext();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/members/import?error=Choose%20a%20CSV%20file");
  if (file.size > 2_000_000) redirect("/members/import?error=CSV%20must%20be%20under%202MB");
  const text = (await file.text()).replace(/^\uFEFF/, "");
  const csv = parseCsv(text);
  if (csv.length < 2) redirect("/members/import?error=CSV%20must%20contain%20a%20header%20and%20at%20least%20one%20member");

  const normalize = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const headers = csv[0].map(normalize);
  const aliases: Record<string, string[]> = {
    first_name: ["first_name","firstname","first","given_name"],
    last_name: ["last_name","lastname","last","surname","family_name"],
    full_name: ["full_name","name","member_name"],
    phone: ["phone","mobile","mobile_number","phone_number","telephone"],
    email: ["email","e_mail","email_address"],
    date_of_birth: ["date_of_birth","dob","birth_date"],
    joined_at: ["joined_at","join_date","joined","start_date"],
    status: ["status","member_status"],
  };
  const indexFor = (key: string) => aliases[key].map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const indexes = Object.fromEntries(Object.keys(aliases).map((key) => [key, indexFor(key)])) as Record<string, number>;
  if (indexes.full_name < 0 && (indexes.first_name < 0 || indexes.last_name < 0)) redirect("/members/import?error=CSV%20needs%20Full%20Name%20or%20First%20Name%20and%20Last%20Name%20columns");

  const validStatuses = new Set(["active","paused","expired","cancelled","archived"]);
  const dateOrEmpty = (value: string, label: string, rowNumber: number) => {
    const v = value.trim();
    if (!v) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${label} on CSV row ${rowNumber} must use YYYY-MM-DD.`);
    return v;
  };
  const valueAt = (r: string[], index: number) => index >= 0 ? (r[index] ?? "").trim() : "";
  const rows = csv.slice(1).map((r, offset) => {
    let first = valueAt(r, indexes.first_name);
    let last = valueAt(r, indexes.last_name);
    const full = valueAt(r, indexes.full_name);
    if ((!first || !last) && full) {
      const parts = full.split(/\s+/).filter(Boolean);
      first ||= parts.shift() ?? "";
      last ||= parts.join(" ") || "Member";
    }
    if (!first || !last) throw new Error(`CSV row ${offset + 2} is missing a member name.`);
    const status = valueAt(r, indexes.status).toLowerCase() || "active";
    if (!validStatuses.has(status)) throw new Error(`Invalid status on CSV row ${offset + 2}.`);
    return {
      first_name: first,
      last_name: last,
      phone: valueAt(r, indexes.phone),
      email: valueAt(r, indexes.email).toLowerCase(),
      date_of_birth: dateOrEmpty(valueAt(r, indexes.date_of_birth), "Date of birth", offset + 2),
      joined_at: dateOrEmpty(valueAt(r, indexes.joined_at), "Join date", offset + 2),
      status,
    };
  });
  if (rows.length > 5000) redirect("/members/import?error=Import%20is%20limited%20to%205000%20members%20at%20a%20time");

  const { data, error } = await ctx.supabase.rpc("import_members", {
    p_organization_id: ctx.organization.id,
    p_home_location_id: String(formData.get("home_location_id") || ctx.location.id),
    p_rows: rows,
  });
  if (error) redirect(`/members/import?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/members");
  revalidatePath("/dashboard");
  redirect(`/members?imported=${Number(data ?? rows.length)}`);
}

export async function updateMemberAction(formData: FormData) {
  const ctx = await requireAppContext();
  const memberId = required(formData, "member_id");
  const { error } = await ctx.supabase.from("members").update({
    first_name: required(formData, "first_name"),
    last_name: required(formData, "last_name"),
    phone: optional(formData, "phone"),
    email: optional(formData, "email")?.toLowerCase() ?? null,
    date_of_birth: optional(formData, "date_of_birth"),
    emergency_contact_name: optional(formData, "emergency_contact_name"),
    emergency_contact_phone: optional(formData, "emergency_contact_phone"),
    updated_at: new Date().toISOString(),
  }).eq("organization_id", ctx.organization.id).eq("id", memberId);
  if (error) throw new Error(error.message);
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/members");
}

export async function archiveMemberAction(formData: FormData) {
  const ctx = await requireAppContext();
  const memberId = required(formData, "member_id");
  const now = new Date().toISOString();
  const { error } = await ctx.supabase.from("members").update({ status: "archived", archived_at: now, updated_at: now })
    .eq("organization_id", ctx.organization.id).eq("id", memberId);
  if (error) throw new Error(error.message);
  await ctx.supabase.from("audit_logs").insert({ organization_id: ctx.organization.id, actor_user_id: ctx.userId, action: "member.archived", entity_type: "member", entity_id: memberId });
  revalidatePath("/members");
  redirect("/members");
}

export async function addMemberNoteAction(formData: FormData) {
  const ctx = await requireAppContext();
  const memberId = required(formData, "member_id");
  const note = required(formData, "note");
  const { error } = await ctx.supabase.from("member_notes").insert({ organization_id: ctx.organization.id, member_id: memberId, note, created_by: ctx.userId });
  if (error) throw new Error(error.message);
  revalidatePath(`/members/${memberId}`);
}

export async function createPlanAction(formData: FormData) {
  const ctx = await requireAppContext();
  const billingType = required(formData, "billing_type");
  const durationRaw = optional(formData, "duration_days");
  const visitsRaw = optional(formData, "included_visits");
  const { error } = await ctx.supabase.from("membership_plans").insert({
    organization_id: ctx.organization.id,
    location_id: optional(formData, "location_id"),
    name: required(formData, "name"),
    billing_type: billingType,
    duration_days: durationRaw ? Number(durationRaw) : null,
    included_visits: visitsRaw ? Number(visitsRaw) : null,
    price_minor: moneyToMinor(required(formData, "price")),
    currency: required(formData, "currency").toUpperCase(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/memberships");
}

export async function enrollMembershipAction(formData: FormData) {
  const ctx = await requireAppContext();
  const memberId = required(formData, "member_id");
  const { error } = await ctx.supabase.rpc("enroll_membership", {
    p_organization_id: ctx.organization.id,
    p_member_id: memberId,
    p_plan_id: required(formData, "plan_id"),
    p_starts_on: required(formData, "starts_on"),
    p_amount_paid_minor: moneyToMinor(String(formData.get("amount_paid") || "0")),
    p_payment_method: String(formData.get("payment_method") || "cash"),
    p_note: optional(formData, "note"),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/memberships");
  revalidatePath("/payments");
  revalidatePath("/dashboard");
}

export async function freezeMembershipAction(formData: FormData) {
  const ctx = await requireAppContext();
  const memberId = required(formData, "member_id");
  const { error } = await ctx.supabase.rpc("freeze_membership", {
    p_organization_id: ctx.organization.id,
    p_membership_id: required(formData, "membership_id"),
    p_starts_on: required(formData, "starts_on"),
    p_ends_on: required(formData, "ends_on"),
    p_reason: optional(formData, "reason"),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/memberships");
  revalidatePath("/dashboard");
}

export async function recordPaymentAction(formData: FormData) {
  const ctx = await requireAppContext();
  const memberId = required(formData, "member_id");
  const membershipId = optional(formData, "membership_id");
  const amountMinor = moneyToMinor(required(formData, "amount"));
  const { error } = await ctx.supabase.rpc("record_payment", {
    p_organization_id: ctx.organization.id,
    p_location_id: String(formData.get("location_id") || ctx.location.id),
    p_member_id: memberId,
    p_membership_id: membershipId,
    p_amount_minor: amountMinor,
    p_currency: required(formData, "currency").toUpperCase(),
    p_payment_method: required(formData, "payment_method"),
    p_external_reference: optional(formData, "external_reference"),
    p_note: optional(formData, "note"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/payments");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/dashboard");
}

export async function voidPaymentAction(formData: FormData) {
  const ctx = await requireAppContext();
  const paymentId = required(formData, "payment_id");
  const { error } = await ctx.supabase.from("payments").update({ status: "voided", voided_at: new Date().toISOString() })
    .eq("organization_id", ctx.organization.id).eq("id", paymentId).eq("status", "paid");
  if (error) throw new Error(error.message);
  await ctx.supabase.from("audit_logs").insert({ organization_id: ctx.organization.id, actor_user_id: ctx.userId, action: "payment.voided", entity_type: "payment", entity_id: paymentId });
  revalidatePath("/payments");
  revalidatePath("/dashboard");
}

export async function assignAccessCredentialAction(formData: FormData) {
  const ctx = await requireAppContext();
  const memberId = required(formData, "member_id");
  const rawToken = required(formData, "raw_token");
  const secret = process.env.CARD_TOKEN_HMAC_SECRET;
  if (!secret) throw new Error("CARD_TOKEN_HMAC_SECRET is not configured.");
  const tokenHmac = hmacAccessToken(rawToken, secret);
  const { error } = await ctx.supabase.rpc("assign_access_credential", {
    p_organization_id: ctx.organization.id,
    p_member_id: memberId,
    p_credential_type: required(formData, "credential_type"),
    p_token_hmac: tokenHmac,
    p_last_four: accessTokenLastFour(rawToken),
    p_label: optional(formData, "label"),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/members/${memberId}`);
}

export async function createPtPackageAction(formData: FormData) {
  const ctx = await requireAppContext();
  const memberId = required(formData, "member_id");
  const sessions = Number(required(formData, "sessions"));
  const { error } = await ctx.supabase.from("pt_packages").insert({
    organization_id: ctx.organization.id,
    member_id: memberId,
    trainer_user_id: optional(formData, "trainer_user_id"),
    sessions_purchased: sessions,
    sessions_remaining: sessions,
    expires_on: optional(formData, "expires_on"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/training");
  revalidatePath(`/members/${memberId}`);
}

export async function createPtSessionAction(formData: FormData) {
  const ctx = await requireAppContext();
  const startsAt = wallTimeToUtcIso(required(formData, "starts_at"), ctx.organization.timezone);
  const duration = Number(String(formData.get("duration_minutes") || "60"));
  const endsAt = addMinutesIso(startsAt, duration);
  const { error } = await ctx.supabase.from("pt_sessions").insert({
    organization_id: ctx.organization.id,
    location_id: String(formData.get("location_id") || ctx.location.id),
    member_id: required(formData, "member_id"),
    trainer_user_id: required(formData, "trainer_user_id"),
    pt_package_id: optional(formData, "pt_package_id"),
    starts_at: startsAt,
    ends_at: endsAt,
    notes: optional(formData, "notes"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/training");
}

export async function completePtSessionAction(formData: FormData) {
  const ctx = await requireAppContext();
  const { error } = await ctx.supabase.rpc("complete_pt_session", { p_organization_id: ctx.organization.id, p_session_id: required(formData, "session_id") });
  if (error) throw new Error(error.message);
  revalidatePath("/training");
}

export async function createGroupClassAction(formData: FormData) {
  const ctx = await requireAppContext();
  const { error } = await ctx.supabase.from("group_classes").insert({
    organization_id: ctx.organization.id,
    location_id: optional(formData, "location_id"),
    name: required(formData, "name"),
    description: optional(formData, "description"),
    capacity: Number(required(formData, "capacity")),
    duration_minutes: Number(required(formData, "duration_minutes")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/classes");
}

export async function createClassSessionAction(formData: FormData) {
  const ctx = await requireAppContext();
  const startsAt = wallTimeToUtcIso(required(formData, "starts_at"), ctx.organization.timezone);
  const duration = Number(required(formData, "duration_minutes"));
  const endsAt = addMinutesIso(startsAt, duration);
  const { error } = await ctx.supabase.from("class_sessions").insert({
    organization_id: ctx.organization.id,
    class_id: required(formData, "class_id"),
    location_id: String(formData.get("location_id") || ctx.location.id),
    trainer_user_id: optional(formData, "trainer_user_id"),
    starts_at: startsAt,
    ends_at: endsAt,
    capacity: Number(required(formData, "capacity")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/classes");
}

export async function bookClassAction(formData: FormData) {
  const ctx = await requireAppContext();
  const { error } = await ctx.supabase.rpc("book_class", {
    p_organization_id: ctx.organization.id,
    p_class_session_id: required(formData, "class_session_id"),
    p_member_id: required(formData, "member_id"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/classes");
}

export async function revokeAccessCredentialAction(formData: FormData) {
  const ctx = await requireAppContext();
  const memberId = required(formData, "member_id");
  const { error } = await ctx.supabase.rpc("revoke_access_credential", {
    p_organization_id: ctx.organization.id,
    p_credential_id: required(formData, "credential_id"),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/members/${memberId}`);
}

export async function createLeadAction(formData: FormData) {
  const ctx = await requireAppContext();
  const { error } = await ctx.supabase.from("leads").insert({
    organization_id: ctx.organization.id,
    location_id: String(formData.get("location_id") || ctx.location.id),
    full_name: required(formData, "full_name"),
    phone: optional(formData, "phone"),
    email: optional(formData, "email")?.toLowerCase() ?? null,
    source: optional(formData, "source"),
    stage: "new",
    next_follow_up_at: optional(formData, "next_follow_up_at") ? wallTimeToUtcIso(required(formData, "next_follow_up_at"), ctx.organization.timezone) : null,
    created_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

export async function updateLeadStageAction(formData: FormData) {
  const ctx = await requireAppContext();
  const stage = required(formData, "stage");
  const leadId = required(formData, "lead_id");
  const { error } = await ctx.supabase.from("leads").update({
    stage,
    lost_reason: stage === "lost" ? optional(formData, "lost_reason") : null,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", ctx.organization.id).eq("id", leadId);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

export async function convertLeadToMemberAction(formData: FormData) {
  const ctx = await requireAppContext();
  const { data, error } = await ctx.supabase.rpc("convert_lead_to_member", {
    p_organization_id: ctx.organization.id,
    p_lead_id: required(formData, "lead_id"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
  revalidatePath("/members");
  revalidatePath("/dashboard");
  redirect(`/members/${data}`);
}

export async function inviteStaffAction(formData: FormData) {
  const ctx = await requireAppContext();
  if (!(["owner", "admin"] as string[]).includes(ctx.role)) throw new Error("Only owners and admins can invite staff.");
  const email = required(formData, "email").toLowerCase();
  const fullName = required(formData, "full_name");
  const role = required(formData, "role");
  const locationId = optional(formData, "location_id") ?? ctx.location.id;

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    ...(siteUrl ? { redirectTo: `${siteUrl}/auth/confirm?next=/dashboard` } : {}),
  });
  if (error || !data.user) throw new Error(error?.message ?? "Unable to invite staff member.");

  const { error: membershipError } = await ctx.supabase.from("organization_members").insert({
    organization_id: ctx.organization.id,
    user_id: data.user.id,
    role,
    location_id: locationId,
    is_active: true,
  });
  if (membershipError) throw new Error(membershipError.message);
  revalidatePath("/staff");
}

export async function createLocationAction(formData: FormData) {
  const ctx = await requireAppContext();
  if (!(["owner", "admin"] as string[]).includes(ctx.role)) throw new Error("Only owners and admins can create locations.");
  const name = required(formData, "name");
  const timezone = optional(formData, "timezone") ?? ctx.organization.timezone;
  const { data, error } = await ctx.supabase.from("locations").insert({
    organization_id: ctx.organization.id,
    name,
    address: optional(formData, "address"),
    timezone,
    is_active: true,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await ctx.supabase.from("audit_logs").insert({
    organization_id: ctx.organization.id,
    actor_user_id: ctx.userId,
    action: "location.created",
    entity_type: "location",
    entity_id: data.id,
    after_data: { name, timezone },
  });
  revalidatePath("/", "layout");
  revalidatePath("/settings");
}

export async function updateOrganizationAction(formData: FormData) {
  const ctx = await requireAppContext();
  const { error } = await ctx.supabase.from("organizations").update({
    name: required(formData, "name"),
    timezone: required(formData, "timezone"),
    base_currency: required(formData, "base_currency").toUpperCase(),
    updated_at: new Date().toISOString(),
  }).eq("id", ctx.organization.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function createBillingCheckoutAction(formData: FormData) {
  const ctx = await requireAppContext();
  if (!(["owner", "admin"] as string[]).includes(ctx.role)) throw new Error("Only owners and admins can manage billing.");
  const planCode = required(formData, "plan_code");
  const priceId = planCode === "pro" ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_STARTER;
  if (!priceId) throw new Error(`Stripe price for ${planCode} is not configured.`);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  const { data: existing } = await ctx.supabase.from("saas_subscriptions").select("provider_customer_id").eq("organization_id", ctx.organization.id).maybeSingle();
  const { stripeRequest } = await import("@/lib/stripe");
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("success_url", `${siteUrl}/settings?billing=success`);
  params.set("cancel_url", `${siteUrl}/settings?billing=cancelled`);
  params.set("client_reference_id", ctx.organization.id);
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("allow_promotion_codes", "true");
  params.set("metadata[organization_id]", ctx.organization.id);
  params.set("metadata[plan_code]", planCode);
  params.set("subscription_data[metadata][organization_id]", ctx.organization.id);
  params.set("subscription_data[metadata][plan_code]", planCode);
  if (existing?.provider_customer_id) params.set("customer", existing.provider_customer_id);
  else if (ctx.email) params.set("customer_email", ctx.email);
  const session = await stripeRequest("/checkout/sessions", params);
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  redirect(session.url);
}

export async function createBillingPortalAction() {
  const ctx = await requireAppContext();
  if (!(["owner", "admin"] as string[]).includes(ctx.role)) throw new Error("Only owners and admins can manage billing.");
  const { data } = await ctx.supabase.from("saas_subscriptions").select("provider_customer_id").eq("organization_id", ctx.organization.id).maybeSingle();
  if (!data?.provider_customer_id) throw new Error("No Stripe customer exists for this workspace yet.");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  const { stripeRequest } = await import("@/lib/stripe");
  const params = new URLSearchParams({ customer: data.provider_customer_id, return_url: `${siteUrl}/settings` });
  const session = await stripeRequest("/billing_portal/sessions", params);
  if (!session.url) throw new Error("Stripe did not return a billing portal URL.");
  redirect(session.url);
}
