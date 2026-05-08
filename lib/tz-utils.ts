/**
 * Server-side timezone utilities for computing date boundaries
 * relative to the user's local timezone (read from the "tz" cookie).
 */

/**
 * Returns the UTC offset in milliseconds between UTC and the given timezone
 * at a specific instant. Positive = timezone is behind UTC (e.g. CDT = UTC-5 → +300 min).
 */
function getUtcOffsetMs(timezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const localMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24, // guard against "24" returned at midnight in some environments
    get("minute"),
    get("second")
  );

  return date.getTime() - localMs;
}

/**
 * Returns the calendar date string "YYYY-MM-DD" for the current moment
 * in the given timezone. Falls back to UTC if the timezone is invalid.
 */
export function getTodayDateString(timezone: string): string {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  } catch {
    return new Date().toLocaleDateString("en-CA", { timeZone: "UTC" });
  }
}

/**
 * Returns a UTC Date representing midnight (start of day) in the given timezone.
 * Uses noon UTC as the reference point for the offset to avoid DST edge cases at midnight.
 */
export function startOfLocalDay(timezone: string): Date {
  const dateStr = getTodayDateString(timezone);
  const [year, month, day] = dateStr.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetMs = getUtcOffsetMs(timezone, noonUtc);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + offsetMs);
}

/**
 * Returns a UTC Date representing 23:59:59.999 (end of day) in the given timezone.
 */
export function endOfLocalDay(timezone: string): Date {
  const dateStr = getTodayDateString(timezone);
  const [year, month, day] = dateStr.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetMs = getUtcOffsetMs(timezone, noonUtc);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) + offsetMs);
}

/**
 * Returns a UTC Date representing midnight (start of day) for a date string "YYYY-MM-DD"
 * in the given timezone. Useful for building arbitrary date range queries.
 */
export function startOfDateInTz(dateStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetMs = getUtcOffsetMs(timezone, noonUtc);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + offsetMs);
}

/**
 * Validates that a timezone string is a recognized IANA timezone.
 * Returns the timezone if valid, "UTC" otherwise.
 */
export function safeTimezone(tz: string | undefined | null): string {
  if (!tz) return "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
