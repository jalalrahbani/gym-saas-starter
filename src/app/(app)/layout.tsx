export const dynamic = "force-dynamic";

import { AppShell } from "@/components/app-shell";
import { requireAppContext } from "@/lib/app-context";

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAppContext();
  const userName = ctx.profile?.full_name || ctx.email || "Staff member";
  return (
    <AppShell
      organizationName={ctx.organization.name}
      locationName={ctx.location.name}
      locationId={ctx.location.id}
      locations={ctx.locations.map((location: { id: string; name: string }) => ({ id: location.id, name: location.name }))}
      userName={userName}
      role={ctx.role}
    >
      {children}
    </AppShell>
  );
}
