"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getExistingOrganizationMembership, requireUser } from "@/lib/app-context";

const HEX = /^#[0-9A-Fa-f]{6}$/;
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function validatedHex(formData: FormData, key: string, fallback: string) {
  const value = String(formData.get(key) ?? fallback).trim();
  return HEX.test(value) ? value.toLowerCase() : fallback;
}

function optionalImage(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_FILE_SIZE) throw new Error(`${key} must be 2 MB or smaller.`);
  if (!ALLOWED_IMAGE_TYPES.has(value.type)) throw new Error(`${key} must be JPG, PNG, or WebP.`);
  return value;
}

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function safeAudit(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  payload: Record<string, unknown>,
) {
  await supabase.from("audit_logs").insert(payload);
}

async function uploadBrandAsset(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  file: File,
  path: string,
) {
  const { error } = await supabase.storage
    .from("gym-branding")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);
  return path;
}

export async function createOrganizationWithBrandingAction(formData: FormData) {
  const { supabase, userId } = await requireUser();

  // Validate everything the user supplied before creating persistent workspace data.
  const name = required(formData, "name");
  const country = required(formData, "country_code").toUpperCase();
  const timezone = required(formData, "timezone");
  const currency = required(formData, "base_currency").toUpperCase();
  const locationName = required(formData, "location_name");

  const themeAccent = validatedHex(formData, "theme_accent", "#7c3aed");
  const themeBackground = validatedHex(formData, "theme_background", "#f6f7fb");
  const themeSidebar = validatedHex(formData, "theme_sidebar", "#111827");

  const logo = optionalImage(formData, "logo");
  const avatar = optionalImage(formData, "avatar");

  // Fast-path retries/resubmissions that arrive after a workspace already exists.
  const existing = await getExistingOrganizationMembership();
  if (existing?.organization_id) redirect("/dashboard");

  const { data: organizationId, error } = await supabase.rpc(
    "create_organization_with_branding",
    {
      p_name: name,
      p_country_code: country,
      p_timezone: timezone,
      p_base_currency: currency,
      p_location_name: locationName,
      p_theme_accent: themeAccent,
      p_theme_background: themeBackground,
      p_theme_sidebar: themeSidebar,
    },
  );

  if (error || !organizationId) {
    // The database serializes concurrent onboarding attempts. If another request
    // completed first, treat this request as success rather than surfacing a
    // duplicate-workspace error to the customer.
    const membership = await getExistingOrganizationMembership();
    if (membership?.organization_id) redirect("/dashboard");

    redirect(
      `/onboarding?error=${encodeURIComponent(
        error?.message ?? "Unable to create gym workspace",
      )}`,
    );
  }

  const warnings: string[] = [];

  if (logo) {
    try {
      const path = `${organizationId}/logo.${extensionFor(logo)}`;
      await uploadBrandAsset(supabase, logo, path);

      const { error: logoUpdateError } = await supabase
        .from("organizations")
        .update({ logo_path: path, updated_at: new Date().toISOString() })
        .eq("id", organizationId);

      if (logoUpdateError) throw new Error(logoUpdateError.message);
    } catch (error) {
      warnings.push(
        `logo: ${error instanceof Error ? error.message : "upload failed"}`,
      );
    }
  }

  if (avatar) {
    try {
      const path = `${organizationId}/profiles/${userId}.${extensionFor(avatar)}`;
      await uploadBrandAsset(supabase, avatar, path);

      const { error: avatarUpdateError } = await supabase
        .from("profiles")
        .update({ avatar_path: path, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (avatarUpdateError) throw new Error(avatarUpdateError.message);
    } catch (error) {
      warnings.push(
        `avatar: ${error instanceof Error ? error.message : "upload failed"}`,
      );
    }
  }

  await safeAudit(supabase, {
    organization_id: organizationId,
    actor_user_id: userId,
    action:
      warnings.length > 0
        ? "organization.onboarding_completed_with_warnings"
        : "organization.onboarding_completed",
    entity_type: "organization",
    entity_id: organizationId,
    after_data: {
      theme_accent: themeAccent,
      theme_background: themeBackground,
      theme_sidebar: themeSidebar,
      logo_requested: Boolean(logo),
      avatar_requested: Boolean(avatar),
      warnings,
    },
  });

  revalidatePath("/", "layout");
  redirect(
    warnings.length > 0
      ? "/dashboard?onboarding=complete&branding=partial"
      : "/dashboard?onboarding=complete",
  );
}
