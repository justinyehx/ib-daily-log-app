"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { LiveDuration } from "@/components/live-duration";
import { SubmitButton } from "@/components/submit-button";
import { formatStaffDisplayName } from "@/lib/staff-display";
import {
  getCurrentTimeValue,
  getOffsetMinutes,
  isAlterationLabel,
  skipsBridalDetailFields,
  skipsPurchasedField,
  skipsReasonDidNotBuy,
  skipsSizeField
} from "@/lib/appointment-form-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CustomerCard = {
  id: string;
  appointmentDate: string;
  timeInAt: string;
  guestName: string;
  storeName?: string;
  assignedTo: string;
  assignedStaffMemberId: string;
  location: string;
  appointmentType: string;
  visitType: string;
  status: string;
  timeIn: string;
  durationMinutes: number;
  duration: string;
  wearDateRaw: string;
  leadSourceOptionId: string;
  leadSourceLabel: string;
  pricePointOptionId: string;
  pricePointLabel: string;
  sizeOptionId: string;
  sizeLabel: string;
  comments: string | null;
  purchased: boolean | null;
  otherPurchase: boolean | null;
  reasonDidNotBuyLabel: string;
  previousVisitDate: string;
  previousVisitComment: string;
};

export type ReasonOption = { id: string; label: string };
export type StaffOption = { id: string; fullName: string; role: string };
export type LeadSourceOption = { id: string; label: string };
export type SizeOption = { id: string; label: string };
export type PricePointOption = { id: string; label: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns prospective duration in minutes between a UTC ISO check-in and a local HH:MM checkout. */
function prospectiveDuration(timeInAt: string, timeOutHHMM: string): number | null {
  if (!timeOutHHMM || !timeInAt) return null;
  try {
    const [h, m] = timeOutHHMM.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    const timeIn = new Date(timeInAt);
    const checkout = new Date(timeIn);
    checkout.setHours(h, m, 0, 0);
    // If checkout landed before check-in, roll to next day (cross-midnight edge case)
    if (checkout <= timeIn) checkout.setDate(checkout.getDate() + 1);
    const mins = Math.round((checkout.getTime() - timeIn.getTime()) / 60000);
    return mins > 0 ? mins : null;
  } catch {
    return null;
  }
}

function formatDurationMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function purchaseValue(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

function otherSaleValue(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "No";
}

function requiresManagerApproval(value: string) {
  const normalized = value.toLowerCase();
  return normalized === "new bride - no try on" || normalized === "special occasion - no try on";
}

function formatShortDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric"
  }).format(date);
}

