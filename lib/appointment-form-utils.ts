/**
 * Shared utility functions used across appointment check-in,
 * edit, and checkout forms.
 */

/** Returns true when the appointment type label refers to an alteration. */
export function isAlterationLabel(value: string) {
  return value.toLowerCase().includes("alteration");
}

/** Returns true when the appointment type should not collect bridal detail fields. */
export function skipsBridalDetailFields(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized === "presentation" ||
    normalized === "comeback bride" ||
    normalized === "comeback bride - same day" ||
    normalized === "phone order" ||
    normalized === "pay" ||
    normalized === "pickup" ||
    isAlterationLabel(normalized)
  );
}

/** Finds the "New Bride" option id, or empty string if not present. */
export function findDefaultTypeId(options: Array<{ id: string; label: string }>) {
  return options.find((option) => option.label.toLowerCase() === "new bride")?.id || "";
}

/** Returns the current local time as "HH:MM". */
export function getCurrentTimeValue() {
  const now = new Date();
  const hours = `${now.getHours()}`.padStart(2, "0");
  const minutes = `${now.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Returns the UTC offset in minutes for a given local date + time string.
 * Needed to correctly reconstruct the UTC timestamp on the server.
 */
export function getOffsetMinutes(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return `${new Date().getTimezoneOffset()}`;
  return `${new Date(`${dateValue}T${timeValue}:00`).getTimezoneOffset()}`;
}

/** Formats a YYYY-MM-DD date string as M/D/YYYY for display. */
export function formatDateLabel(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
