import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportFiltersForm } from "@/components/report-filters-form";
import { getCurrentSession } from "@/lib/auth";
import { formatMinutes, formatPercent } from "@/lib/reporting";
import { getAdminViewData, getStoreShellData } from "@/lib/reporting-data";
import { buildQuery } from "@/lib/query-utils";

// No force-dynamic needed: this page reads searchParams (already dynamic)
// and getCurrentSession() reads cookies (also a dynamic signal).

type AdminViewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminViewPage({ searchParams }: AdminViewPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getCurrentSession();
  if (!session.isAuthenticated) {
    redirect("/login");
  }
  if (session.role !== "ADMIN") {
    redirect("/dashboard");
  }
  const shell = await getStoreShellData(session.storeSlug);
  const admin = await getAdminViewData(resolvedSearchParams);

  if (!shell || !admin) {
    return null;
  }

  const hasSpecificFilters = Boolean(
    admin.filters.store ||
      admin.filters.pricePoint ||
      admin.filters.visitType ||
      admin.filters.appointmentType ||
      admin.filters.view !== "day"
  );
  const storePerformanceTitle = admin.filters.store
    ? `${admin.selectedStoreLabel || "Selected store"} performance`
    : "All four stores side by side";

  return (
    <AppShell
      activeView="admin-view"
      storeName={shell.store.name}
      session={session}
      snapshot={shell.snapshot}
      stores={shell.stores}
    >
      <div className="page-stack">
        <section className="panel report-toolbar">
          <div>
            <p className="panel-kicker">Reporting Window</p>
            <h3 className="panel-title">Store admin reporting</h3>
            {!hasSpecificFilters ? <p className="panel-copy">{admin.filterSummary}</p> : null}
          </div>
          <ReportFiltersForm
            appointmentTypeOptions={admin.appointmentTypeOptions}
            filters={admin.filters}
            pricePointOptions={admin.pricePointOptions}
            showStore
            showTwoWeek
            storeOptions={admin.storeOptions}
          />
        </section>

        <div className="stats-grid">
          {admin.summaryCards.map((card) => (
            <article className="summary-card" key={card.label}>
              <div className="summary-label">{card.label}</div>
              <div className={`summary-value ${card.compact ? "summary-value-small" : ""}`}>{card.value}</div>
            </article>
          ))}
        </div>

        <section className="panel full-width-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Store Performance</p>
              <h3>{storePerformanceTitle}</h3>
            </div>
          </div>
          <div className="table-wrap compact-table">
            <table className="data-table admin-store-table">
              <thead>
                <tr>
                  {[
                    ["storeLabel", "Store"],
                    ["guestsSeen", "Guests Seen"],
                    ["bridesSeen", "Brides Seen"],
                    ["bridesSold", "Brides Sold"],
                    ["closeRate", "Close Rate"],
                    ["cbRate", "CB Rate"],
                    ["addOnRate", "Add-on Rate"],
                    ["averageDuration", "Avg Duration"]
                  ].map(([key, label]) => {
                    const isActive = admin.storeSort.key === key;
                    const nextDirection =
                      isActive && admin.storeSort.direction === "desc" ? "asc" : "desc";

                    return (
                      <th key={key}>
                        <Link
                          className={`sort-button ${isActive ? "active" : ""}`}
                          href={buildQuery(resolvedSearchParams, {
                            storeSortKey: key,
                            storeSortDirection: nextDirection
                          })}
                        >
                          <span className="sort-button-label">{label}</span>
                          {isActive ? (
                            <span className="sort-button-arrow">
                              {admin.storeSort.direction === "asc" ? "↑" : "↓"}
                            </span>
                          ) : null}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {admin.stores.map((store) => (
                  <tr key={store.storeId}>
                    <td>{store.storeLabel}</td>
                    <td>{store.guestsSeen}</td>
                    <td>{store.bridesSeen}</td>
                    <td>{store.bridesSold}</td>
                    <td>{formatPercent(store.closeRate)}</td>
                    <td>{formatPercent(store.cbRate)}</td>
                    <td>{formatPercent(store.addOnRate)}</td>
                    <td>{formatMinutes(store.averageDuration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel full-width-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Top Performers</p>
              <h3>Stylist leaderboard across all stores</h3>
            </div>
          </div>
          <div className="table-wrap compact-table">
            <table className="data-table admin-leaderboard-table">
              <thead>
                <tr>
                  {[
                    ["name", "Stylist"],
                    ["storeLabel", "Store"],
                    ["guestsSeen", "Guests Seen"],
                    ["bridesSeen", "Brides Seen"],
                    ["bridesSold", "Brides Sold"],
                    ["closeRate", "Close Rate"],
                    ["averageDuration", "Avg Duration"],
                    ["cbRate", "CB Rate"],
                    ["addOnRate", "Add-on Rate"]
                  ].map(([key, label]) => {
                    const isActive = admin.leaderboardSort.key === key;
                    const nextDirection =
                      isActive && admin.leaderboardSort.direction === "desc" ? "asc" : "desc";

                    return (
                      <th key={key}>
                        <Link
                          className={`sort-button ${isActive ? "active" : ""}`}
                          href={buildQuery(resolvedSearchParams, {
                            sortKey: key,
                            sortDirection: nextDirection
                          })}
                        >
                          <span className="sort-button-label">{label}</span>
                          {isActive ? (
                            <span className="sort-button-arrow">
                              {admin.leaderboardSort.direction === "asc" ? "↑" : "↓"}
                            </span>
                          ) : null}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {admin.leaderboard.map((row) => (
                  <tr key={`${row.storeLabel}-${row.name}`}>
                    <td>{row.name}</td>
                    <td>{row.storeLabel}</td>
                    <td>{row.guestsSeen}</td>
                    <td>{row.bridesSeen}</td>
                    <td>{row.bridesSold}</td>
                    <td>{formatPercent(row.closeRate)}</td>
                    <td>{formatMinutes(row.averageDuration)}</td>
                    <td>{formatPercent(row.cbRate)}</td>
                    <td>{formatPercent(row.addOnRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
