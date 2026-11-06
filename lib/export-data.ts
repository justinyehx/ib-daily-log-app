import { AppointmentStatus, VisitType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { skipsPurchasedField } from "@/lib/appointment-form-utils";
import { getStoreViewShell } from "@/lib/store-views";

/**
 * Full customer/appointment export for the Settings page.
 *
 * Mirrors the Daily Log table column for column, plus the fields that are
 * recorded but not shown there (wear date, reason did not buy, comeback
 * booking), so the export is a complete record rather than a screenshot of
 * the table.
 */

export const EXPORT_COLUMNS = [
  "Store",
  "Date",
  "Guest Name",
  "Assigned To",
  "Appointment Type",
  "Visit Type",
  "Location",
  "Time In",
  "Time Out",
  "Duration",
  "Heard From",
  "Price Point",
  "Size",
  "Wear Date",
  "Purchased",
  "Other Sale",
  "Reason Did Not Buy",
  "Comeback Booked",
  "Comeback Date",
  "Status",
  "Comments"
] as const;

export type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string | number>;

function formatDate(value: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
}

function formatTime(value: Date | null, timeZone: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(value);
}

function formatDuration(start: Date | null, end: Date | null) {
  if (!start || !end) return "";
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  // Negative durations come from AM/PM typos in the source data. Surface them
  // rather than hiding them, so whoever reads the export can see the problem.
  if (minutes < 0) return "check times";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

function yesNo(value: boolean | null, skipped: boolean) {
  if (skipped) return "";
  if (value === null) return "Pending";
  return value ? "Yes" : "No";
}

export type ExportResult = {
  rows: ExportRow[];
  storeName: string;
  from: string;
  to: string;
};

export async function getDailyLogExport(
  storeSlug: string,
  fromDate: string,
  toDate: string,
  timezone = "America/Chicago"
): Promise<ExportResult | null> {
  const shell = await getStoreViewShell(storeSlug);
  if (!shell) return null;

  // Dates arrive as plain YYYY-MM-DD. Appointment dates are stored at UTC
  // midnight, so compare in UTC to avoid dropping the boundary days.
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T23:59:59.999Z`);

  const appointments = await prisma.appointment.findMany({
    where: {
      storeId: { in: shell.storeIds },
      deletedAt: null,
      appointmentDate: { gte: start, lte: end }
    },
    orderBy: [{ appointmentDate: "asc" }, { timeIn: "asc" }],
    select: {
      storeId: true,
      appointmentDate: true,
      timeIn: true,
      timeOut: true,
      visitType: true,
      appointmentTypeLabel: true,
      leadSourceLabel: true,
      pricePointLabel: true,
      sizeLabel: true,
      wearDate: true,
      purchased: true,
      otherPurchase: true,
      reasonDidNotBuyLabel: true,
      cbAppointmentScheduled: true,
      cbAppointmentAt: true,
      status: true,
      comments: true,
      customer: { select: { fullName: true } },
      assignedStaffMember: { select: { fullName: true } },
      location: { select: { name: true } }
    }
  });

  const storeNames = new Map(shell.sourceStores.map((store) => [store.id, store.name]));

  const rows: ExportRow[] = appointments.map((appointment) => {
    const skipsPurchased = skipsPurchasedField(appointment.appointmentTypeLabel);
    return {
      Store: storeNames.get(appointment.storeId) || shell.store.name,
      Date: formatDate(appointment.appointmentDate),
      "Guest Name": appointment.customer.fullName,
      "Assigned To": appointment.assignedStaffMember?.fullName || "Unassigned",
      "Appointment Type": appointment.appointmentTypeLabel,
      "Visit Type": appointment.visitType === VisitType.WALK_IN ? "Walk-in" : "Appointment",
      Location: appointment.location?.name || "",
      "Time In": formatTime(appointment.timeIn, timezone),
      "Time Out": formatTime(appointment.timeOut, timezone),
      Duration: formatDuration(appointment.timeIn, appointment.timeOut),
      "Heard From": appointment.leadSourceLabel || "",
      "Price Point": appointment.pricePointLabel || "",
      Size: appointment.sizeLabel || "",
      "Wear Date": formatDate(appointment.wearDate),
      Purchased: yesNo(appointment.purchased, skipsPurchased),
      "Other Sale": yesNo(appointment.otherPurchase, false),
      "Reason Did Not Buy": appointment.reasonDidNotBuyLabel || "",
      "Comeback Booked": appointment.cbAppointmentScheduled ? "Yes" : "",
      "Comeback Date": appointment.cbAppointmentAt ? formatDate(appointment.cbAppointmentAt) : "",
      Status:
        appointment.status === AppointmentStatus.COMPLETE
          ? "Complete"
          : appointment.status === AppointmentStatus.WAITING
            ? "Waiting"
            : "Active",
      Comments: appointment.comments || ""
    };
  });

  return { rows, storeName: shell.store.name, from: fromDate, to: toDate };
}
