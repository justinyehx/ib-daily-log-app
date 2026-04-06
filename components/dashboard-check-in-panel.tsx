"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

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

type StoreConfig = {
  storeId: string;
  slug: string;
  name: string;
  appointmentTypes: Option[];
  walkInTypes: Option[];
  leadSources: Option[];
  pricePoints: Option[];
  sizes: Option[];
  locations: Option[];
  staffMembers: StaffOption[];
};

type PreviousCustomerProfile = {
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
};

type DashboardCheckInPanelProps = {
  action: (formData: FormData) => void | Promise<void>;
  storeId: string;
  isVirtualStore?: boolean;
  storeConfigs?: StoreConfig[];
  todayDate: string;
  defaultTime: string;
  appointmentTypes: Option[];
  walkInTypes: Option[];
  leadSources: Option[];
  pricePoints: Option[];
  sizes: Option[];
  locations: Option[];
  staffMembers: StaffOption[];
  previousCustomerProfiles: PreviousCustomerProfile[];
};

function formatDateLabel(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function isAlterationLabel(value: string) {
  return value.toLowerCase().includes("alteration");
}

function findDefaultTypeId(options: Option[]) {
  return options.find((option) => option.label.toLowerCase() === "new bride")?.id || "";
}

function getCurrentTimeValue() {
  const now = new Date();
  const hours = `${now.getHours()}`.padStart(2, "0");
  const minutes = `${now.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getOffsetMinutes(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return `${new Date().getTimezoneOffset()}`;
  return `${new Date(`${dateValue}T${timeValue}:00`).getTimezoneOffset()}`;
}

export function DashboardCheckInPanel({
  action,
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
  locations,
  staffMembers,
  previousCustomerProfiles
}: DashboardCheckInPanelProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const defaultStoreId = storeConfigs[0]?.storeId || storeId;
  const defaultAppointmentTypeId = useMemo(() => findDefaultTypeId(appointmentTypes), [appointmentTypes]);
  const defaultWalkInTypeId = useMemo(() => findDefaultTypeId(walkInTypes), [walkInTypes]);
  const [selectedStoreId, setSelectedStoreId] = useState(defaultStoreId);
  const [guestName, setGuestName] = useState("");
  const [visitType, setVisitType] = useState<"APPOINTMENT" | "WALK_IN">("APPOINTMENT");
  const [appointmentTypeOptionId, setAppointmentTypeOptionId] = useState(defaultAppointmentTypeId);
  const [assignedStaffMemberId, setAssignedStaffMemberId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [wearDate, setWearDate] = useState("");
  const [leadSourceOptionId, setLeadSourceOptionId] = useState("");
  const [pricePointOptionId, setPricePointOptionId] = useState("");
  const [sizeOptionId, setSizeOptionId] = useState("");
  const [comments, setComments] = useState("");
  const [timeIn, setTimeIn] = useState(defaultTime);
  const [timeTouched, setTimeTouched] = useState(false);
  const deferredGuestName = useDeferredValue(guestName);

  const activeStoreConfig = useMemo(
    () => storeConfigs.find((entry) => entry.storeId === selectedStoreId) || null,
    [selectedStoreId, storeConfigs]
  );
  const activeAppointmentTypes = activeStoreConfig?.appointmentTypes || appointmentTypes;
  const activeWalkInTypes = activeStoreConfig?.walkInTypes || walkInTypes;
  const activeLeadSources = activeStoreConfig?.leadSources || leadSources;
  const activePricePoints = activeStoreConfig?.pricePoints || pricePoints;
  const activeSizes = activeStoreConfig?.sizes || sizes;
  const activeLocations = activeStoreConfig?.locations || locations;
  const activeStaffMembers = activeStoreConfig?.staffMembers || staffMembers;

  const visibleTypeOptions = visitType === "WALK_IN" ? activeWalkInTypes : activeAppointmentTypes;
  const selectedTypeLabel =
    visibleTypeOptions.find((option) => option.id === appointmentTypeOptionId)?.label || "";
  const useSeamstressField = isAlterationLabel(selectedTypeLabel);
  const visibleStaffMembers = activeStaffMembers.filter((staffMember) =>
    useSeamstressField ? staffMember.role === "SEAMSTRESS" : staffMember.role !== "SEAMSTRESS"
  );
  const leadSourceByLabel = useMemo(
    () => new Map(activeLeadSources.map((option) => [option.label.toLowerCase(), option.id])),
    [activeLeadSources]
  );
  const deferredQuery = deferredGuestName.trim().toLowerCase();

  const matches = useMemo(() => {
    if (deferredQuery.length < 2) return [];

    return previousCustomerProfiles
      .filter(
        (profile) =>
          profile.normalizedGuestName.includes(deferredQuery) ||
          profile.guestName.toLowerCase().includes(deferredQuery)
      )
      .slice(0, 5);
  }, [deferredQuery, previousCustomerProfiles]);

  useEffect(() => {
    if (timeTouched) return;

    setTimeIn(getCurrentTimeValue());
    const interval = window.setInterval(() => {
      setTimeIn(getCurrentTimeValue());
    }, 30000);

    return () => window.clearInterval(interval);
  }, [timeTouched]);

  useEffect(() => {
    setAppointmentTypeOptionId(
      visitType === "WALK_IN"
        ? findDefaultTypeId(activeWalkInTypes)
        : findDefaultTypeId(activeAppointmentTypes)
    );
    setAssignedStaffMemberId("");
    setLocationId("");
    setLeadSourceOptionId("");
    setPricePointOptionId("");
    setSizeOptionId("");
  }, [selectedStoreId, visitType, activeWalkInTypes, activeAppointmentTypes]);

  function applyPreviousCustomer(profile: PreviousCustomerProfile) {
    const form = formRef.current;
    if (!form) return;
    const matchingStoreConfig =
      (profile.storeId ? storeConfigs.find((entry) => entry.storeId === profile.storeId) : null) || activeStoreConfig;

    const elements = form.elements as typeof form.elements & {
      guestName: HTMLInputElement;
      visitType: HTMLSelectElement;
      appointmentTypeOptionId: HTMLSelectElement;
      assignedStaffMemberId: HTMLSelectElement;
      locationId: HTMLSelectElement;
      wearDate: HTMLInputElement;
      leadSourceOptionId: HTMLSelectElement;
      pricePointOptionId: HTMLSelectElement;
      sizeOptionId: HTMLSelectElement;
      comments: HTMLTextAreaElement;
      timeIn: HTMLInputElement;
    };

    const nextVisitType = profile.visitType === "Walk-in" ? "WALK_IN" : "APPOINTMENT";
    const inferredLeadSource = profile.hasPreviousPurchase ? "previous purchase" : "comeback";

    if (profile.storeId) {
      setSelectedStoreId(profile.storeId);
    }
    setGuestName(profile.guestName);
    setVisitType(nextVisitType);
    setAppointmentTypeOptionId("");
    setAssignedStaffMemberId(
      (matchingStoreConfig?.staffMembers || activeStaffMembers).find((staff) => staff.fullName === profile.assignedTo)?.id ||
        ""
    );
    setLocationId(
      (matchingStoreConfig?.locations || activeLocations).find((location) => location.label === profile.location)?.id || ""
    );
    setWearDate(profile.wearDate || "");
    setLeadSourceOptionId(leadSourceByLabel.get(inferredLeadSource) || "");
    setPricePointOptionId(
      (matchingStoreConfig?.pricePoints || activePricePoints).find((pricePoint) => pricePoint.label === profile.pricePoint)?.id || ""
    );
    setSizeOptionId(
      (matchingStoreConfig?.sizes || activeSizes).find((size) => size.label === profile.size)?.id || ""
    );
    setComments(profile.comments || "");

    elements.guestName.value = profile.guestName;
    elements.visitType.value = nextVisitType;
    elements.appointmentTypeOptionId.value = "";
    elements.assignedStaffMemberId.value =
      (matchingStoreConfig?.staffMembers || activeStaffMembers).find((staff) => staff.fullName === profile.assignedTo)?.id || "";
    elements.locationId.value =
      (matchingStoreConfig?.locations || activeLocations).find((location) => location.label === profile.location)?.id || "";
    elements.wearDate.value = profile.wearDate || "";
    elements.leadSourceOptionId.value = leadSourceByLabel.get(inferredLeadSource) || "";
    elements.pricePointOptionId.value =
      (matchingStoreConfig?.pricePoints || activePricePoints).find((pricePoint) => pricePoint.label === profile.pricePoint)?.id || "";
    elements.sizeOptionId.value =
      (matchingStoreConfig?.sizes || activeSizes).find((size) => size.label === profile.size)?.id || "";
    elements.comments.value = profile.comments || "";
    const nextTime = getCurrentTimeValue();
    setTimeTouched(false);
    setTimeIn(nextTime);
    elements.timeIn.value = nextTime;
  }

  function resetFormToDefaults() {
    formRef.current?.reset();
    setSelectedStoreId(defaultStoreId);
    setGuestName("");
    setVisitType("APPOINTMENT");
    setAppointmentTypeOptionId(defaultAppointmentTypeId);
    setAssignedStaffMemberId("");
    setLocationId("");
    setWearDate("");
    setLeadSourceOptionId("");
    setPricePointOptionId("");
    setSizeOptionId("");
    setComments("");
    setTimeTouched(false);
    setTimeIn(getCurrentTimeValue());
  }

  return (
    <section className="panel full-width-panel compact-panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Quick Check-In</p>
          <h3>Add a customer to the floor</h3>
        </div>
      </div>

      <form
        action={async (formData) => {
          await action(formData);
          resetFormToDefaults();
        }}
        className="form-grid compact-form dashboard-checkin-form"
        ref={formRef}
      >
        <input type="hidden" name="storeId" value={selectedStoreId || storeId} />
        <input type="hidden" name="appointmentDate" value={todayDate} />
        <input type="hidden" name="timeInOffsetMinutes" value={getOffsetMinutes(todayDate, timeIn)} />
        <input type="hidden" name="status" value="ACTIVE" />

        <label className="field">
          <span className="field-label">Guest name</span>
          <input
            className="input"
            name="guestName"
            placeholder="Bride or customer name"
            required
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Visit type</span>
          <select
            className="select"
            name="visitType"
            value={visitType}
            onChange={(event) => {
              const nextVisitType = event.target.value as "APPOINTMENT" | "WALK_IN";
              setVisitType(nextVisitType);
              setAppointmentTypeOptionId(nextVisitType === "WALK_IN" ? defaultWalkInTypeId : defaultAppointmentTypeId);
            }}
          >
            <option value="APPOINTMENT">Appointment</option>
            <option value="WALK_IN">Walk-in</option>
          </select>
        </label>

        {isVirtualStore ? (
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
              onChange={(event) => {
                const nextValue = event.target.value;
                setAppointmentTypeOptionId(nextValue);

                const selectedLabel =
                  visibleTypeOptions.find((option) => option.id === nextValue)?.label.toLowerCase() || "";
                if (selectedLabel.includes("alteration")) {
                  const nextLeadSourceId = leadSourceByLabel.get("previous purchase") || "";
                  setLeadSourceOptionId(nextLeadSourceId);
                  const leadSourceField = formRef.current?.elements.namedItem(
                    "leadSourceOptionId"
                  ) as HTMLSelectElement | null;
                  if (leadSourceField) {
                    leadSourceField.value = nextLeadSourceId || leadSourceField.value;
                  }
                }
              }}
            required
            value={appointmentTypeOptionId}
          >
            <option value="">Select appointment type</option>
            {visibleTypeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">{useSeamstressField ? "Seamstress" : "Stylist"}</span>
          <select
            className="select"
            name="assignedStaffMemberId"
            value={assignedStaffMemberId}
            onChange={(event) => setAssignedStaffMemberId(event.target.value)}
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
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">Select location</option>
            {activeLocations.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Time in</span>
          <input
            className="input"
            name="timeIn"
            type="time"
            value={timeIn}
            onChange={(event) => {
              setTimeTouched(true);
              setTimeIn(event.target.value);
            }}
          />
        </label>

        <label className="field">
          <span className="field-label">Wear date</span>
          <input
            className="input"
            name="wearDate"
            type="date"
            value={wearDate}
            onChange={(event) => setWearDate(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Heard from</span>
          <select
            className="select"
            name="leadSourceOptionId"
            value={leadSourceOptionId}
            onChange={(event) => setLeadSourceOptionId(event.target.value)}
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
            value={pricePointOptionId}
            onChange={(event) => setPricePointOptionId(event.target.value)}
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
            value={sizeOptionId}
            onChange={(event) => setSizeOptionId(event.target.value)}
          >
            <option value="">Select size</option>
            {activeSizes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field full-span">
          <span className="field-label">Notes</span>
          <textarea
            className="textarea"
            name="comments"
            placeholder="Optional note for the team"
            rows={2}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
          />
        </label>

        <div className="form-actions full">
          <SubmitButton className="button" pendingLabel="Checking in...">
            Check in customer
          </SubmitButton>
        </div>

        {deferredQuery.length >= 2 ? (
          <div className="previous-lookup full-span">
            <div className="previous-lookup-head">
              <div>
                <div className="eyebrow">Previous Customers</div>
                <p className="compact-note">
                  {matches.length
                    ? "Use a previous profile to fill in this check-in faster."
                    : `No prior customer found for "${guestName.trim()}".`}
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
                        {profile.storeName ? <div className="compact-note">{profile.storeName}</div> : null}
                      </div>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => applyPreviousCustomer(profile)}
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

                    {profile.comments ? (
                      <p className="compact-note">
                        <strong>Comment:</strong> {profile.comments}
                      </p>
                    ) : null}
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
