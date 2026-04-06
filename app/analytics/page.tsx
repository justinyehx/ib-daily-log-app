import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportFiltersForm } from "@/components/report-filters-form";
import { getCurrentSession } from "@/lib/auth";
import { formatMinutes, formatPercent } from "@/lib/reporting";
import { getAnalyticsData } from "@/lib/reporting-data";

export const dynamic = "force-dynamic";

type AnalyticsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function buildQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  updates: Record<string, string>
) {
  const params = new URLSearchParams();

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }

    if (typeof value === "string" && value) {
      params.set(key, value);
    }
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (!value) {
      params.delete(key);
      return;
    }

    params.set(key, value);
  });

  return `?${params.toString()}`;
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

          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Bridal Price Point</p>
                <h3>Price point for brides only</h3>
              </div>
            </div>
            <div className="stack-list">
              {analytics.bridalPriceMix.length ? (
                analytics.bridalPriceMix.map((item) => (
                  <div className="stack-item" key={item.label}>
                    <div className="stack-item-head">
                      <strong>{item.label}</strong>
                      <small>{item.value}</small>
                    </div>
                    <div className="bar">
                      <span
                        style={{
                          width: `${(item.value / (analytics.bridalPriceMix[0]?.value || 1)) * 100}%`
                        }}
                      ></span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No bridal price-point data in this reporting window.</p>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Bridal Size</p>
                <h3>Size mix for brides only</h3>
              </div>
            </div>
            <div className="stack-list">
              {analytics.bridalSizeMix.length ? (
                analytics.bridalSizeMix.map((item) => (
                  <div className="stack-item" key={item.label}>
                    <div className="stack-item-head">
                      <strong>{item.label}</strong>
                      <small>{item.value}</small>
                    </div>
                    <div className="bar">
                      <span
                        style={{
                          width: `${(item.value / (analytics.bridalSizeMix[0]?.value || 1)) * 100}%`
                        }}
                      ></span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="panel-copy">No bridal size data in this reporting window.</p>
              )}
            </div>
          </section>

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
