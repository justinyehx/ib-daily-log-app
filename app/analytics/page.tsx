import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";

export default async function AnalyticsRedirect() {
  const session = await getCurrentSession();
  redirect(session.isAuthenticated ? `/${session.storeSlug}/analytics` : "/login");
}
