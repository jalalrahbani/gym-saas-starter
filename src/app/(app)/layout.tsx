export const dynamic = "force-dynamic";

import { AppShell } from "@/components/app-shell";
import { requireAppContext } from "@/lib/app-context";

export default async function ProductLayout({children}:{children:React.ReactNode}){const ctx=await requireAppContext();const userName=ctx.profile?.full_name||ctx.email||"Staff member";return <AppShell organizationName={ctx.organization.name} organizationLogoUrl={(ctx.organization as any).logo_url??null} locationName={ctx.location.name} locationId={ctx.location.id} locations={ctx.locations.map((location:{id:string;name:string})=>({id:location.id,name:location.name}))} userName={userName} userAvatarUrl={(ctx.profile as any)?.avatar_url??null} role={ctx.role} accentColor={(ctx.organization as any).theme_accent??"#111318"} backgroundColor={(ctx.organization as any).theme_background??"#f6f7f9"} sidebarColor={(ctx.organization as any).theme_sidebar??"#ffffff"}>{children}</AppShell>;}
