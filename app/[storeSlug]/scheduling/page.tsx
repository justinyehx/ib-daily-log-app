import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { SchedulingView } from "@/components/scheduling-view";
import { getCurrentSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-data";
import { getSchedulingData } from "@/lib/scheduling-data";

type SchedulingPageProps = {
  params: Promise<{ storeSlug: string }>;
};

export default async function SchedulingPage({ params }: SchedulingPageProps) {
  const { storeSlug } = await params;
  const session = await getCurrentSession();

  if (!session.isAuthenticated) redirect("/login");
  // Admin-only while the seasonal model is still being validated — the coverage
  // numbers rest on a single year of history and shouldn't drive real rotas yet.
  // Widen to MANAGER once a second season confirms the index.
  if (session.role !== "ADMIN") {
    redirect(`/${session.storeSlug}/${session.role === "STYLIST" ? "stylists" : "dashboard"}`);
  }
  // No per-store check is needed here: only admins reach this line, and admins
  // may view any store. Re-add canViewStoreSlug when this opens up to managers.

  const [scheduling, dashboard] = await Promise.all([
    getSchedulingData(storeSlug),
    getDashboardData(storeSlug)
  ]);

  if (!scheduling || !dashboard) return null;

  return (
    <AppShell
      activeView="scheduling"
      storeSlug={storeSlug}
      storeName={scheduling.storeName}
      session={session}
      snapshot={{
        activeNow: dashboard.summary.activeNow,
        waiting: dashboard.summary.waiting,
        soldToday: dashboard.summary.soldToday
      }}
      stores={dashboard.stores}
    >
      <div className="page-stack">
        <div className="topbar-date">
          <div className="eyebrow">Scheduling</div>
          <h2 className="page-title">Walk-in demand</h2>
        </div>

        <SchedulingView data={scheduling} />
      </div>
    </AppShell>
  );
}
