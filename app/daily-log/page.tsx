import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";

export default async function DailyLogRedirect() {
  const session = await getCurrentSession();
  redirect(session.isAuthenticated ? `/${session.storeSlug}/daily-log` : "/login");
}
