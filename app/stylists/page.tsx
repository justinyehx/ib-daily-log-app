import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportFiltersForm } from "@/components/report-filters-form";
import { getCurrentSession } from "@/lib/auth";
import { formatMinutes, formatPercent } from "@/lib/reporting";
import { getStylistsData } from "@/lib/reporting-data";
import { buildQuery } from "@/lib/query-utils";

export const dynamic = "force-dynamic";

type StylistsPageProps = {
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
    <section className="panel stylist-breakdown-card">
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
        <div className="stylist-breakdown-empty">{emptyMessage}</div>
      )}
    </section>
  );
}

export default async function StylistsPage({ searchParams }: StylistsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getCurrentSession();
  if (!session.isAuthenticated) {
    redirect("/login");
  }
  if (session.role === "USER") {
    redirect("/dashboard");
  }
  const forcedSearchParams =
    session.role === "STYLIST"
      ? { ...(resolvedSearchParams || {}), stylist: session.fullName }
      : resolvedSearchParams;
  const stylists = await getStylistsData(session.storeSlug, forcedSearchParams);

  if (!stylists) {
    return null;
  }

  return (
    <AppShell
      activeView="stylists"
      storeName={stylists.store.name}
      session={session}
      snapshot={stylists.snapshot}
      stores={stylists.stores}
    >
      <div className="page-stack">
        <section className="panel report-toolbar">
          <div>
            <p className="panel-kicker">Reporting Window</p>
            <h3 className="panel-title">Stylist reporting</h3>
            <p className="panel-copy">{stylists.filterSummary}</p>
          </div>
          <ReportFiltersForm
            appointmentTypeOptions={stylists.appointmentTypeOptions}
            filters={stylists.filters}
            pricePointOptions={stylists.pricePointOptions}
            showTwoWeek
          />
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Individual Performance</p>
              <h3>Stylist scorecards</h3>
            </div>
          </div>
          <div className="stylist-grid">
            {stylists.leaderboard.length ? (
              stylists.leaderboard
                .filter(
                  (entry) =>
                    entry.appointmentsCount > 0 ||
                    entry.bridesSeen > 0 ||
                    entry.bridesSold > 0 ||
                    entry.averageDuration > 0 ||
                    entry.cbRate > 0 ||
                    entry.addOnRate > 0
                )
                .filter((entry) => session.role !== "STYLIST" || entry.name === session.fullName)
                .map((entry) => (
                <Link
                  className={`score-card panel subtle-panel ${stylists.selectedStylist === entry.name ? "selected-card" : ""}`}
                  href={`${buildQuery(forcedSearchParams, { stylist: entry.name })}#stylist-detail`}
                  key={entry.name}
                >
                  <div className="score-card-top">
                    <div>
                      <p className="panel-kicker">Stylist</p>
                      <h3>{entry.name}</h3>
                    </div>
                    <span className="chip">{formatPercent(entry.closeRate)} close</span>
                  </div>
                  <div className="score-grid">
                    <div>
                      <span className="summary-label">Appointments</span>
                      <strong className="score-value">{entry.appointmentsCount}</strong>
                    </div>
                    <div>
                      <span className="summary-label">Brides Seen</span>
                      <strong className="score-value">{entry.bridesSeen}</strong>
                    </div>
                    <div>
                      <span className="summary-label">Brides Sold</span>
                      <strong className="score-value">{entry.bridesSold}</strong>
                    </div>
                    <div>
                      <span className="summary-label">Avg Time</span>
                      <strong className="score-value">{formatMinutes(entry.averageDuration)}</strong>
                    </div>
                    <div>
                      <span className="summary-label">CB Rate</span>
                      <strong className="score-value">{formatPercent(entry.cbRate)}</strong>
                    </div>
                    <div>
                      <span className="summary-label">Add-ons</span>
                      <strong className="score-value">{formatPercent(entry.addOnRate)}</strong>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="empty-state">
                {stylists.filteredAppointmentsCount
                  ? "This reporting window has appointments, but none are tied to a stylist assignment yet."
                  : "No stylist data for this reporting window."}
              </div>
            )}
          </div>
        </section>

        <section className="panel" id="stylist-detail">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Stylist Detail</p>
              <h3>{stylists.selectedStylist ? `${stylists.selectedStylist} performance` : "Select a stylist"}</h3>
            </div>
          </div>

          {stylists.selectedMetrics ? (
            <>
              <div className="stylist-detail-grid">
                {stylists.detailSummaryCards.map((card) => (
                  <article className="summary-card" key={card.label}>
                    <div className="summary-label">{card.label}</div>
                    <div className={`summary-value ${card.compact ? "summary-value-small" : ""}`}>{card.value}</div>
                  </article>
                ))}
              </div>

              <div className="stylist-breakdown-grid">
                <BreakdownTable
                  kicker="Bridal Visit Type"
                  title="Scheduled and walk-in bridal performance"
                  rows={stylists.visitTypeBreakdown}
                  emptyMessage="No bridal visit-type data in this reporting window."
                />
                <BreakdownTable
                  kicker="Price Point"
                  title="Bridal close by price"
                  rows={stylists.priceBreakdown}
                  emptyMessage="No bridal price-point data in this reporting window."
                />
                <BreakdownTable
                  kicker="Size"
                  title="Bridal close by size"
                  rows={stylists.sizeBreakdown}
                  emptyMessage="No bridal size data in this reporting window."
                />
                <section className="panel stylist-breakdown-card">
                  <div className="panel-head">
                    <div>
                      <p className="panel-kicker">Reason Did Not Purchase</p>
                      <h3>Tally by reason</h3>
                    </div>
                  </div>
                  {stylists.detailReasonTallies.length ? (
                    <div className="stack-list">
                      {stylists.detailReasonTallies.map((item) => (
                        <div className="stack-item" key={item.label}>
                          <div className="stack-item-head">
                            <strong>{item.label}</strong>
                            <small>{item.value}</small>
                          </div>
                          <div className="bar">
                            <span
                              style={{
                                width: `${(item.value / (stylists.detailReasonTallies[0]?.value || 1)) * 100}%`
                              }}
                            ></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="stylist-breakdown-empty">
                      No &quot;did not purchase&quot; reasons in this reporting window.
                    </div>
                  )}
                </section>
              </div>

              <div className="table-wrap compact-table">
                <table className="data-table stylist-detail-table">
                  <thead>
                    <tr>
                      {stylists.store.slug === "galleria-curve" ? <th>Store</th> : null}
                      <th>Date</th>
                      <th>Guest</th>
                      <th>Appt</th>
                      <th>Visit</th>
                      <th>Location</th>
                      <th>Time In</th>
                      <th>Time Out</th>
                      <th>Duration</th>
                      <th>Purchased</th>
                      <th>Other Sale</th>
                      <th className="stylist-comment-column">Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stylists.appointmentRows.map((row) => (
                      <tr key={row.id}>
                        {stylists.store.slug === "galleria-curve" ? <td>{row.storeLabel}</td> : null}
                        <td>{row.date}</td>
                        <td>{row.guestName}</td>
                        <td>{row.appointmentType}</td>
                        <td>{row.visitType}</td>
                        <td>{row.location}</td>
                        <td>{row.timeIn}</td>
                        <td>{row.timeOut}</td>
                        <td>{row.duration}</td>
                        <td>{row.purchased}</td>
                        <td>{row.otherSale}</td>
                        <td className="stylist-comment-cell">{row.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="stylist-detail-empty">
              {stylists.hasStylistData
                ? "Choose a stylist card to see their summary and every customer they worked with in the selected reporting window."
                : "Once a reporting window contains stylist-linked appointments, the selected stylist detail will show here."}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
