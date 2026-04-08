/**
 * Merges current search params with a set of updates into a query string.
 * Pass an empty string for a key in `updates` to remove it from the result.
 */
export function buildQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  updates: Record<string, string>
) {
  const params = new URLSearchParams();

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }

    if (typeof value === "string" && value) {
      params.set(key, value);
    }
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (!value) {
      params.delete(key);
      return;
    }

    params.set(key, value);
  });

  return `?${params.toString()}`;
}
