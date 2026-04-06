"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { SubmitButton } from "@/components/submit-button";

type Option = {
  id: string;
  label: string;
};

type StaffOption = {
  id: string;
  fullName: string;
  role: string;
};

type LocationOption = {
  id: string;
  name: string;
};

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

type DailyLogEditableRow = {
  id: string;
  appointmentDateRaw: string;
  guestName: string;
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
};

type DailyLogWorkflowPanelProps = {
  createAction: (formData: FormData) => void | Promise<void>;
  updateAction: (formData: FormData) => void | Promise<void>;
  storeId: string;
  todayDate: string;
  defaultTime: string;
  appointmentTypes: Option[];
  walkInTypes: Option[];
  leadSources: Option[];
  pricePoints: Option[];
  sizes: Option[];
  staffMembers: StaffOption[];
  locations: LocationOption[];
  rows: DailyLogEditableRow[];
  initialEditId?: string;
  previousCustomerProfiles: Array<{
    id: string;
    guestName: string;
    normalizedGuestName: string;
    lastVisitDate: string;
    appointmentType: string;
    visitType: "Appointment" | "Walk-in";
    assignedTo: string;
    location: string;
    wearDate: string;
    heardAbout: string;
    pricePoint: string;
    size: string;
    purchased: string;
      otherSale: string;
      comments: string;
      hasPreviousPurchase: boolean;
      storeId?: string;
      storeName?: string;
  }>;
  isVirtualStore?: boolean;
  storeConfigs?: StoreConfig[];
};

type FormState = {
  appointmentId: string;
  guestName: string;
  visitType: "APPOINTMENT" | "WALK_IN";
  appointmentTypeOptionId: string;
  assignedStaffMemberId: string;
  locationId: string;
  appointmentDate: string;
  timeIn: string;
  timeOut: string;
  wearDate: string;
  leadSourceOptionId: string;
  pricePointOptionId: string;
  sizeOptionId: string;
  comments: string;
  status: "ACTIVE" | "WAITING" | "COMPLETE";
};

function emptyState(todayDate: string, defaultTime: string): FormState {
  return {
    appointmentId: "",
    guestName: "",
    visitType: "APPOINTMENT",
    appointmentTypeOptionId: "",
    assignedStaffMemberId: "",
    locationId: "",
    appointmentDate: todayDate,
    timeIn: defaultTime,
    timeOut: "",
    wearDate: "",
    leadSourceOptionId: "",
    pricePointOptionId: "",
    sizeOptionId: "",
    comments: "",
    status: "ACTIVE"
  };
}

function isAlterationLabel(value: string) {
  return value.toLowerCase().includes("alteration");
}

function findDefaultTypeId(options: Option[]) {
  return options.find((option) => option.label.toLowerCase() === "new bride")?.id || "";
}

