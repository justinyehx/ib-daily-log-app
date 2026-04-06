import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getCurrentSession();
  redirect(session.isAuthenticated ? (session.role === "STYLIST" ? "/stylists" : "/dashboard") : "/login");
}
