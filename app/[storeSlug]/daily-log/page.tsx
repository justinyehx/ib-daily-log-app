import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DailyLogTableSection } from "@/components/daily-log-table-section";
import { ReportFiltersForm } from "@/components/report-filters-form";
import { getCurrentSession } from "@/lib/auth";
import { getDailyLogData } from "@/lib/daily-log-data";
import { createDailyLogEntry, deleteDailyLogEntry, updateDailyLogEntry } from "@/lib/server/daily-log-actions";
import { formatStaffDisplayName } from "@/lib/staff-display";
import { canViewStoreSlug } from "@/lib/store-views";
import { getTodayDateString, safeTimezone } from "@/lib/tz-utils";

export const dynamic = "force-dynamic";

type DailyLogPageProps = {
  params: Promise<{ storeSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DailyLogPage({ params, searchParams }: DailyLogPageProps) {
  const { storeSlug } = await params;
  const session = await getCurrentSession();

  if (!session.isAuthenticated) redirect("/login");
  if (session.role === "STYLIST") redirect(`/${session.storeSlug}/stylists`);
  if (session.role !== "ADMIN" && !canViewStoreSlug(session.storeSlug, storeSlug)) {
    redirect(`/${session.storeSlug}/daily-log`);
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const cookieStore = await cookies();
  const timezone = safeTimezone(cookieStore.get("tz")?.value);
  const dailyLog = await getDailyLogData(storeSlug, resolvedSearchParams, timezone);
  const activeEditId = typeof resolvedSearchParams?.editId === "string" ? resolvedSearchParams.editId : "";

  if (!dailyLog) return null;

  const todayDate = getTodayDateString(timezone);
  const now = new Date();
  const defaultTime = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone
  }).format(now).replace(",", "").trim();

  return (
    <AppShell
      activeView="daily-log"
      storeSlug={storeSlug}
      storeName={dailyLog.store.name}
      session={session}
      snapshot={dailyLog.snapshot}
      stores={dailyLog.stores}
    >
      <div className="page-stack">
        <div className="topbar-date">
          <div className="eyebrow">Daily Log</div>
          <h2 className="page-title">View entries</h2>
        </div>

        <section className="hero-band daily-log-hero-band">
          <div className="hero-band-copy">
            <div className="eyebrow">Reporting Window</div>
            <h3 className="page-title">Daily log table</h3>
          </div>
          <div className="hero-band-stats">
            <article className="summary-card">
              <div className="summary-label">Reporting window</div>
              <div className="summary-value summary-value-small">{dailyLog.filterSummary}</div>
            </article>
            <article className="summary-card">
              <div className="summary-label">Customers</div>
              <div className="summary-value">{dailyLog.customerCount}</div>
            </article>
          </div>
        </section>

        <section className="panel compact-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Reporting Window</div>
              <h3 className="panel-title">Filter entries</h3>
            </div>
          </div>
          <ReportFiltersForm
            appointmentTypeOptions={dailyLog.appointmentTypeOptions}
            filters={dailyLog.filters}
            showPricePoint={false}
          />
        </section>

        <DailyLogTableSection
          rows={dailyLog.rows}
          workflowOptions={
            // Non-admin users in the combined view can only create appointments
            // for their own store — filter storeConfigs to prevent cross-store writes.
            session.role !== "ADMIN" && dailyLog.workflowOptions.isVirtualStore
              ? {
                  ...dailyLog.workflowOptions,
                  storeConfigs: dailyLog.workflowOptions.storeConfigs.filter(
                    (c) => c.slug === session.storeSlug
                  )
                }
              : dailyLog.workflowOptions
          }
          storeSlug={storeSlug}
          createAction={createDailyLogEntry}
          updateAction={updateDailyLogEntry}
          deleteAction={deleteDailyLogEntry}
          todayDate={todayDate}
          defaultTime={defaultTime}
          initialEditId={activeEditId}
          showStoreColumn={dailyLog.store.slug === "galleria-curve"}
          rowCount={dailyLog.rows.length}
          filterSummary={dailyLog.filterSummary}
        />

        <section className="panel compact-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Customer Search</div>
              <h3 className="panel-title">Search customer history by name</h3>
            </div>
          </div>

          <form className="filters-grid" method="get">
            <input type="hidden" name="view" value={dailyLog.filters.view} />
            <input type="hidden" name="day" value={dailyLog.filters.day} />
            <input type="hidden" name="week" value={dailyLog.filters.week} />
            <input type="hidden" name="month" value={dailyLog.filters.month} />
            <input type="hidden" name="year" value={dailyLog.filters.year} />
            <input type="hidden" name="visitType" value={dailyLog.filters.visitType} />
            <input type="hidden" name="appointmentType" value={dailyLog.filters.appointmentType} />
            <label className="field field-span-2">
              <span className="field-label">Customer name</span>
              <input
                className="input"
                name="customerName"
                placeholder="Search by guest name"
                defaultValue={dailyLog.filters.customerName}
              />
            </label>
            <div className="form-actions filter-actions">
              <button className="button" type="submit">Search</button>
            </div>
          </form>

          <div className="table-wrap compact-table">
            <table className="data-table daily-log-search-table">
              <thead>
                <tr>
                  {dailyLog.store.slug === "galleria-curve" ? <th>Store</th> : null}
                  <th>Date</th>
                  <th>Guest</th>
                  <th>Stylist</th>
                  <th>Appt</th>
                  <th>Location</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Heard From</th>
                  <th>Price</th>
                  <th>Purchased</th>
                  <th>Other Sale</th>
                  <th>Comments</th>
                </tr>
              </thead>
              <tbody>
                {dailyLog.searchRows.length ? (
                  dailyLog.searchRows.map((row) => (
                    <tr key={row.id}>
                      {dailyLog.store.slug === "galleria-curve" ? <td>{row.storeName}</td> : null}
                      <td>{row.date}</td>
                      <td>{row.guestName}</td>
                      <td>{formatStaffDisplayName(row.assignedTo)}</td>
                      <td>{row.appointmentType}</td>
                      <td>{row.location}</td>
                      <td>{row.timeIn}</td>
                      <td>{row.timeOut}</td>
                      <td>{row.heardAbout}</td>
                      <td>{row.pricePoint}</td>
                      <td>{row.purchased}</td>
                      <td>{row.otherSale}</td>
                      <td className="daily-log-comment-cell">
                        <div className="daily-log-comment-text">{row.comments}</div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={dailyLog.store.slug === "galleria-curve" ? 13 : 12}>
                      <div className="empty-state">
                        {dailyLog.filters.customerName
                          ? "No customer matches that search yet."
                          : "Search by customer name to view full history."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
