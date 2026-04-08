/**
 * Normalizes a string for deduplication and comparison:
 * trims whitespace, lowercases, and collapses internal spaces.
 */
export function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Normalizes a person's name (or any label) for consistent DB storage
 * and case-insensitive lookup. Same transformation as normalizeKey.
 */
export function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
