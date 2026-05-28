import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session.isAuthenticated) redirect("/login");
  redirect(session.role === "STYLIST"
    ? `/${session.storeSlug}/stylists`
    : `/${session.storeSlug}/dashboard`
  );
}
