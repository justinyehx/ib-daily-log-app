"use client";

import { useRef, useMemo, useState } from "react";

import { formatStaffDisplayName } from "@/lib/staff-display";

import { DailyLogWorkflowPanel } from "@/components/daily-log-workflow-panel";
import type { CustomerProfile } from "@/components/previous-customer-lookup";

// ─── Sorting ──────────────────────────────────────────────────────────────────

type SortKey = keyof DailyLogRow;
type SortDir = "asc" | "desc";

const ROWS_PER_PAGE = 100;

function getSortValue(row: DailyLogRow, key: SortKey): string | number {
  switch (key) {
    case "appointmentDateRaw":
      return row.appointmentDateRaw;
    case "timeInRaw":
      return row.timeInRaw;
    case "timeOutRaw":
      return row.timeOutRaw || "99:99"; // push empty to bottom
    case "duration": {
      // compute numeric minutes for sorting
      if (!row.timeInRaw || !row.timeOutRaw) return -1;
      return new Date(row.timeOutRaw).getTime() - new Date(row.timeInRaw).getTime();
    }
    case "pricePoint": {
      // sort numerically by first dollar amount
      const match = row.pricePoint.match(/\d[\d,]*/);
      return match ? Number(match[0].replace(/,/g, "")) : Number.MAX_SAFE_INTEGER;
    }
    default:
      return (row[key] as string) ?? "";
  }
}

function sortRows(rows: DailyLogRow[], key: SortKey, dir: SortDir): DailyLogRow[] {
  return [...rows].sort((a, b) => {
    const av = getSortValue(a, key);
    const bv = getSortValue(b, key);
    const result =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return dir === "asc" ? result : -result;
  });
}

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
  storeId: string;
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
  purchasedRaw: string;
  otherSale: string;
  otherPurchaseRaw: string;
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
  /** Store view slug, used to scope the on-demand previous-customer search. */
  storeSlug: string;
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
  storeSlug,
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
  const [sortKey, setSortKey] = useState<SortKey>("appointmentDateRaw");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const workflowRef = useRef<HTMLDivElement>(null);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0); // re-sorting changes what's on page 1
  }

  const sortedRows = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  // Rendering thousands of <tr> at once is what made wide date ranges crawl.
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = useMemo(
    () => sortedRows.slice(safePage * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE + ROWS_PER_PAGE),
    [sortedRows, safePage]
  );
  const firstShown = sortedRows.length ? safePage * ROWS_PER_PAGE + 1 : 0;
  const lastShown = Math.min((safePage + 1) * ROWS_PER_PAGE, sortedRows.length);

  // If the row set shrinks (new filter), don't strand the user on an empty page.
  if (page !== safePage) {
    setPage(safePage);
  }

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
    storeId: row.storeId,
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
    purchasedRaw: row.purchasedRaw,
    otherPurchaseRaw: row.otherPurchaseRaw,
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
          lookupStoreSlug={storeSlug}
          pricePoints={workflowOptions.pricePoints}
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
                {(
                  [
                    ["appointmentDateRaw", "Date"],
                    ["guestName", "Guest"],
                    ["assignedTo", "Assigned"],
                    ["appointmentType", "Type"],
                    ["visitType", "Visit"],
                    ["location", "Location"],
                    ["timeInRaw", "Time In"],
                    ["timeOutRaw", "Time Out"],
                    ["duration", "Duration"],
                    ["heardAbout", "Heard From"],
                    ["pricePoint", "Price"],
                    ["size", "Size"],
                    ["purchased", "Purchased"],
                    ["otherSale", "Other Sale"],
                    ["status", "Status"],
                    ["comments", "Comments"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => {
                  const isActive = sortKey === key;
                  return (
                    <th key={key}>
                      <button
                        className={`sort-button${isActive ? " active" : ""}`}
                        onClick={() => handleSort(key)}
                        type="button"
                      >
                        <span className="sort-button-label">{label}</span>
                        {isActive ? (
                          <span className="sort-button-arrow">{sortDir === "asc" ? "↑" : "↓"}</span>
                        ) : null}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pagedRows.length ? (
                pagedRows.map((row) => {
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
                      <td>{formatStaffDisplayName(row.assignedTo)}</td>
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

        {pageCount > 1 ? (
          <div className="table-pager">
            <span className="table-pager-status">
              Showing {firstShown}–{lastShown} of {sortedRows.length}
            </span>
            <div className="table-pager-controls">
              <button
                className="button secondary"
                disabled={safePage === 0}
                onClick={() => setPage(0)}
                type="button"
              >
                « First
              </button>
              <button
                className="button secondary"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                type="button"
              >
                ‹ Prev
              </button>
              <span className="table-pager-page">
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                className="button secondary"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                type="button"
              >
                Next ›
              </button>
              <button
                className="button secondary"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(pageCount - 1)}
                type="button"
              >
                Last »
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
