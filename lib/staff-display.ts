/**
 * Formats a staff member's full name for display outside of Settings.
 * "Cristina Martin" → "Cristina M."
 * "Michael" (no last name yet) → "Michael"
 * "Unassigned" / empty → returned as-is
 */
export function formatStaffDisplayName(fullName: string): string {
  if (!fullName || fullName === "Unassigned" || fullName === "—") return fullName;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const lastInitial = parts[parts.length - 1][0].toUpperCase();
  return `${parts.slice(0, -1).join(" ")} ${lastInitial}.`;
}
