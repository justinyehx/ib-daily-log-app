import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { StylistTimelineChart } from "@/components/stylist-timeline-chart";
import { getCurrentSession } from "@/lib/auth";
import { getTimelineData } from "@/lib/timeline-data";
import { getTodayDateString, safeTimezone } from "@/lib/tz-utils";

export const dynamic = "force-dynamic";

type TimelinePageProps = {
  params: Promise<{ storeSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimelinePage({ params, searchParams }: TimelinePageProps) {
  const { storeSlug } = await params;
  const session = await getCurrentSession();

  if (!session.isAuthenticated) redirect("/login");
  if (session.role !== "MANAGER" && session.role !== "ADMIN") {
    redirect(`/${session.storeSlug}/dashboard`);
  }
  if (session.role !== "ADMIN" && session.storeSlug !== storeSlug) {
    redirect(`/${session.storeSlug}/analytics/timeline`);
  }

  const cookieStore = await cookies();
  const timezone = safeTimezone(cookieStore.get("tz")?.value);
  const todayDateStr = getTodayDateString(timezone);

  const resolved = searchParams ? await searchParams : {};
  const rawDate = typeof resolved.date === "string" ? resolved.date : "";
  const date = rawDate && rawDate <= todayDateStr ? rawDate : todayDateStr;

  const data = await getTimelineData(storeSlug, date, timezone);

  if (!data) return null;

  return (
    <AppShell
      activeView="timeline"
      storeSlug={storeSlug}
      storeName={data.store.name}
      session={session}
      snapshot={data.snapshot}
      stores={data.stores}
    >
      <div className="page-stack">
        <div className="topbar-date">
          <div className="eyebrow">Analytics</div>
          <h2 className="page-title">Stylist Timeline</h2>
        </div>
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Floor Activity</p>
              <h3>Time with customers and downtime by stylist</h3>
            </div>
          </div>
          <StylistTimelineChart data={data} timezone={timezone} />
        </section>
      </div>
    </AppShell>
  );
}
