import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

/**
 * Applies to every page under /[storeSlug] (dashboard, daily-log, analytics,
 * timeline, stylists, settings, admin-view).
 *
 * Without this, switching tabs blocked on the server render before painting
 * anything, which is what made navigation feel frozen. Now the skeleton shows
 * immediately and the real content streams in behind it.
 */
export default function StoreViewLoading() {
  return <PageLoadingSkeleton />;
}
