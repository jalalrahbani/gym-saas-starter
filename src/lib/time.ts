/**
 * Convert an HTML datetime-local wall clock value into an ISO UTC timestamp
 * for an explicit IANA timezone without relying on the server's local timezone.
 *
 * A wall time may map to:
 * - exactly one UTC instant: valid
 * - zero UTC instants: nonexistent DST gap
 * - multiple UTC instants: ambiguous DST fall-back
 *
 * Only the first case is accepted.
 */
export function wallTimeToUtcIso(value: string, timeZone: string) {
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) throw new Error("Enter a valid local date and time.");

  const [, y, mo, d, h, mi, s = "00"] = match;
  const intended = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
    second: Number(s),
  };

  const desiredEpoch = Date.UTC(
    intended.year,
    intended.month - 1,
    intended.day,
    intended.hour,
    intended.minute,
    intended.second,
  );

  if (!Number.isFinite(desiredEpoch)) {
    throw new Error("Enter a valid local date and time.");
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  type WallParts = typeof intended;

  const zonedParts = (epoch: number): WallParts => {
    const parts = formatter.formatToParts(new Date(epoch));
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);

    return {
      year: read("year"),
      month: read("month"),
      day: read("day"),
      hour: read("hour"),
      minute: read("minute"),
      second: read("second"),
    };
  };

  const sameWallTime = (parts: WallParts) =>
    parts.year === intended.year &&
    parts.month === intended.month &&
    parts.day === intended.day &&
    parts.hour === intended.hour &&
    parts.minute === intended.minute &&
    parts.second === intended.second;

  // Sample both sides of any nearby timezone transition and derive the
  // offsets that could apply to this wall clock value. This catches both
  // one-hour DST changes and non-hour transitions such as Lord Howe's 30 min.
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const epoch = desiredEpoch + hours * 60 * 60 * 1000;
    const local = zonedParts(epoch);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    offsets.add(localAsUtc - epoch);
  }

  const candidates = [...offsets]
    .map((offset) => desiredEpoch - offset)
    .filter((epoch, index, all) => all.indexOf(epoch) === index)
    .filter((epoch) => sameWallTime(zonedParts(epoch)));

  if (candidates.length !== 1) {
    throw new Error(
      `That local time does not exist or is ambiguous in ${timeZone}. Choose another time.`,
    );
  }

  return new Date(candidates[0]).toISOString();
}

export function addMinutesIso(iso: string, minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) {
    throw new Error("Enter a valid duration.");
  }

  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${read("year")}-${read("month")}-${read("day")}`;
}
