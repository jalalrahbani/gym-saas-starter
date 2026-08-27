export const APP_ROLES = ["owner","admin","manager","reception","trainer","accountant"] as const;
export const ROLE_GROUPS = {
  all: APP_ROLES,
  memberManagers: ["owner","admin","manager","reception"],
  accessOperators: ["owner","admin","manager","reception","trainer"],
  membershipWorkspace: ["owner","admin","manager","reception","accountant"],
  membershipManagers: ["owner","admin","manager","reception"],
  planManagers: ["owner","admin","manager"],
  financial: ["owner","admin","manager","reception","accountant"],
  paymentVoiders: ["owner","admin","manager","accountant"],
  training: ["owner","admin","manager","reception","trainer"],
  classManagers: ["owner","admin","manager"],
  retention: ["owner","admin","manager","reception"],
  reports: ["owner","admin","manager","accountant"],
  staffWorkspace: ["owner","admin","manager"],
  staffInviters: ["owner","admin"],
  memberNotes: ["owner","admin","manager","reception","trainer"],
  memberArchivers: ["owner","admin","manager"],
  accessCredentialViewers: ["owner","admin","manager","reception","trainer"],
  accessCredentialManagers: ["owner","admin","manager","reception"],
  privateMemberMedia: ["owner","admin","manager","reception","trainer"],
} as const;

export function roleAllowed(role: string, allowed: readonly string[]) {
  return allowed.includes(role);
}
