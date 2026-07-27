import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportFiltersForm } from "@/components/report-filters-form";
import { getCurrentSession } from "@/lib/auth";
import { formatMinutes, formatPercent } from "@/lib/reporting";
import { formatStaffDisplayName } from "@/lib/staff-display";
import { getAnalyticsData } from "@/lib/reporting-data";
import { buildQuery } from "@/lib/query-utils";
import { canViewStoreSlug } from "@/lib/store-views";
import { safeTimezone } from "@/lib/tz-utils";

type AnalyticsPageProps = {
  params: Promise<{ storeSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function BreakdownTable({
  title,
  kicker,
  rows,
  emptyMessage,
  showVisitTypeSplit = false
}: {
  title: string;
  kicker: string;
  rows: Array<{ label: string; newBridesSeen: number; comebackBridesSeen: number; bridesSeen: number; bridesSold: number; closeRate: number }>;
  emptyMessage: string;
  showVisitTypeSplit?: boolean;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">{kicker}</p>
          <h3>{title}</h3>
        </div>
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table className="stylist-breakdown-table">
            <thead>
              <tr>
                <th>Category</th>
                {showVisitTypeSplit ? (
                  <>
                    <th>New Brides Seen</th>
                    <th>Comeback Brides Seen</th>
                  </>
                ) : (
                  <th>Brides Seen</th>
                )}
                <th>Brides Sold</th>
                <th>Closing %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {showVisitTypeSplit ? (
                    <>
                      <td>{row.newBridesSeen}</td>
                      <td>{row.comebackBridesSeen}</td>
                    </>
                  ) : (
                    <td>{row.bridesSeen}</td>
                  )}
                  <td>{row.bridesSold}</td>
                  <td>{formatPercent(row.closeRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="panel-copy">{emptyMessage}</p>
      )}
    </section>
  );
}

export default async function AnalyticsPage({ params, searchParams }: AnalyticsPageProps) {
  const { storeSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getCurrentSession();

  if (!session.isAuthenticated) redirect("/login");
  if (session.role === "USER" || session.role === "STYLIST") {
    redirect(`/${session.storeSlug}/${session.role === "STYLIST" ? "stylists" : "dashboard"}`);
  }
  if (session.role !== "ADMIN" && !canViewStoreSlug(session.storeSlug, storeSlug)) {
    redirect(`/${session.storeSlug}/analytics`);
  }

  const cookieStore = await cookies();
  const timezone = safeTimezone(cookieStore.get("tz")?.value);
  const analytics = await getAnalyticsData(storeSlug, resolvedSearchParams, timezone);

  if (!analytics) return null;

  return (
    <AppShell
      activeView="analytics"
      storeSlug={storeSlug}
      storeName={analytics.store.name}
      session={session}
      snapshot={analytics.snapshot}
      stores={analytics.stores}
    >
      <div className="page-stack">
        <section className="panel report-toolbar">
          <div>
            <p className="panel-kicker">Reporting Window</p>
            <h3 className="panel-title">Filter analytics</h3>
            <p className="panel-copy">{analytics.filterSummary}</p>
          </div>
          <ReportFiltersForm
            appointmentTypeOptions={analytics.appointmentTypeOptions}
            filters={{ ...analytics.filters, staffView: analytics.staffView }}
            pricePointOptions={analytics.pricePointOptions}
            showEmployeeView
            showTwoWeek
          />
        </section>

        <div className="stats-grid">
          {analytics.summaryCards.map((card) => (
            <article className="summary-card" key={card.label}>
              <div className="summary-label">{card.label}</div>
              <div className={`summary-value ${card.compact ? "summary-value-small" : ""}`}>{card.value}</div>
            </article>
          ))}
        </div>

        <section className="panel full-width-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Top Performers</p>
              <h3>Stylist leaderboard</h3>
            </div>
          </div>
          <div className="table-wrap compact-table">
            <table className="data-table leaderboard-table">
              <thead>
                <tr>
                  {[
                    ["name", "Stylist"],
                    ["guestsSeen", "Guests Seen"],
                    ["bridesSeen", "Brides Seen"],
                    ["bridesSold", "Brides Sold"],
                    ["closeRate", "Close Rate"],
                    ["averageDuration", "Avg Duration"],
                    ["cbRate", "CB Rate"],
                    ["addOnRate", "Add-on Rate"]
                  ].map(([key, label]) => {
                    const isActive = analytics.leaderboardSort.key === key;
                    const nextDirection =
                      isActive && analytics.leaderboardSort.direction === "desc" ? "asc" : "desc";
                    return (
                      <th key={key}>
                        <Link
                          className={`sort-button ${isActive ? "active" : ""}`}
                          href={buildQuery(resolvedSearchParams, { sortKey: key, sortDirection: nextDirection })}
                        >
                          <span className="sort-button-label">{label}</span>
                          {isActive ? (
                            <span className="sort-button-arrow">
                              {analytics.leaderboardSort.direction === "asc" ? "↑" : "↓"}
                            </span>
                          ) : null}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {analytics.leaderboard.length ? (
                  analytics.leaderboard.map((entry) => (
                    <tr key={entry.name}>
                      <td>{formatStaffDisplayName(entry.name)}</td>
                      <td>{entry.guestsSeen}</td>
                      <td>{entry.bridesSeen}</td>
                      <td>{entry.bridesSold}</td>
                      <td>{formatPercent(entry.closeRate)}</td>
                      <td>{formatMinutes(entry.averageDuration)}</td>
                      <td>{formatPercent(entry.cbRate)}</td>
                      <td>{formatPercent(entry.addOnRate)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">
                        {analytics.filteredAppointmentsCount
                          ? "This reporting window has appointments, but none are linked to a stylist yet."
                          : "No stylist data for this reporting window."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Insights</p>
              <h3>What this reporting window is showing</h3>
            </div>
          </div>
          <div className="insight-list">
            {analytics.insights.map((item) => (
              <p className="insight-item" key={item}>{item}</p>
            ))}
          </div>
        </section>

        <div className="analytics-breakdown-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Heard From</p>
                <h3>Heard-from mix</h3>
              </div>
            </div>
            <div className="stack-list">
              {analytics.leadSourceMix.length ? (
                analytics.leadSourceMix.map((item) => (
                  <div className="stack-item" key={item.label}>
                    <div className="stack-item-head">
                      <strong>{item.label}</strong>
                      <small>{item.value}</small>
                    </div>
                    <div className="bar">
                      <span style={{ width: `${(item.value / (analytics.leadSourceMix[0]?.value || 1)) * 100}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No heard-from data in this reporting window.</p>
              )}
            </div>
          </section>
          <BreakdownTable kicker="Bridal Price Point" title="Bridal close by price" rows={analytics.bridalPriceBreakdown} emptyMessage="No bridal price-point data in this reporting window." showVisitTypeSplit />
          <BreakdownTable kicker="Bridal Size" title="Bridal close by size" rows={analytics.bridalSizeBreakdown} emptyMessage="No bridal size data in this reporting window." showVisitTypeSplit />
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Reason Did Not Purchase</p>
                <h3>Count by reason</h3>
              </div>
            </div>
            <div className="stack-list">
              {analytics.reasonTallies.length ? (
                analytics.reasonTallies.map((item) => (
                  <div className="stack-item" key={item.label}>
                    <div className="stack-item-head">
                      <strong>{item.label}</strong>
                      <small>{item.value}</small>
                    </div>
                    <div className="bar">
                      <span style={{ width: `${(item.value / (analytics.reasonTallies[0]?.value || 1)) * 100}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No &quot;did not purchase&quot; reasons in this reporting window.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
