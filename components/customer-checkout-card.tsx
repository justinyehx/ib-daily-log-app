"use client";

import { useState, useTransition } from "react";

import { LiveDuration } from "@/components/live-duration";
import { SubmitButton } from "@/components/submit-button";
import {
  getCurrentTimeValue,
  getOffsetMinutes,
  isAlterationLabel,
  skipsBridalDetailFields
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

function purchaseValue(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Yes";
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
};

export function CustomerCheckoutCard({
  customer,
  reasonOptions,
  staffOptions,
  leadSourceOptions,
  pricePointOptions,
  sizeOptions,
  updateStatusAction,
  checkoutAction
}: CustomerCheckoutCardProps) {
  const [purchased, setPurchased] = useState<"Yes" | "No">(purchaseValue(customer.purchased));
  const [cbAppt, setCbAppt] = useState<"No" | "Yes">("No");
  const [timeOutValue, setTimeOutValue] = useState(getCurrentTimeValue());
  const [optimisticStatus, setOptimisticStatus] = useState(customer.status);
  const [isHidden, setIsHidden] = useState(false);
  const [approvalPassword, setApprovalPassword] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [isPending, startTransition] = useTransition();

  const useSeamstressField = isAlterationLabel(customer.appointmentType);
  const hideBridalDetailFields = skipsBridalDetailFields(customer.appointmentType);
  const approvalRequired = requiresManagerApproval(customer.appointmentType);
  const showPurchasedField = !useSeamstressField;
  const visibleStaffOptions = staffOptions.filter((staffOption) =>
    useSeamstressField ? staffOption.role === "SEAMSTRESS" : staffOption.role !== "SEAMSTRESS"
  );
  const nextStatus = optimisticStatus === "WAITING" ? "ACTIVE" : "WAITING";
  const defaultLeadSourceOptionId =
    !customer.leadSourceOptionId && useSeamstressField
      ? leadSourceOptions.find((option) => option.label.toLowerCase() === "previous purchase")?.id || ""
      : customer.leadSourceOptionId || "";

  if (isHidden) {
    return null;
  }

  return (
    <article className="customer-card">
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
              <strong>{useSeamstressField ? "Seamstress" : "Stylist"}:</strong> {customer.assignedTo}
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

      <div className="customer-checkout-grid">
        <form
          action={checkoutAction}
          className="customer-checkout-form field-span-3"
          onSubmit={(event) => {
            const form = event.currentTarget;
            if (approvalRequired && !["manager123", "admin123"].includes(approvalPassword.trim())) {
              event.preventDefault();
              setApprovalError("Manager or admin password required for no-try-on checkout.");
              return;
            }

            setApprovalError("");
            const formData = new FormData(form);
            event.preventDefault();
            setIsHidden(true);
            startTransition(async () => {
              try {
                await checkoutAction(formData);
              } catch (error) {
                console.error(error);
                setIsHidden(false);
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
              onChange={(event) => setTimeOutValue(event.target.value)}
              required
            />
          </label>

          {showPurchasedField ? (
            <label className="field">
              <FieldLabel>Purchased</FieldLabel>
              <select
                className="select"
                name="purchased"
                value={purchased}
                onChange={(event) => setPurchased(event.target.value as "Yes" | "No")}
                required
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>
          ) : (
            <input type="hidden" name="purchased" value="Yes" />
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
                defaultValue={customer.pricePointOptionId || ""}
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

          {!hideBridalDetailFields && !customer.sizeOptionId ? (
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
                  if (
                    approvalError &&
                    ["manager123", "admin123"].includes(event.target.value.trim())
                  ) {
                    setApprovalError("");
                  }
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
            <SubmitButton className="button customer-action-button" pendingLabel="Checking out...">
              Check Out
            </SubmitButton>
          </div>
        </form>
      </div>
    </article>
  );
}