function formatDateLabel(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function getCurrentTimeValue() {
  const now = new Date();
  const hours = `${now.getHours()}`.padStart(2, "0");
  const minutes = `${now.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function fromRow(row: DailyLogEditableRow): FormState {
  return {
    appointmentId: row.id,
    guestName: row.guestName,
    visitType: row.visitTypeRaw === "WALK_IN" ? "WALK_IN" : "APPOINTMENT",
    appointmentTypeOptionId: row.appointmentTypeOptionId,
    assignedStaffMemberId: row.assignedStaffMemberId,
    locationId: row.locationId,
    appointmentDate: row.appointmentDateRaw,
    timeIn: row.timeInRaw,
    timeOut: row.timeOutRaw,
    wearDate: row.wearDateRaw,
    leadSourceOptionId: row.leadSourceOptionId,
    pricePointOptionId: row.pricePointOptionId,
    sizeOptionId: row.sizeOptionId,
    comments: row.commentsRaw,
    status:
      row.statusRaw === "WAITING" ? "WAITING" : row.statusRaw === "COMPLETE" ? "COMPLETE" : "ACTIVE"
  };
}

export function DailyLogWorkflowPanel({
  createAction,
  updateAction,
  storeId,
  isVirtualStore = false,
  storeConfigs = [],
  todayDate,
  defaultTime,
  appointmentTypes,
  walkInTypes,
  leadSources,
  pricePoints,
  sizes,
  staffMembers,
  locations,
  rows,
  initialEditId,
  previousCustomerProfiles
}: DailyLogWorkflowPanelProps) {
  const defaultStoreId = storeConfigs[0]?.storeId || storeId;
  const defaultAppointmentTypeId = useMemo(() => findDefaultTypeId(appointmentTypes), [appointmentTypes]);
  const defaultWalkInTypeId = useMemo(() => findDefaultTypeId(walkInTypes), [walkInTypes]);
  const [selectedStoreId, setSelectedStoreId] = useState(defaultStoreId);
  const [formState, setFormState] = useState<FormState>(() => ({
    ...emptyState(todayDate, defaultTime),
    appointmentTypeOptionId: defaultAppointmentTypeId
  }));
  const [timeTouched, setTimeTouched] = useState(false);
  const deferredGuestName = useDeferredValue(formState.guestName);

  const isEditing = Boolean(formState.appointmentId);
  const activeStoreConfig = useMemo(
    () => storeConfigs.find((entry) => entry.storeId === selectedStoreId) || null,
    [selectedStoreId, storeConfigs]
  );
  const activeAppointmentTypes = activeStoreConfig?.appointmentTypes || appointmentTypes;
  const activeWalkInTypes = activeStoreConfig?.walkInTypes || walkInTypes;
  const activeLeadSources = activeStoreConfig?.leadSources || leadSources;
  const activePricePoints = activeStoreConfig?.pricePoints || pricePoints;
  const activeSizes = activeStoreConfig?.sizes || sizes;
  const activeStaffMembers = activeStoreConfig?.staffMembers || staffMembers;
  const activeLocations = activeStoreConfig?.locations || locations;
  const typeOptions = formState.visitType === "WALK_IN" ? activeWalkInTypes : activeAppointmentTypes;
  const selectedTypeLabel =
    typeOptions.find((option) => option.id === formState.appointmentTypeOptionId)?.label || "";
  const useSeamstressField = isAlterationLabel(selectedTypeLabel);
  const visibleStaffMembers = activeStaffMembers.filter((staffMember) =>
    useSeamstressField ? staffMember.role === "SEAMSTRESS" : staffMember.role !== "SEAMSTRESS"
  );
  const deferredQuery = deferredGuestName.trim().toLowerCase();
  const leadSourceByLabel = useMemo(
    () => new Map(activeLeadSources.map((option) => [option.label.toLowerCase(), option.id])),
    [activeLeadSources]
  );

  const rowMap = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const matches = useMemo(() => {
    if (isEditing || deferredQuery.length < 2) return [];

    return previousCustomerProfiles
      .filter(
        (profile) =>
          profile.normalizedGuestName.includes(deferredQuery) ||
          profile.guestName.toLowerCase().includes(deferredQuery)
      )
      .slice(0, 5);
  }, [deferredQuery, isEditing, previousCustomerProfiles]);

  useEffect(() => {
    if (!initialEditId) return;
    const row = rowMap.get(initialEditId);
    if (!row) return;
    setTimeTouched(true);
    setFormState(fromRow(row));
  }, [initialEditId, rowMap]);

  useEffect(() => {
    if (isEditing || timeTouched) return;

    setFormState((current) => ({ ...current, timeIn: getCurrentTimeValue() }));
    const interval = window.setInterval(() => {
      setFormState((current) => {
        if (current.appointmentId) return current;
        return { ...current, timeIn: getCurrentTimeValue() };
      });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [isEditing, timeTouched]);

  useEffect(() => {
    if (isEditing) return;
    setFormState((current) => ({
      ...current,
      appointmentTypeOptionId:
        current.visitType === "WALK_IN"
          ? findDefaultTypeId(activeWalkInTypes)
          : findDefaultTypeId(activeAppointmentTypes),
      assignedStaffMemberId: "",
      locationId: "",
      leadSourceOptionId: "",
      pricePointOptionId: "",
      sizeOptionId: ""
    }));
  }, [selectedStoreId, isEditing, activeAppointmentTypes, activeWalkInTypes]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState((current) => {
      const next = { ...current, [key]: value };

      if (
        (key === "appointmentTypeOptionId" || key === "visitType") &&
        isAlterationLabel(
          (next.visitType === "WALK_IN" ? activeWalkInTypes : activeAppointmentTypes).find(
            (option) => option.id === next.appointmentTypeOptionId
          )?.label || ""
        )
      ) {
        next.leadSourceOptionId = leadSourceByLabel.get("previous purchase") || next.leadSourceOptionId;
      }

      return next;
    });
  }

  function cancelEdit() {
    setTimeTouched(false);
    setFormState({
      ...emptyState(todayDate, defaultTime),
      appointmentTypeOptionId: defaultAppointmentTypeId
    });
  }

  function applyPreviousCustomer(profile: DailyLogWorkflowPanelProps["previousCustomerProfiles"][number]) {
    const inferredLeadSource = profile.hasPreviousPurchase ? "previous purchase" : "comeback";
    const matchingStoreConfig =
      (profile.storeId ? storeConfigs.find((entry) => entry.storeId === profile.storeId) : null) || activeStoreConfig;
    if (profile.storeId) {
      setSelectedStoreId(profile.storeId);
    }
    setTimeTouched(false);
    setFormState({
      appointmentId: "",
      guestName: profile.guestName,
      visitType: profile.visitType === "Walk-in" ? "WALK_IN" : "APPOINTMENT",
      appointmentTypeOptionId: "",
      assignedStaffMemberId:
        (matchingStoreConfig?.staffMembers || activeStaffMembers).find((staffMember) => staffMember.fullName === profile.assignedTo)?.id || "",
      locationId: (matchingStoreConfig?.locations || activeLocations).find((location) => location.name === profile.location)?.id || "",
      appointmentDate: todayDate,
      timeIn: getCurrentTimeValue(),
      timeOut: "",
      wearDate: profile.wearDate || "",
      leadSourceOptionId: leadSourceByLabel.get(inferredLeadSource) || "",
      pricePointOptionId:
        (matchingStoreConfig?.pricePoints || activePricePoints).find((pricePoint) => pricePoint.label === profile.pricePoint)?.id || "",
      sizeOptionId: (matchingStoreConfig?.sizes || activeSizes).find((size) => size.label === profile.size)?.id || "",
      comments: profile.comments || "",
      status: "ACTIVE"
    });
  }

  function resetCreateForm() {
    setTimeTouched(false);
    setSelectedStoreId(defaultStoreId);
    setFormState({
      ...emptyState(todayDate, getCurrentTimeValue()),
      appointmentTypeOptionId: defaultAppointmentTypeId
    });
  }

  return (
    <section className="panel compact-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Front Desk Workflow</div>
          <h3 className="panel-title">{isEditing ? "Edit entry" : "Add appointment"}</h3>
        </div>
        {isEditing ? (
          <button className="button secondary" onClick={cancelEdit} type="button">
            Cancel edit
          </button>
        ) : null}
      </div>

      <form
        action={
          isEditing
            ? updateAction
            : async (formData) => {
                await createAction(formData);
                resetCreateForm();
              }
        }
        className="daily-log-workflow-form"
      >
        <input type="hidden" name="storeId" value={selectedStoreId || storeId} />
        <input type="hidden" name="appointmentId" value={formState.appointmentId} />

        <div className="form-grid dense-form daily-log-dense-form">
          <label className="field">
            <span className="field-label">Guest name</span>
            <input
              className="input"
              name="guestName"
              onChange={(event) => patch("guestName", event.target.value)}
              required
              value={formState.guestName}
            />
          </label>

          <label className="field">
            <span className="field-label">Visit type</span>
            <select
              className="select"
              name="visitType"
              onChange={(event) => {
                const nextVisitType = event.target.value as "APPOINTMENT" | "WALK_IN";
                setFormState((current) => ({
                  ...current,
                  visitType: nextVisitType,
                  appointmentTypeOptionId:
                    nextVisitType === "WALK_IN" ? defaultWalkInTypeId : defaultAppointmentTypeId
                }));
              }}
              value={formState.visitType}
            >
              <option value="APPOINTMENT">Appointment</option>
              <option value="WALK_IN">Walk-in</option>
            </select>
          </label>

          {isVirtualStore && !isEditing ? (
            <label className="field">
              <span className="field-label">Store</span>
              <select
                className="select"
                value={selectedStoreId}
                onChange={(event) => setSelectedStoreId(event.target.value)}
              >
                {storeConfigs.map((config) => (
                  <option key={config.storeId} value={config.storeId}>
                    {config.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="field">
            <span className="field-label">Appointment type</span>
            <select
              className="select"
              name="appointmentTypeOptionId"
              onChange={(event) => patch("appointmentTypeOptionId", event.target.value)}
              required
              value={formState.appointmentTypeOptionId}
            >
              <option value="">Select appointment type</option>
              {typeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Appointment date</span>
            <input
              className="input"
              name="appointmentDate"
              onChange={(event) => patch("appointmentDate", event.target.value)}
              required
              type="date"
              value={formState.appointmentDate}
            />
          </label>

          <label className="field">
            <span className="field-label">Time in</span>
            <input
              className="input"
              name="timeIn"
              onChange={(event) => {
                setTimeTouched(true);
                patch("timeIn", event.target.value);
              }}
              required
              type="time"
              value={formState.timeIn}
            />
          </label>

          <label className="field">
            <span className="field-label">Time out</span>
            <input
              className="input"
              name="timeOut"
              onChange={(event) => patch("timeOut", event.target.value)}
              type="time"
              value={formState.timeOut}
            />
          </label>

          <label className="field">
            <span className="field-label">{useSeamstressField ? "Seamstress" : "Stylist"}</span>
            <select
              className="select"
              name="assignedStaffMemberId"
              onChange={(event) => patch("assignedStaffMemberId", event.target.value)}
              value={formState.assignedStaffMemberId}
            >
              <option value="">{useSeamstressField ? "Select seamstress" : "Select stylist"}</option>
              {visibleStaffMembers.map((staffMember) => (
                <option key={staffMember.id} value={staffMember.id}>
                  {staffMember.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Location</span>
            <select
              className="select"
              name="locationId"
              onChange={(event) => patch("locationId", event.target.value)}
              value={formState.locationId}
            >
              <option value="">No location yet</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Wear date</span>
            <input
              className="input"
              name="wearDate"
              onChange={(event) => patch("wearDate", event.target.value)}
              type="date"
              value={formState.wearDate}
            />
          </label>

          <label className="field">
            <span className="field-label">Heard from</span>
            <select
              className="select"
              name="leadSourceOptionId"
              onChange={(event) => patch("leadSourceOptionId", event.target.value)}
              value={formState.leadSourceOptionId}
            >
              <option value="">Select lead source</option>
              {activeLeadSources.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Price point</span>
            <select
              className="select"
              name="pricePointOptionId"
              onChange={(event) => patch("pricePointOptionId", event.target.value)}
              value={formState.pricePointOptionId}
            >
              <option value="">Select price point</option>
              {activePricePoints.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Size</span>
            <select
              className="select"
              name="sizeOptionId"
              onChange={(event) => patch("sizeOptionId", event.target.value)}
              value={formState.sizeOptionId}
            >
              <option value="">Select size</option>
              {activeSizes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Status</span>
            <select
              className="select"
              name="status"
              onChange={(event) => patch("status", event.target.value as FormState["status"])}
              value={formState.status}
            >
              <option value="ACTIVE">Active</option>
              <option value="WAITING">Waiting</option>
              <option value="COMPLETE">Complete</option>
            </select>
          </label>

          <label className="field field-span-2">
            <span className="field-label">Comment</span>
            <textarea
              className="textarea"
              name="comments"
              onChange={(event) => patch("comments", event.target.value)}
              placeholder="Add note"
              value={formState.comments}
            />
          </label>
        </div>

        <div className="form-actions">
          <SubmitButton
            className="button"
            pendingLabel={isEditing ? "Saving..." : "Adding..."}
          >
            {isEditing ? "Save changes" : "Add appointment"}
          </SubmitButton>
        </div>

        {!isEditing && deferredQuery.length >= 2 ? (
          <div className="previous-lookup full-span">
            <div className="previous-lookup-head">
              <div>
                <div className="eyebrow">Previous Customers</div>
                <p className="compact-note">
                  {matches.length
                    ? "Use a previous profile to fill in this check-in faster."
                    : `No prior customer found for "${formState.guestName.trim()}".`}
                </p>
              </div>
            </div>

            {matches.length ? (
              <div className="previous-lookup-list">
                {matches.map((profile) => (
                  <article className="previous-lookup-card" key={profile.id}>
                    <div className="previous-lookup-top">
                      <div>
                        <strong>{profile.guestName}</strong>
                        <div className="compact-note">Last visit {formatDateLabel(profile.lastVisitDate)}</div>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => applyPreviousCustomer(profile)}
                        type="button"
                      >
                        Use previous info
                      </button>
                    </div>

                    <div className="pill-row">
                      <span className="pill">{profile.appointmentType || "—"}</span>
                      {profile.assignedTo ? <span className="pill">{profile.assignedTo}</span> : null}
                      {profile.location ? <span className="pill">{profile.location}</span> : null}
                    </div>

                    <div className="lookup-grid">
                      <div className="lookup-field">
                        <span>Wear Date</span>
                        <strong>{profile.wearDate ? formatDateLabel(profile.wearDate) : "—"}</strong>
                      </div>
                      <div className="lookup-field">
                        <span>Heard From</span>
                        <strong>{profile.heardAbout || "—"}</strong>
                      </div>
                      <div className="lookup-field">
                        <span>Price Point</span>
                        <strong>{profile.pricePoint || "—"}</strong>
                      </div>
                      <div className="lookup-field">
                        <span>Size</span>
                        <strong>{profile.size || "—"}</strong>
                      </div>
                      <div className="lookup-field">
                        <span>Purchased</span>
                        <strong>{profile.purchased || "—"}</strong>
                      </div>
                      <div className="lookup-field">
                        <span>Other Sale</span>
                        <strong>{profile.otherSale || "—"}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
