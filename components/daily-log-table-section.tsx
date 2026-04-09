"use client";

import { useRef, useState } from "react";

import { DailyLogWorkflowPanel } from "@/components/daily-log-workflow-panel";
import type { CustomerProfile } from "@/components/previous-customer-lookup";

// ─── Types ────────────────────────────────────────────────────────────────────

type Option = { id: string; label: string };
type StaffOption = { id: string; fullName: string; role: string };
type LocationOption = { id: string; name: string };
type StoreConfig = {
  storeId: string;
  slug: string;
  name: string;
  appointmentTypes: Option[];
  walkInTypes: Option[];
  leadSources: Option[];
  pricePoints: Option[];
  sizes: Option[];
  staffMembers: StaffOption[];
  locations: LocationOption[];
};

export type DailyLogRow = {
  // raw fields (used by the edit form)
  id: string;
  appointmentDateRaw: string;
  visitTypeRaw: string;
  assignedStaffMemberId: string;
  appointmentTypeOptionId: string;
  locationId: string;
  timeInRaw: string;
  timeOutRaw: string;
  leadSourceOptionId: string;
  pricePointOptionId: string;
  sizeOptionId: string;
  wearDateRaw: string;
  statusRaw: string;
  commentsRaw: string;
  // display fields (used by the table)
  storeName: string;
  date: string;
  guestName: string;
  assignedTo: string;
  appointmentType: string;
  visitType: string;
  location: string;
  timeIn: string;
  timeOut: string;
  duration: string;
  heardAbout: string;
  pricePoint: string;
  size: string;
  purchased: string;
  otherSale: string;
  status: string;
  comments: string;
  incompleteFields: string[];
};

type WorkflowOptions = {
  storeId: string;
  isVirtualStore: boolean;
  storeConfigs: StoreConfig[];
  appointmentTypes: Option[];
  walkInTypes: Option[];
  leadSources: Option[];
  pricePoints: Option[];
  sizes: Option[];
  staffMembers: StaffOption[];
  locations: LocationOption[];
};

type DailyLogTableSectionProps = {
  rows: DailyLogRow[];
  workflowOptions: WorkflowOptions;
  previousCustomerProfiles: CustomerProfile[];
  createAction: (formData: FormData) => void | Promise<void>;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  todayDate: string;
  defaultTime: string;
  initialEditId: string;
  showStoreColumn: boolean;
  rowCount: number;
  filterSummary: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DailyLogTableSection({
  rows,
  workflowOptions,
  previousCustomerProfiles,
  createAction,
  updateAction,
  deleteAction,
  todayDate,
  defaultTime,
  initialEditId,
  showStoreColumn,
  rowCount,
  filterSummary
}: DailyLogTableSectionProps) {
  const [editId, setEditId] = useState(initialEditId);
  const [editMode, setEditMode] = useState(Boolean(initialEditId));
  const workflowRef = useRef<HTMLDivElement>(null);

  function selectRow(rowId: string) {
    setEditId(rowId);
    setEditMode(true);
    // Scroll to the workflow form instantly — no page reload needed.
    workflowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleEditMode() {
    if (editMode) {
      setEditId("");
      setEditMode(false);
    } else {
      setEditMode(true);
    }
  }

  function handleCancelEdit() {
    setEditId("");
  }

  const editableRows = rows.map((row) => ({
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
  }));

  return (
    <>
      <div id="daily-log-workflow" ref={workflowRef}>
        <DailyLogWorkflowPanel
          appointmentTypes={workflowOptions.appointmentTypes}
          createAction={createAction}
          defaultTime={defaultTime}
          deleteAction={deleteAction}
          initialEditId={editId}
          isVirtualStore={workflowOptions.isVirtualStore}
          leadSources={workflowOptions.leadSources}
          locations={workflowOptions.locations}
          onCancelEdit={handleCancelEdit}
          pricePoints={workflowOptions.pricePoints}
          previousCustomerProfiles={previousCustomerProfiles}
          rows={editableRows}
          sizes={workflowOptions.sizes}
          staffMembers={workflowOptions.staffMembers}
          storeConfigs={workflowOptions.storeConfigs}
          storeId={workflowOptions.storeId}
          todayDate={todayDate}
          updateAction={updateAction}
          walkInTypes={workflowOptions.walkInTypes}
        />
      </div>

      <section className="panel compact-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Today&apos;s Entries</div>
            <h3 className="panel-title">Daily log table</h3>
          </div>
          <div className="daily-log-header-meta">
            <p className="panel-copy">{rowCount} matching rows</p>
            {rowCount ? (
              <button
                className="table-edit-link button-link"
                onClick={toggleEditMode}
                type="button"
              >
                {editMode ? "Done editing" : "Edit log"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="table-wrap compact-table">
          <table className="data-table daily-log-table">
            <thead>
              <tr>
                {showStoreColumn ? <th>Store</th> : null}
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
              {rows.length ? (
                rows.map((row) => {
                  const rowIsIncomplete = row.incompleteFields.length > 0;

                  return (
                    <tr
                      key={row.id}
                      aria-label={editMode ? `Edit ${row.guestName}` : undefined}
                      className={[
                        editId === row.id ? "selected-row" : "",
                        editMode ? "pick-row" : "",
                        rowIsIncomplete ? "incomplete-row" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={editMode ? () => selectRow(row.id) : undefined}
                      onKeyDown={
                        editMode
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                selectRow(row.id);
                              }
                            }
                          : undefined
                      }
                      role={editMode ? "button" : undefined}
                      tabIndex={editMode ? 0 : undefined}
                      title={rowIsIncomplete ? `Missing: ${row.incompleteFields.join(", ")}` : undefined}
                    >
                      {showStoreColumn ? <td>{row.storeName}</td> : null}
                      <td>{row.date}</td>
                      <td>
                        {editMode ? (
                          <button
                            className="table-edit-link button-link"
                            onClick={(event) => {
                              event.stopPropagation();
                              selectRow(row.id);
                            }}
                            type="button"
                          >
                            {row.guestName}
                          </button>
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
                  );
                })
              ) : (
                <tr>
                  <td colSpan={showStoreColumn ? 17 : 16}>
                    <div className="empty-state">No appointments match this reporting window yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
