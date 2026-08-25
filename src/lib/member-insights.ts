import { dateInTimeZone } from "@/lib/time";

export type EngagementLevel = "streak" | "regular" | "at_risk" | "inactive";

export type AttendanceInsight = {
  visitDates: string[];
  currentStreak: number;
  longestStreak: number;
  lastVisitDate: string | null;
  daysSinceLastVisit: number | null;
  engagement: EngagementLevel;
  engagementLabel: string;
};

function utcDayNumber(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function daysBetweenDates(earlier: string, later: string) {
  return utcDayNumber(later) - utcDayNumber(earlier);
}

export function attendanceInsights(
  checkedInAt: Array<string | null | undefined>,
  timeZone: string,
  now = new Date(),
): AttendanceInsight {
  const today = dateInTimeZone(now, timeZone);
  const visitDates = [...new Set(
    checkedInAt
      .filter((value): value is string => Boolean(value))
      .map((value) => dateInTimeZone(new Date(value), timeZone)),
  )].sort((a, b) => b.localeCompare(a));

  if (!visitDates.length) {
    return {
      visitDates: [],
      currentStreak: 0,
      longestStreak: 0,
      lastVisitDate: null,
      daysSinceLastVisit: null,
      engagement: "inactive",
      engagementLabel: "Inactive",
    };
  }

  const lastVisitDate = visitDates[0];
  const daysSinceLastVisit = Math.max(0, daysBetweenDates(lastVisitDate, today));

  let currentStreak = 0;
  // A streak remains current if the member visited today or yesterday.
  if (daysSinceLastVisit <= 1) {
    currentStreak = 1;
    for (let i = 1; i < visitDates.length; i += 1) {
      if (daysBetweenDates(visitDates[i], visitDates[i - 1]) === 1) currentStreak += 1;
      else break;
    }
  }

  const ascending = [...visitDates].sort();
  let longestStreak = ascending.length ? 1 : 0;
  let run = ascending.length ? 1 : 0;
  for (let i = 1; i < ascending.length; i += 1) {
    if (daysBetweenDates(ascending[i - 1], ascending[i]) === 1) run += 1;
    else run = 1;
    longestStreak = Math.max(longestStreak, run);
  }

  let engagement: EngagementLevel;
  let engagementLabel: string;
  if (currentStreak >= 5) {
    engagement = "streak";
    engagementLabel = `${currentStreak}-day streak`;
  } else if (daysSinceLastVisit <= 7) {
    engagement = "regular";
    engagementLabel = currentStreak > 1 ? `${currentStreak}-day streak` : "Regular";
  } else if (daysSinceLastVisit <= 30) {
    engagement = "at_risk";
    engagementLabel = "At risk";
  } else {
    engagement = "inactive";
    engagementLabel = "Inactive";
  }

  return {
    visitDates,
    currentStreak,
    longestStreak,
    lastVisitDate,
    daysSinceLastVisit,
    engagement,
    engagementLabel,
  };
}

export function engagementBadgeClass(level: EngagementLevel) {
  switch (level) {
    case "streak":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "regular":
      return "bg-blue-50 text-blue-800 ring-1 ring-blue-200";
    case "at_risk":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
    default:
      return "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
  }
}

export function whatsappHref(phone: string | null | undefined, message: string) {
  if (!phone) return null;
  const normalized = phone.trim().replace(/^00/, "+");
  const digits = normalized.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
