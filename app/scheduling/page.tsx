import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/auth";

export default async function SchedulingIndex() {
  const session = await getCurrentSession();
  redirect(session.isAuthenticated ? `/${session.storeSlug}/scheduling` : "/login");
}
