/**
 * Convert an HTML datetime-local wall clock value into an ISO UTC timestamp
 * for an explicit IANA timezone without relying on the server's local timezone.
 */
export function wallTimeToUtcIso(value: string, timeZone: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error("Enter a valid local date and time.");
  const [, y, mo, d, h, mi, s = "00"] = match;
  const intended = {
    year: Number(y), month: Number(mo), day: Number(d),
    hour: Number(h), minute: Number(mi), second: Number(s),
  };
  const desiredEpoch = Date.UTC(intended.year, intended.month - 1, intended.day, intended.hour, intended.minute, intended.second);
  if (!Number.isFinite(desiredEpoch)) throw new Error("Enter a valid local date and time.");

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  });

  const zonedParts = (epoch: number) => {
    const parts = formatter.formatToParts(new Date(epoch));
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
    return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") };
  };

  let guess = desiredEpoch;
  for (let i = 0; i < 4; i += 1) {
    const actual = zonedParts(guess);
    const actualEpoch = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const correction = desiredEpoch - actualEpoch;
    if (correction === 0) break;
    guess += correction;
  }

  const verified = zonedParts(guess);
  if (Object.keys(intended).some((key) => verified[key as keyof typeof verified] !== intended[key as keyof typeof intended])) {
    throw new Error(`That local time does not exist or is ambiguous in ${timeZone}. Choose another time.`);
  }
  return new Date(guess).toISOString();
}

export function addMinutesIso(iso: string, minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) throw new Error("Enter a valid duration.");
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}
