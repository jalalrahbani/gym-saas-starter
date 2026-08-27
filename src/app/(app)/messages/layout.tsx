import { AccessDenied } from "@/components/access-denied";
import { requireAppContext } from "@/lib/app-context";
import { ROLE_GROUPS, roleAllowed } from "@/lib/roles";

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAppContext();
  if (!roleAllowed(ctx.role, ROLE_GROUPS.retention)) {
    return <AccessDenied area="retention and messaging" />;
  }
  return children;
}
