"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/app-context";

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
  if (!HEX.test(value)) return fallback;
  return value.toLowerCase();
}

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function validOptionalImage(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

async function uploadBrandAsset(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  file: File,
  path: string,
) {
  if (file.size > MAX_FILE_SIZE) throw new Error("Brand images must be 2 MB or smaller.");
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Brand images must be JPG, PNG, or WebP.");

  const { error } = await supabase.storage
    .from("gym-branding")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);
  return path;
}

export async function createOrganizationWithBrandingAction(formData: FormData) {
  const { supabase, userId } = await requireUser();

  const name = required(formData, "name");
  const country = required(formData, "country_code").toUpperCase();
  const timezone = required(formData, "timezone");
  const currency = required(formData, "base_currency").toUpperCase();
  const locationName = required(formData, "location_name");

  const themeAccent = validatedHex(formData, "theme_accent", "#7c3aed");
  const themeBackground = validatedHex(formData, "theme_background", "#f6f7fb");
  const themeSidebar = validatedHex(formData, "theme_sidebar", "#111827");

  const { data: organizationId, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_country_code: country,
    p_timezone: timezone,
    p_base_currency: currency,
    p_location_name: locationName,
  });

  if (error || !organizationId) {
    redirect(`/onboarding?error=${encodeURIComponent(error?.message ?? "Unable to create gym workspace")}`);
  }

  const organizationUpdate: Record<string, string> = {
    theme_accent: themeAccent,
    theme_background: themeBackground,
    theme_sidebar: themeSidebar,
    updated_at: new Date().toISOString(),
  };

  const logo = formData.get("logo");
  if (validOptionalImage(logo)) {
    const path = `${organizationId}/logo.${extensionFor(logo)}`;
    organizationUpdate.logo_path = await uploadBrandAsset(supabase, logo, path);
  }

  const { error: organizationError } = await supabase
    .from("organizations")
    .update(organizationUpdate)
    .eq("id", organizationId);

  if (organizationError) throw new Error(organizationError.message);

  const avatar = formData.get("avatar");
  if (validOptionalImage(avatar)) {
    const path = `${organizationId}/profiles/${userId}.${extensionFor(avatar)}`;
    await uploadBrandAsset(supabase, avatar, path);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_path: path, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (profileError) throw new Error(profileError.message);
  }

  await supabase.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: "organization.onboarding_branding_set",
    entity_type: "organization",
    entity_id: organizationId,
    after_data: {
      theme_accent: themeAccent,
      theme_background: themeBackground,
      theme_sidebar: themeSidebar,
      logo_uploaded: validOptionalImage(logo),
      avatar_uploaded: validOptionalImage(avatar),
    },
  });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
