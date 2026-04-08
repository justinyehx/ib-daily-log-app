import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportFiltersForm } from "@/components/report-filters-form";
import { getCurrentSession } from "@/lib/auth";
import { formatMinutes, formatPercent } from "@/lib/reporting";
import { getAnalyticsData } from "@/lib/reporting-data";
import { buildQuery } from "@/lib/query-utils";

export const dynamic = "force-dynamic";

type AnalyticsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function BreakdownTable({
  title,
  kicker,
  rows,
  emptyMessage
}: {
  title: string;
  kicker: string;
  rows: Array<{ label: string; bridesSeen: number; bridesSold: number; closeRate: number }>;
  emptyMessage: string;
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
                <th>Brides Seen</th>
                <th>Brides Sold</th>
                <th>Closing %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.bridesSeen}</td>
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

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getCurrentSession();
  if (!session.isAuthenticated) {
    redirect("/login");
  }
  if (session.role === "USER" || session.role === "STYLIST") {
    redirect(session.role === "STYLIST" ? "/stylists" : "/dashboard");
  }
  const analytics = await getAnalyticsData(session.storeSlug, resolvedSearchParams);

  if (!analytics) {
    return null;
  }

  return (
    <AppShell
      activeView="analytics"
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
            filters={analytics.filters}
            pricePointOptions={analytics.pricePointOptions}
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
          {analytics.unassignedAppointmentsCount ? (
            <article className="summary-card">
              <div className="summary-label">Unassigned</div>
              <div className="summary-value">{analytics.unassignedAppointmentsCount}</div>
              <div className="summary-note">Excluded from stylist leaderboard</div>
            </article>
          ) : null}
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
                          href={buildQuery(resolvedSearchParams, {
                            sortKey: key,
                            sortDirection: nextDirection
                          })}
                        >
                          {label}
                          {isActive ? (analytics.leaderboardSort.direction === "asc" ? " ↑" : " ↓") : ""}
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
                      <td>{entry.name}</td>
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
                          ? analytics.unassignedAppointmentsCount
                            ? "This reporting window has appointments, but they are still unassigned and not yet tied to a stylist."
                            : "This reporting window has appointments, but none are linked to a stylist yet."
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
              <p className="insight-item" key={item}>
                {item}
              </p>
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
                      <span
                        style={{
                          width: `${(item.value / (analytics.leadSourceMix[0]?.value || 1)) * 100}%`
                        }}
                      ></span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No heard-from data in this reporting window.</p>
              )}
            </div>
          </section>

          <BreakdownTable
            kicker="Bridal Price Point"
            title="Bridal close by price"
            rows={analytics.bridalPriceBreakdown}
            emptyMessage="No bridal price-point data in this reporting window."
          />
          <BreakdownTable
            kicker="Bridal Size"
            title="Bridal close by size"
            rows={analytics.bridalSizeBreakdown}
            emptyMessage="No bridal size data in this reporting window."
          />

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
                      <span
                        style={{
                          width: `${(item.value / (analytics.reasonTallies[0]?.value || 1)) * 100}%`
                        }}
                      ></span>
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
