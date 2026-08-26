import { formatDateTime } from "@/lib/format";

export type PtMessageKind = "confirmation" | "reminder_24h" | "reminder_2h" | "rescheduled" | "cancelled";

type PtMessageInput = {
  kind: PtMessageKind;
  gymName: string;
  memberFirstName: string;
  trainerName?: string | null;
  startsAt: string;
  timezone: string;
};

export function buildPtWhatsAppMessage({
  kind,
  gymName,
  memberFirstName,
  trainerName,
  startsAt,
  timezone,
}: PtMessageInput) {
  const when = formatDateTime(startsAt, timezone);
  const trainer = trainerName ? ` with ${trainerName}` : "";
  const firstName = memberFirstName || "there";

  switch (kind) {
    case "confirmation":
      return `Hi ${firstName}, your personal training session at ${gymName} is confirmed for ${when}${trainer}. Reply here if you need to reschedule. See you then 💪`;
    case "reminder_24h":
      return `Hi ${firstName}, a reminder from ${gymName}: your personal training session is coming up tomorrow at ${when}${trainer}. See you soon 💪`;
    case "reminder_2h":
      return `Hi ${firstName}, quick reminder from ${gymName}: your personal training session starts in about 2 hours at ${when}${trainer}. See you soon 💪`;
    case "rescheduled":
      return `Hi ${firstName}, your personal training session at ${gymName} has been rescheduled to ${when}${trainer}. Please reply here to confirm the new time.`;
    case "cancelled":
      return `Hi ${firstName}, your personal training session at ${gymName} scheduled for ${when}${trainer} has been cancelled. Reply here and we'll help you choose another time.`;
  }
}

export function ptReminderLabel(startsAt: string, now = new Date()) {
  const hours = (new Date(startsAt).getTime() - now.getTime()) / 3_600_000;
  if (hours <= 0) return "Session time reached";
  if (hours <= 3) return "2h reminder window";
  if (hours <= 30) return "24h reminder window";
  return "Confirmation / upcoming";
}
