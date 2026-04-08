import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DailyLogWorkflowPanel } from "@/components/daily-log-workflow-panel";
import { ReportFiltersForm } from "@/components/report-filters-form";
import { getCurrentSession } from "@/lib/auth";
import { getDailyLogData } from "@/lib/daily-log-data";
import { createDailyLogEntry, deleteDailyLogEntry, updateDailyLogEntry } from "@/lib/server/daily-log-actions";
import { buildQuery } from "@/lib/query-utils";

export const dynamic = "force-dynamic";

type DailyLogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DailyLogPage({ searchParams }: DailyLogPageProps) {
  const session = await getCurrentSession();
  if (!session.isAuthenticated) {
    redirect("/login");
  }
  if (session.role === "STYLIST") {
    redirect("/stylists");
  }
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const dailyLog = await getDailyLogData(session.storeSlug, resolvedSearchParams);
  const activeEditId = typeof resolvedSearchParams?.editId === "string" ? resolvedSearchParams.editId : "";
  const isEditMode = resolvedSearchParams?.editMode === "1";

  if (!dailyLog) {
    return null;
  }

  const now = new Date();
  const todayDate = now.toISOString().slice(0, 10);
  const defaultTime = `${`${now.getHours()}`.padStart(2, "0")}:${`${now.getMinutes()}`.padStart(2, "0")}`;
  const returnTo = buildQuery(resolvedSearchParams, { editId: "", editMode: "1" });

  return (
    <AppShell
      activeView="daily-log"
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
              <div className="summary-value">{dailyLog.rows.length}</div>
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

        <div id="daily-log-workflow">
          <DailyLogWorkflowPanel
            appointmentTypes={dailyLog.workflowOptions.appointmentTypes}
            createAction={createDailyLogEntry}
            deleteAction={deleteDailyLogEntry}
            defaultTime={defaultTime}
            initialEditId={activeEditId}
            leadSources={dailyLog.workflowOptions.leadSources}
            locations={dailyLog.workflowOptions.locations}
            pricePoints={dailyLog.workflowOptions.pricePoints}
            rows={dailyLog.rows.map((row) => ({
              id: row.id,
              appointmentDateRaw: row.appointmentDateRaw,
              guestName: row.guestName,
              visitTypeRaw: row.visitTypeRaw,
              assignedStaffMemberId: row.assignedStaffMemberId,
              appointmentTypeOptionId: row.appointmentTypeOptionId,
              locationId: row.locationId,
              timeInRaw: row.timeInRaw,
              timeOutRaw: row.timeOutRaw,
              leadSourceOptionId: row.leadSourceOptionId,
              pricePointOptionId: row.pricePointOptionId,
              sizeOptionId: row.sizeOptionId,
              wearDateRaw: row.wearDateRaw,
              statusRaw: row.statusRaw,
              commentsRaw: row.commentsRaw
            }))}
            previousCustomerProfiles={dailyLog.previousCustomerProfiles}
            sizes={dailyLog.workflowOptions.sizes}
            staffMembers={dailyLog.workflowOptions.staffMembers}
            storeId={dailyLog.workflowOptions.storeId}
            isVirtualStore={dailyLog.workflowOptions.isVirtualStore}
            storeConfigs={dailyLog.workflowOptions.storeConfigs}
            todayDate={todayDate}
            updateAction={updateDailyLogEntry}
            walkInTypes={dailyLog.workflowOptions.walkInTypes}
            returnTo={returnTo}
          />
        </div>

        <section className="panel compact-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Today&apos;s Entries</div>
              <h3 className="panel-title">Daily log table</h3>
            </div>
            <div className="daily-log-header-meta">
              <p className="panel-copy">{dailyLog.rows.length} matching rows</p>
              {dailyLog.rows.length ? (
                <Link
                  className="table-edit-link button-link"
                  href={`${buildQuery(resolvedSearchParams, {
                    editMode: isEditMode ? "" : "1",
                    editId: isEditMode ? "" : activeEditId
                  })}#daily-log-workflow`}
                >
                  {isEditMode ? "Done editing" : "Edit log"}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="table-wrap compact-table">
            <table className="data-table daily-log-table">
              <thead>
                <tr>
                  {dailyLog.store.slug === "galleria-curve" ? <th>Store</th> : null}
                  <th>Date</th>
                  <th>Guest</th>
                  <th>Assigned</th>
                  <th>Type</th>
                  <th>Visit</th>
                  <th>Location</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Duration</th>
                  <th>Heard From</th>
                  <th>Price</th>
                  <th>Size</th>
                  <th>Purchased</th>
                  <th>Other Sale</th>
                  <th>Status</th>
                  <th>Comments</th>
                </tr>
              </thead>
              <tbody>
                {dailyLog.rows.length ? (
                  dailyLog.rows.map((row) => (
                    <tr
                      key={row.id}
                      className={activeEditId === row.id ? "selected-row" : isEditMode ? "pick-row" : ""}
                    >
                      {dailyLog.store.slug === "galleria-curve" ? <td>{row.storeName}</td> : null}
                      <td>{row.date}</td>
                      <td>
                        {isEditMode ? (
                          <Link
                            className="table-edit-link button-link"
                            href={`${buildQuery(resolvedSearchParams, { editMode: "1", editId: row.id })}#daily-log-workflow`}
                          >
                            {row.guestName}
                          </Link>
                        ) : (
                          row.guestName
                        )}
                      </td>
                      <td>{row.assignedTo}</td>
                      <td>{row.appointmentType}</td>
                      <td>{row.visitType}</td>
                      <td>{row.location}</td>
                      <td>{row.timeIn}</td>
                      <td>{row.timeOut}</td>
                      <td>{row.duration}</td>
                      <td>{row.heardAbout}</td>
                      <td>{row.pricePoint}</td>
                      <td>{row.size}</td>
                      <td>{row.purchased}</td>
                      <td>{row.otherSale}</td>
                      <td>{row.status}</td>
                      <td className="daily-log-comment-cell">
                        <div className="daily-log-comment-text">{row.comments}</div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={dailyLog.store.slug === "galleria-curve" ? 17 : 16}>
                      <div className="empty-state">No appointments match this reporting window yet.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

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
              <button className="button" type="submit">
                Search
              </button>
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
                      <td>{row.assignedTo}</td>
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
