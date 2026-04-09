import Link from "next/link";

import { SubmitButton } from "@/components/submit-button";

type BridalLiveAppointmentRow = {
  id: string;
  storeId: string;
  storeName: string;
  guestName: string;
  scheduledTime: string;
  appointmentType: string;
  mappedAppointmentType: string | null;
  associate: string;
  fittingRoom: string;
  isConfirmed: boolean;
  isCheckedIn: boolean;
  isNoShow: boolean;
  dailyLogEntryId: string;
  hasMapping: boolean;
};

type BridalLiveAppointmentsPanelProps = {
  storeSlug: string;
  appointments: BridalLiveAppointmentRow[];
  showStoreColumn?: boolean;
  configured: boolean;
  lastSyncedAt: string;
  selectedAppointmentId?: string;
  syncAction: (formData: FormData) => void | Promise<void>;
  markNoShowAction: (formData: FormData) => void | Promise<void>;
};

export function BridalLiveAppointmentsPanel({
  storeSlug,
  appointments,
  showStoreColumn = false,
  configured,
  lastSyncedAt,
  selectedAppointmentId = "",
  syncAction,
  markNoShowAction
}: BridalLiveAppointmentsPanelProps) {
  const upcomingCount = appointments.filter((appointment) => !appointment.isNoShow && !appointment.isCheckedIn).length;
  const checkedInCount = appointments.filter((appointment) => appointment.isCheckedIn).length;
  const noShowCount = appointments.filter((appointment) => appointment.isNoShow).length;

  return (
    <section className="panel full-width-panel compact-panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">BridalLive Appointments</p>
          <h3>Today&apos;s scheduled appointments</h3>
          <p className="panel-note">
            {configured
              ? `${lastSyncedAt ? `Last synced ${lastSyncedAt} · ` : ""}${upcomingCount} upcoming · ${checkedInCount} checked in · ${noShowCount} no show`
              : "Add BridalLive credentials to enable appointment sync for check-in."}
          </p>
        </div>
        {configured ? (
          <form action={syncAction}>
            <input type="hidden" name="storeSlug" value={storeSlug} />
            <SubmitButton className="button secondary" pendingLabel="Syncing...">
              Sync appointments
            </SubmitButton>
          </form>
        ) : null}
      </div>

      <div className="table-wrap compact-table">
        <table className="proto-table">
          <thead>
            <tr>
              {showStoreColumn ? <th>Store</th> : null}
              <th>Guest</th>
              <th>Scheduled</th>
              <th>Type</th>
              <th>Associate</th>
              <th>Room</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {appointments.length ? (
              appointments.map((appointment) => {
                const statusLabel = appointment.isNoShow
                  ? "No show"
                  : appointment.isCheckedIn
                    ? "Checked in"
                    : "Upcoming";

                return (
                  <tr key={appointment.id} className={selectedAppointmentId === appointment.id ? "selected-row" : ""}>
                    {showStoreColumn ? <td>{appointment.storeName}</td> : null}
                    <td>{appointment.guestName}</td>
                    <td>{appointment.scheduledTime}</td>
                    <td>
                      <div>{appointment.appointmentType}</div>
                      {!appointment.hasMapping ? (
                        <div className="minor-note">Needs mapping</div>
                      ) : appointment.mappedAppointmentType &&
                        appointment.mappedAppointmentType !== appointment.appointmentType ? (
                        <div className="minor-note">Daily Log: {appointment.mappedAppointmentType}</div>
                      ) : null}
                    </td>
                    <td>{appointment.associate}</td>
                    <td>{appointment.fittingRoom}</td>
                    <td>
                      <span className={`chip ${statusLabel.toLowerCase().replace(/\s+/g, "-")}`}>{statusLabel}</span>
                    </td>
                    <td>
                      {appointment.isNoShow ? (
                        <span className="minor-note">Marked no show</span>
                      ) : appointment.isCheckedIn ? (
                        <span className="minor-note">Added to Daily Log</span>
                      ) : appointment.hasMapping ? (
                        <div className="bridallive-actions">
                          <Link className="button secondary small-button" href={`/dashboard?bridalLiveAppointmentId=${appointment.id}`}>
                            Check in
                          </Link>
                          <form action={markNoShowAction}>
                            <input type="hidden" name="bridalLiveAppointmentId" value={appointment.id} />
                            <SubmitButton className="button ghost small-button" pendingLabel="Saving...">
                              No show
                            </SubmitButton>
                          </form>
                        </div>
                      ) : (
                        <span className="minor-note">Map type first</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={showStoreColumn ? 8 : 7}>
                  <div className="empty-state">No BridalLive appointments synced for today yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
