"use server";

import { revalidatePath } from "next/cache";
import { requireAppContext } from "@/lib/app-context";

const HEX=/^#[0-9A-Fa-f]{6}$/;
const MAX=2*1024*1024;
const ALLOWED=new Set(["image/jpeg","image/png","image/webp"]);

function required(fd:FormData,key:string){const v=String(fd.get(key)??"").trim();if(!v)throw new Error(`${key} is required`);return v;}
function hex(v:string,label:string){if(!HEX.test(v))throw new Error(`${label} must be a 6-digit hex color.`);return v.toLowerCase();}
function ext(file:File){return file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";}
async function upload(file:File,path:string,ctx:Awaited<ReturnType<typeof requireAppContext>>){if(file.size>MAX)throw new Error("Image must be 2 MB or smaller.");if(!ALLOWED.has(file.type))throw new Error("Use JPG, PNG, or WebP.");const {error}=await ctx.supabase.storage.from("gym-branding").upload(path,file,{upsert:true,contentType:file.type});if(error)throw new Error(error.message);return path;}

export async function updateBrandingAction(fd:FormData){const ctx=await requireAppContext();if(!["owner","admin"].includes(ctx.role))throw new Error("Only owners and admins can edit branding.");const values={theme_accent:hex(required(fd,"theme_accent"),"Accent color"),theme_background:hex(required(fd,"theme_background"),"Background color"),theme_sidebar:hex(required(fd,"theme_sidebar"),"Sidebar color"),updated_at:new Date().toISOString()};const {error}=await ctx.supabase.from("organizations").update(values).eq("id",ctx.organization.id);if(error)throw new Error(error.message);await ctx.supabase.from("audit_logs").insert({organization_id:ctx.organization.id,actor_user_id:ctx.userId,action:"organization.branding_updated",entity_type:"organization",entity_id:ctx.organization.id,after_data:values});revalidatePath("/","layout");revalidatePath("/settings");}

export async function uploadGymLogoAction(fd:FormData){const ctx=await requireAppContext();if(!["owner","admin"].includes(ctx.role))throw new Error("Only owners and admins can edit branding.");const file=fd.get("logo");if(!(file instanceof File)||file.size===0)throw new Error("Choose a logo image.");const path=`${ctx.organization.id}/logo.${ext(file)}`;await upload(file,path,ctx);const {error}=await ctx.supabase.from("organizations").update({logo_path:path,updated_at:new Date().toISOString()}).eq("id",ctx.organization.id);if(error)throw new Error(error.message);revalidatePath("/","layout");revalidatePath("/settings");}

export async function uploadProfilePhotoAction(fd:FormData){const ctx=await requireAppContext();const file=fd.get("avatar");if(!(file instanceof File)||file.size===0)throw new Error("Choose a profile image.");const path=`${ctx.organization.id}/profiles/${ctx.userId}.${ext(file)}`;await upload(file,path,ctx);const {error}=await ctx.supabase.from("profiles").update({avatar_path:path}).eq("user_id",ctx.userId);if(error)throw new Error(error.message);revalidatePath("/","layout");revalidatePath("/settings");}
