import { AppShell } from "@/components/app-shell";
import { CurrentCustomersPanel } from "@/components/current-customers-panel";
import { DashboardCheckInPanel } from "@/components/dashboard-check-in-panel";
import { getCurrentSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-data";
import {
  createDashboardCheckIn,
  quickCheckoutCurrentCustomer,
  updateCurrentCustomerStatus
} from "@/lib/server/dashboard-actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function formatToday(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeInput(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session.isAuthenticated) {
    redirect("/login");
  }
  if (session.role === "STYLIST") {
    redirect("/stylists");
  }

  const dashboard = await getDashboardData(session.storeSlug);

  if (!dashboard) {
    return (
      <main className="login-wrap">
        <section className="panel login-card">
          <div className="eyebrow">Store setup</div>
          <h1 className="panel-title">No default store was found.</h1>
          <p className="panel-copy">
            Check `APP_STORE_DEFAULT` in your env file and make sure that store exists in the
            database.
          </p>
        </section>
      </main>
    );
  }

  const now = new Date();
  const todayLabel = formatToday(now);
  const todayDate = formatDateInput(now);
  const defaultTime = formatTimeInput(now);

  return (
    <AppShell
      activeView="dashboard"
      storeName={dashboard.store.name}
      session={session}
      snapshot={{
        activeNow: dashboard.summary.activeNow,
        waiting: dashboard.summary.waiting,
        soldToday: dashboard.summary.soldToday
      }}
      stores={dashboard.stores}
    >
      <div className="page-stack">
        <header className="topbar">
          <div>
            <p className="eyebrow">Today</p>
            <h2>{todayLabel}</h2>
          </div>
          <div className="topbar-actions">
            <div className="pill">
              <span className="pill-dot"></span>
              Live floor view
            </div>
          </div>
        </header>

        <section className="hero dashboard-hero">
          <div className="hero-copy-block">
            <p className="eyebrow">Front Desk Command Center</p>
            <h3>Front desk dashboard</h3>
          </div>
          <div className="hero-panel">
            <div className="hero-stat">
              <span>Guests Logged</span>
              <strong>{dashboard.summary.checkedInToday}</strong>
            </div>
            <div className="hero-stat">
              <span>Still In Store</span>
              <strong>{dashboard.summary.activeNow + dashboard.summary.waiting}</strong>
            </div>
            <div className="hero-stat">
              <span>Checked Out</span>
              <strong>{dashboard.summary.checkedOutToday}</strong>
            </div>
            <div className="hero-stat">
              <span>Comebacks Scheduled</span>
              <strong>{dashboard.summary.comebacksScheduled}</strong>
            </div>
          </div>
        </section>

        <DashboardCheckInPanel
          action={createDashboardCheckIn}
          storeId={dashboard.quickCheckInOptions.storeId}
          isVirtualStore={dashboard.quickCheckInOptions.isVirtualStore}
          storeConfigs={dashboard.quickCheckInOptions.storeConfigs}
          todayDate={todayDate}
          defaultTime={defaultTime}
          appointmentTypes={dashboard.quickCheckInOptions.appointmentTypes}
          walkInTypes={dashboard.quickCheckInOptions.walkInTypes}
          leadSources={dashboard.quickCheckInOptions.leadSources}
          pricePoints={dashboard.quickCheckInOptions.pricePoints}
          sizes={dashboard.quickCheckInOptions.sizes}
          locations={dashboard.quickCheckInOptions.locations}
          staffMembers={dashboard.quickCheckInOptions.staffMembers.map((staffMember) => ({
            ...staffMember,
            role: staffMember.role
          }))}
          previousCustomerProfiles={dashboard.previousCustomerProfiles}
        />

        <CurrentCustomersPanel
          checkoutAction={quickCheckoutCurrentCustomer}
          customers={dashboard.currentCustomers}
          leadSourceOptions={dashboard.quickCheckInOptions.leadSources}
          pricePointOptions={dashboard.quickCheckInOptions.pricePoints}
          reasonOptions={dashboard.quickCheckInOptions.reasonDidNotBuyOptions}
          sizeOptions={dashboard.quickCheckInOptions.sizes}
          staffOptions={dashboard.quickCheckInOptions.staffMembers.map((staffMember) => ({
            ...staffMember,
            role: staffMember.role
          }))}
          updateStatusAction={updateCurrentCustomerStatus}
        />

        <div className="dashboard-grid">
          <section className="panel compact-panel">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Floor Snapshot</p>
                <h3>Appointments by type</h3>
              </div>
            </div>
            <div className="floor-snapshot-average">
              <span>Average appointment</span>
              <strong>{formatMinutes(dashboard.summary.averageDuration)}</strong>
            </div>
            <div className="stack-list">
              {dashboard.appointmentMix.length ? (
                dashboard.appointmentMix.map((item) => {
                  const max = dashboard.appointmentMix[0]?.value || 1;
                  return (
                    <div className="stack-item" key={item.label}>
                      <div className="stack-item-head">
                        <strong>{item.label}</strong>
                        <small>{item.value}</small>
                      </div>
                      <div className="bar">
                        <span style={{ width: `${(item.value / max) * 100}%` }}></span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="panel-note">No appointments logged today yet.</p>
              )}
            </div>
          </section>
        </div>

        <section className="panel full-width-panel compact-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Today&apos;s Entries</p>
              <h3>All customers logged today</h3>
            </div>
          </div>
          <div className="table-wrap compact-table">
            <table className="proto-table">
              <thead>
                <tr>
                  {dashboard.store.slug === "galleria-curve" ? <th>Store</th> : null}
                  <th>Guest</th>
                  <th>Stylist</th>
                  <th>Appt</th>
                  <th>Location</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Purchased</th>
                  <th>Other Sale</th>
                  <th>Comments</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.todayEntries.length ? (
                  dashboard.todayEntries.map((entry) => (
                    <tr key={entry.id}>
                      {dashboard.store.slug === "galleria-curve" ? <td>{entry.storeName}</td> : null}
                      <td>{entry.guestName}</td>
                      <td>{entry.assignedTo}</td>
                      <td>{entry.appointmentType}</td>
                      <td>{entry.location}</td>
                      <td>{entry.timeIn}</td>
                      <td>{entry.timeOut}</td>
                      <td>{entry.purchased}</td>
                      <td>{entry.otherSale}</td>
                      <td className="table-comment-one-line">{entry.comments}</td>
                      <td>
                        <span className={`chip ${entry.status.toLowerCase().replace(/\s+/g, "-")}`}>{entry.status}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={dashboard.store.slug === "galleria-curve" ? 11 : 10}>
                      <div className="empty-state">No customers logged today yet.</div>
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
