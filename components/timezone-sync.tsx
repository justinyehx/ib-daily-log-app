"use client";

import { useEffect } from "react";

/**
 * Detects the browser's IANA timezone and writes it to a "tz" cookie so the
 * server can use it for timezone-aware date calculations on subsequent requests.
 * Renders nothing — purely a side-effect component.
 */
export function TimezoneSync() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        // 1-year cookie, sent with same-site requests, not accessible to JS after set
        document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch {
      // Intl not available — leave cookie unset, server will fall back to UTC
    }
  }, []);

  return null;
}