function FieldLabel({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className={`field-label${required ? " field-label-required" : ""}`}>
      {children}
      {required ? <span className="field-label-asterisk">*</span> : null}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type CustomerCheckoutCardProps = {
  customer: CustomerCard;
  reasonOptions: ReasonOption[];
  staffOptions: StaffOption[];
  leadSourceOptions: LeadSourceOption[];
  pricePointOptions: PricePointOption[];
  sizeOptions: SizeOption[];
  updateStatusAction: (formData: FormData) => void | Promise<void>;
  checkoutAction: (formData: FormData) => void | Promise<void>;
  saveDetailsAction?: (formData: FormData) => void | Promise<void>;
  dismissAction?: (formData: FormData) => void | Promise<void>;
};

/**
 * Picks which option a select should show as selected.
 *
 * Each store has its own copy of every dropdown value, and the combined
 * Galleria + Curve view merges the lists and drops duplicates by label — so an
 * appointment can hold an id that is not in the list even though the same value
 * is there under a different id. Matching the stored label as a fallback keeps
 * the field visible instead of silently rendering blank.
 */
function selectedOptionId(
  optionId: string | null | undefined,
  label: string | null | undefined,
  options: Array<{ id: string; label: string }>
) {
  if (optionId && options.some((option) => option.id === optionId)) return optionId;
  if (label) {
    const byLabel = options.find(
      (option) => option.label.trim().toLowerCase() === label.trim().toLowerCase()
    );
    if (byLabel) return byLabel.id;
  }
  return "";
}

export function CustomerCheckoutCard({
  customer,
  reasonOptions,
  staffOptions,
  leadSourceOptions,
  pricePointOptions,
  sizeOptions,
  updateStatusAction,
  checkoutAction,
  saveDetailsAction,
  dismissAction
}: CustomerCheckoutCardProps) {
  const [purchased, setPurchased] = useState<"" | "Yes" | "No">(purchaseValue(customer.purchased));
  const [cbAppt, setCbAppt] = useState<"No" | "Yes">("No");
  const [timeOutValue, setTimeOutValue] = useState(getCurrentTimeValue());
  const timeUserEdited = useRef(false);
  const [savedDetails, setSavedDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const tick = () => {
      if (!timeUserEdited.current) {
        setTimeOutValue(getCurrentTimeValue());
      }
    };
    // Align to the next whole minute, then tick every 60s
    const msUntilNextMinute = 60000 - (Date.now() % 60000);
    const initial = setTimeout(() => {
      tick();
      const interval = setInterval(tick, 60000);
      return () => clearInterval(interval);
    }, msUntilNextMinute);
    return () => clearTimeout(initial);
  }, []);
  const [optimisticStatus, setOptimisticStatus] = useState(customer.status);
  const [isHidden, setIsHidden] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [approvalPassword, setApprovalPassword] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [isPending, startTransition] = useTransition();

  const useSeamstressField = isAlterationLabel(customer.appointmentType);
  const hideBridalDetailFields = skipsBridalDetailFields(customer.appointmentType);
  const hideSizeField = skipsSizeField(customer.appointmentType);
  const hideReasonDidNotBuy = skipsReasonDidNotBuy(customer.appointmentType);
  const approvalRequired = requiresManagerApproval(customer.appointmentType);
  const showPurchasedField = !skipsPurchasedField(customer.appointmentType);
  const visibleStaffOptions = staffOptions.filter((staffOption) =>
    useSeamstressField ? staffOption.role === "SEAMSTRESS" : staffOption.role !== "SEAMSTRESS"
  );
  const nextStatus = optimisticStatus === "WAITING" ? "ACTIVE" : "WAITING";
  const defaultLeadSourceOptionId =
    !customer.leadSourceOptionId && useSeamstressField
      ? leadSourceOptions.find((option) => option.label.toLowerCase() === "previous purchase")?.id || ""
      : selectedOptionId(customer.leadSourceOptionId, customer.leadSourceLabel, leadSourceOptions);

  const defaultPricePointOptionId = selectedOptionId(
    customer.pricePointOptionId,
    customer.pricePointLabel,
    pricePointOptions
  );
  const defaultSizeOptionId = selectedOptionId(customer.sizeOptionId, customer.sizeLabel, sizeOptions);

  if (isHidden) {
    return null;
  }

  return (
    <article className={`customer-card${isExpanded ? " expanded" : ""}`}>

      {/* ── Mobile compact summary (tap to expand) ── */}
      <button
        className="customer-card-summary"
        onClick={() => setIsExpanded(true)}
        type="button"
        aria-label={`View details for ${customer.guestName}`}
      >
        <div className="ccs-top">
          <span className="ccs-name">{customer.guestName}</span>
          <span className={`ccs-status-dot ${optimisticStatus === "WAITING" ? "waiting" : "active"}`} />
        </div>
        <div className="ccs-row">
          <LiveDuration startAt={customer.timeInAt} />
          <span className="ccs-sep">·</span>
          <span>{optimisticStatus === "WAITING" ? "Waiting" : "Active"}</span>
        </div>
        <div className="ccs-row ccs-meta-row">
          <span className="ccs-type">{customer.appointmentType}</span>
          {customer.assignedTo !== "Unassigned" ? (
            <span className="ccs-staff">{formatStaffDisplayName(customer.assignedTo)}</span>
          ) : null}
        </div>
      </button>

      {/* ── Mobile collapse button (shown when expanded) ── */}
      <button
        className="customer-card-collapse-btn"
        onClick={() => setIsExpanded(false)}
        type="button"
      >
        ↑ Collapse
      </button>

      <div className="customer-top">
        <div>
          <h4 className="customer-name">{customer.guestName}</h4>
          {customer.storeName ? <div className="compact-note">{customer.storeName}</div> : null}
        </div>
        <div className={`customer-status ${optimisticStatus === "WAITING" ? "waiting" : ""}`}>
          {optimisticStatus === "WAITING" ? (
            <>
              Waiting • <LiveDuration startAt={customer.timeInAt} />
            </>
          ) : (
            "Active"
          )}
        </div>
      </div>

      <div className="pill-row">
        <span className="pill">{customer.appointmentType}</span>
        {customer.visitType === "Walk-in" ? <span className="pill">Walk-in</span> : null}
        {optimisticStatus !== "WAITING" ? (
          <span className="pill">
            <LiveDuration startAt={customer.timeInAt} />
          </span>
        ) : null}
      </div>

      <div className="customer-meta">
        <div className="customer-meta-inline">
          {customer.assignedTo !== "Unassigned" ? (
            <div>
              <strong>{useSeamstressField ? "Seamstress" : "Stylist"}:</strong> {formatStaffDisplayName(customer.assignedTo)}
            </div>
          ) : null}
          {customer.location !== "Unassigned" ? (
            <div>
              <strong>Location:</strong> {customer.location}
            </div>
          ) : null}
        </div>
        <div>
          <strong>Time in:</strong> {customer.timeIn}
        </div>
        {customer.comments ? (
          <div>
            <strong>Comment:</strong> {customer.comments}
          </div>
        ) : null}
        {customer.previousVisitDate ? (
          <div>
            <strong>{formatShortDate(customer.previousVisitDate)} Comment:</strong>{" "}
            {customer.previousVisitComment || "No prior comment."}
          </div>
        ) : null}
      </div>

      {isEditing && saveDetailsAction ? (
        <div className="customer-checkout-grid">
          <form
            className="customer-checkout-form field-span-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              formData.set("appointmentId", customer.id);
              startTransition(async () => {
                try {
                  await saveDetailsAction(formData);
                  setSavedDetails(true);
                  setIsEditing(false);
                  setTimeout(() => setSavedDetails(false), 2500);
                } catch (err) {
                  console.error(err);
                }
              });
            }}
          >
            {!hideBridalDetailFields ? (
              <label className="field">
                <FieldLabel>Price</FieldLabel>
                <select className="select" name="pricePointOptionId" defaultValue={defaultPricePointOptionId}>
                  <option value="">Select price point</option>
                  {pricePointOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="field">
              <FieldLabel>{useSeamstressField ? "Seamstress" : "Stylist"}</FieldLabel>
              <select className="select" name="assignedStaffMemberId" defaultValue={customer.assignedStaffMemberId || ""}>
                <option value="">{useSeamstressField ? "Select seamstress" : "Select stylist"}</option>
                {visibleStaffOptions.map((staffOption) => (
                  <option key={staffOption.id} value={staffOption.id}>{staffOption.fullName}</option>
                ))}
              </select>
            </label>

            {!hideBridalDetailFields ? (
              <label className="field">
                <FieldLabel>Wear date</FieldLabel>
                <input className="input" name="wearDate" type="date" defaultValue={customer.wearDateRaw || ""} />
              </label>
            ) : null}

            {!hideBridalDetailFields ? (
              <label className="field">
                <FieldLabel>Heard from</FieldLabel>
                <select className="select" name="leadSourceOptionId" defaultValue={defaultLeadSourceOptionId}>
                  <option value="">Select lead source</option>
                  {leadSourceOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {!hideSizeField ? (
              <label className="field">
                <FieldLabel>Size</FieldLabel>
                <select className="select" name="sizeOptionId" defaultValue={defaultSizeOptionId}>
                  <option value="">Select size</option>
                  {sizeOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {showPurchasedField ? (
              <label className="field">
                <FieldLabel>Purchased</FieldLabel>
                <select className="select" name="purchased" defaultValue={purchaseValue(customer.purchased)}>
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>
            ) : (
              <input type="hidden" name="purchased" value="" />
            )}

            <label className="field">
              <FieldLabel>Other sale</FieldLabel>
              <select className="select" name="otherPurchase" defaultValue={otherSaleValue(customer.otherPurchase)}>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </label>

            <label className="field customer-comment-field">
              <span className="field-label">Comment</span>
              <textarea className="textarea" name="comments" rows={2} defaultValue={customer.comments || ""} placeholder="Add note" />
            </label>

            <div className="form-actions customer-action-row customer-actions-row">
              <button
                className="button secondary customer-action-button"
                disabled={isPending}
                onClick={() => setIsEditing(false)}
                type="button"
              >
                Cancel
              </button>
              <SubmitButton className="button customer-action-button" pendingLabel="Saving...">
                Save
              </SubmitButton>
            </div>
          </form>
        </div>
      ) : (
      <div className="customer-checkout-grid">
        <form
          ref={formRef}
          action={checkoutAction}
          className="customer-checkout-form field-span-3"
          onSubmit={(event) => {
            const form = event.currentTarget;
            setApprovalError("");
            const formData = new FormData(form);
            event.preventDefault();
            setIsHidden(true);
            startTransition(async () => {
              try {
                await checkoutAction(formData);
              } catch (error) {
                setIsHidden(false);
                if (approvalRequired && error instanceof Error) {
                  setApprovalError(error.message);
                } else {
                  console.error(error);
                }
              }
            });
          }}
        >
          <input type="hidden" name="appointmentId" value={customer.id} />
          <input type="hidden" name="appointmentDate" value={customer.appointmentDate} />
          <input
            type="hidden"
            name="timeOutOffsetMinutes"
            value={getOffsetMinutes(customer.appointmentDate, timeOutValue)}
          />

          <label className="field">
            <FieldLabel>Check Out</FieldLabel>
            <input
              className="input"
              name="timeOut"
              type="time"
              value={timeOutValue}
              onChange={(event) => { timeUserEdited.current = true; setTimeOutValue(event.target.value); }}
              required
            />
            {(() => {
              const mins = prospectiveDuration(customer.timeInAt, timeOutValue);
              if (mins == null) return null;
              const warn = mins > 180;
              return (
                <span className={warn ? "checkout-duration-warn" : "checkout-duration-ok"}>
                  {warn ? `⚠ ${formatDurationMins(mins)} — check AM/PM` : formatDurationMins(mins)}
                </span>
              );
            })()}
          </label>

          {showPurchasedField ? (
            <label className="field">
              <FieldLabel>Purchased</FieldLabel>
              <select
                className="select"
                name="purchased"
                value={purchased}
                onChange={(event) => setPurchased(event.target.value as "" | "Yes" | "No")}
                required
              >
                <option value="">Select</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>
          ) : (
            <input type="hidden" name="purchased" value="" />
          )}

          <label className="field">
            <FieldLabel>Other sale</FieldLabel>
            <select
              className="select"
              name="otherPurchase"
              defaultValue={otherSaleValue(customer.otherPurchase)}
              required
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </label>

          {!hideBridalDetailFields ? (
            <label className="field">
              <FieldLabel required={!customer.pricePointOptionId}>Price</FieldLabel>
              <select
                className="select"
                name="pricePointOptionId"
                required
                defaultValue={defaultPricePointOptionId}
              >
                <option value="">Select price point</option>
                {pricePointOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!customer.assignedStaffMemberId ? (
            <label className="field">
              <FieldLabel required>{useSeamstressField ? "Seamstress" : "Stylist"}</FieldLabel>
              <select className="select" name="assignedStaffMemberId" required defaultValue="">
                <option value="">{useSeamstressField ? "Select seamstress" : "Select stylist"}</option>
                {visibleStaffOptions.map((staffOption) => (
                  <option key={staffOption.id} value={staffOption.id}>
                    {staffOption.fullName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!hideBridalDetailFields && !customer.wearDateRaw ? (
            <label className="field">
              <FieldLabel required>Wear date</FieldLabel>
              <input className="input" name="wearDate" required type="date" />
            </label>
          ) : null}

          {!hideBridalDetailFields && !customer.leadSourceOptionId ? (
            <label className="field">
              <FieldLabel required>Heard from</FieldLabel>
              <select
                className="select"
                name="leadSourceOptionId"
                required
                defaultValue={defaultLeadSourceOptionId}
              >
                <option value="">Select lead source</option>
                {leadSourceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!hideSizeField && !customer.sizeOptionId ? (
            <label className="field">
              <FieldLabel required>Size</FieldLabel>
              <select className="select" name="sizeOptionId" required defaultValue="">
                <option value="">Select size</option>
                {sizeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {showPurchasedField && purchased === "No" ? (
            <>
              <label className="field">
                <FieldLabel>CB Appt</FieldLabel>
                <select
                  className="select"
                  name="cbAppointmentScheduled"
                  value={cbAppt}
                  onChange={(event) => setCbAppt(event.target.value as "No" | "Yes")}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </label>

              {cbAppt === "Yes" ? (
                <label className="field">
                  <FieldLabel>CB Appt Date / Time</FieldLabel>
                  <input className="input" name="cbAppointmentAt" required type="datetime-local" />
                </label>
              ) : null}

              {!hideReasonDidNotBuy ? (
                <label className={`field ${cbAppt === "Yes" ? "" : "field-span-2"}`}>
                  <FieldLabel>Reason did not buy</FieldLabel>
                  <select className="select" name="reasonDidNotBuyOptionId" required defaultValue="">
                    <option value="">Select reason</option>
                    {reasonOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}

          {approvalRequired ? (
            <label className="field field-span-2">
              <FieldLabel>Manager Password Approval</FieldLabel>
              <input
                className={`input${approvalError ? " input-error" : ""}`}
                name="approvalPassword"
                placeholder="Manager or admin password"
                type="password"
                required
                value={approvalPassword}
                onChange={(event) => {
                  setApprovalPassword(event.target.value);
                  if (approvalError) setApprovalError("");
                }}
              />
              {approvalError ? <span className="field-error">{approvalError}</span> : null}
            </label>
          ) : null}

          <label className="field customer-comment-field">
            <span className="field-label">Comment</span>
            <textarea
              className="textarea"
              name="comments"
              rows={2}
              defaultValue={customer.comments || ""}
              placeholder="Add note before checkout"
            />
          </label>

          <div className="form-actions customer-action-row customer-actions-row">
            <button
              className="button secondary customer-action-button"
              disabled={isPending}
              onClick={() => {
                const formData = new FormData();
                formData.set("appointmentId", customer.id);
                formData.set("nextStatus", nextStatus);
                const previousStatus = optimisticStatus;
                setOptimisticStatus(nextStatus);
                startTransition(async () => {
                  try {
                    await updateStatusAction(formData);
                  } catch (error) {
                    console.error(error);
                    setOptimisticStatus(previousStatus);
                  }
                });
              }}
              type="button"
            >
              {optimisticStatus === "WAITING" ? "Mark active" : "Mark waiting"}
            </button>
            {dismissAction ? (
              <button
                className="button ghost customer-action-button"
                disabled={isPending}
                onClick={() => {
                  const formData = new FormData();
                  formData.set("appointmentId", customer.id);
                  setIsHidden(true);
                  startTransition(async () => {
                    try {
                      await dismissAction(formData);
                    } catch (error) {
                      console.error(error);
                      setIsHidden(false);
                    }
                  });
                }}
                type="button"
              >
                Dismiss
              </button>
            ) : null}
            {saveDetailsAction ? (
              <button
                className="button secondary customer-action-button"
                disabled={isPending}
                onClick={() => setIsEditing(true)}
                type="button"
              >
                {savedDetails ? "Saved ✓" : "Edit"}
              </button>
            ) : null}
            <SubmitButton className="button customer-action-button" pendingLabel="Checking out...">
              Check Out
            </SubmitButton>
          </div>
        </form>
      </div>
      )}
    </article>
  );
}
