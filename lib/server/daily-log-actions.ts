"use server";

import { AppointmentStatus, StoreOptionKind, VisitType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/strings";
import {
  resolveLocationForStore,
  resolveOptionForStore,
  resolveStaffForStore
} from "@/lib/server/option-resolvers";

function asString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Resolves the DB store ID for the current session's store slug. Throws if not found.
 *  ADMIN users have access to all stores, so storeId is returned as null for them —
 *  callers must skip per-store ownership checks when storeId is null. */
async function requireSessionStore() {
  const session = await getCurrentSession();
  if (!session.isAuthenticated) {
    throw new Error("Authentication required.");
  }
  // ADMIN accounts may be associated with a virtual combined store that has no
  // real DB row — skip the store lookup and return null to signal all-store access.
  if (session.role === "ADMIN") {
    return { session, storeId: null as string | null };
  }
  const store = await prisma.store.findUnique({
    where: { slug: session.storeSlug },
    select: { id: true }
  });
  if (!store) {
    throw new Error("Store not found.");
  }
  return { session, storeId: store.id as string | null };
}

function buildClientDateTime(baseDate: string, timeValue: string, offsetMinutesInput: string) {
  if (!timeValue) return null;

  const [year, month, day] = baseDate.split("-").map((value) => Number.parseInt(value, 10));
  const [hours, minutes] = timeValue.split(":").map((value) => Number.parseInt(value, 10));
  const offsetMinutes = Number.parseInt(offsetMinutesInput || "0", 10);

  return new Date(Date.UTC(year, month - 1, day, hours, minutes) + offsetMinutes * 60_000);
}

async function resolveAppointmentRelations({
  storeId,
  appointmentTypeOptionId,
  assignedStaffMemberId,
  locationId,
  leadSourceOptionId,
  pricePointOptionId,
  sizeOptionId
}: {
  storeId: string;
  appointmentTypeOptionId: string;
  assignedStaffMemberId: string;
  locationId: string;
  leadSourceOptionId: string;
  pricePointOptionId: string;
  sizeOptionId: string;
}) {
  const [
    store,
    appointmentTypeOption,
    assignedStaffMember,
    location,
    leadSourceOption,
    pricePointOption,
    sizeOption
  ] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId }
    }),
    // Appointment type may be submitted as either kind, and is not filtered by
    // isActive so historical types keep resolving.
    resolveOptionForStore(
      appointmentTypeOptionId,
      storeId,
      [StoreOptionKind.APPOINTMENT_TYPE, StoreOptionKind.WALK_IN_TYPE],
      false
    ),
    resolveStaffForStore(assignedStaffMemberId, storeId),
    resolveLocationForStore(locationId, storeId),
    resolveOptionForStore(leadSourceOptionId, storeId, [StoreOptionKind.LEAD_SOURCE]),
    resolveOptionForStore(pricePointOptionId, storeId, [StoreOptionKind.PRICE_POINT]),
    resolveOptionForStore(sizeOptionId, storeId, [StoreOptionKind.SIZE])
  ]);

  if (!store || !appointmentTypeOption) {
    throw new Error("Store or appointment type could not be found.");
  }

  return {
    store,
    appointmentTypeOption,
    assignedStaffMember,
    location,
    leadSourceOption,
    pricePointOption,
    sizeOption
  };
}

export async function createDailyLogEntry(formData: FormData) {
  // Auth: verify the session and that the submitted storeId belongs to the session's store.
  const { storeId: sessionStoreId } = await requireSessionStore();

  const storeId = asString(formData.get("storeId"));
  const guestName = asString(formData.get("guestName"));
  const visitTypeInput = asString(formData.get("visitType"));
  const appointmentTypeOptionId = asString(formData.get("appointmentTypeOptionId"));
  const assignedStaffMemberId = asString(formData.get("assignedStaffMemberId"));
  const locationId = asString(formData.get("locationId"));
  const leadSourceOptionId = asString(formData.get("leadSourceOptionId"));
  const pricePointOptionId = asString(formData.get("pricePointOptionId"));
  const sizeOptionId = asString(formData.get("sizeOptionId"));
  const comments = asString(formData.get("comments"));
  const appointmentDateInput = asString(formData.get("appointmentDate"));
  const timeInInput = asString(formData.get("timeIn"));
  const timeInOffsetMinutes = asString(formData.get("timeInOffsetMinutes"));
  const timeOutInput = asString(formData.get("timeOut"));
  const timeOutOffsetMinutes = asString(formData.get("timeOutOffsetMinutes"));
  const wearDateInput = asString(formData.get("wearDate"));
  const statusInput = asString(formData.get("status"));

  if (!storeId || !guestName || !appointmentTypeOptionId || !appointmentDateInput || !timeInInput) {
    throw new Error("Store, guest name, appointment type, date, and time in are required.");
  }

  // Verify the submitted store matches the session store (prevents cross-store writes).
  // ADMIN users (sessionStoreId === null) are allowed to write to any store.
  if (sessionStoreId !== null && storeId !== sessionStoreId) {
    throw new Error("Not authorized to add entries for this store.");
  }

  const {
    appointmentTypeOption,
    assignedStaffMember,
    location,
    leadSourceOption,
    pricePointOption,
    sizeOption
  } = await resolveAppointmentRelations({
    storeId,
    appointmentTypeOptionId,
    assignedStaffMemberId,
    locationId,
    leadSourceOptionId,
    pricePointOptionId,
    sizeOptionId
  });

  const normalizedGuestName = normalizeName(guestName);
  // Use explicit UTC midnight so the stored date is never off-by-one regardless of server TZ.
  const appointmentDate = new Date(`${appointmentDateInput}T00:00:00.000Z`);
  const timeIn = buildClientDateTime(appointmentDateInput, timeInInput, timeInOffsetMinutes);
  const timeOut = buildClientDateTime(appointmentDateInput, timeOutInput, timeOutOffsetMinutes);
  const wearDate = wearDateInput ? new Date(`${wearDateInput}T00:00:00.000Z`) : null;

  if (!timeIn) {
    throw new Error("Time in is required.");
  }

  // Find or create the customer record for this store.
  // findFirst + create is intentionally sequential (not parallel) to reduce
  // the window for duplicate creation under concurrent check-ins.
  const existingCustomer = await prisma.customer.findFirst({
    where: { storeId, normalizedFullName: normalizedGuestName },
    orderBy: { updatedAt: "desc" }
  });
  const customer =
    existingCustomer ||
    (await prisma.customer.create({
      data: { storeId, fullName: guestName, normalizedFullName: normalizedGuestName }
    }));

  const visitType =
    visitTypeInput === VisitType.WALK_IN || appointmentTypeOption.kind === StoreOptionKind.WALK_IN_TYPE
      ? VisitType.WALK_IN
      : VisitType.APPOINTMENT;

  const resolvedStatus =
    statusInput === AppointmentStatus.COMPLETE
      ? AppointmentStatus.COMPLETE
      : statusInput === AppointmentStatus.WAITING
        ? AppointmentStatus.WAITING
        : AppointmentStatus.ACTIVE;

  await prisma.appointment.create({
    data: {
      storeId,
      customerId: customer.id,
      assignedStaffMemberId: assignedStaffMember?.id || null,
      locationId: location?.id || null,
      appointmentDate,
      timeIn,
      timeOut,
      wearDate,
      visitType,
      appointmentTypeOptionId: appointmentTypeOption.id,
      appointmentTypeLabel: appointmentTypeOption.label,
      leadSourceOptionId: leadSourceOption?.id || null,
      leadSourceLabel: leadSourceOption?.label || null,
      pricePointOptionId: pricePointOption?.id || null,
      pricePointLabel: pricePointOption?.label || null,
      sizeOptionId: sizeOption?.id || null,
      sizeLabel: sizeOption?.label || null,
      status: resolvedStatus,
      comments: comments || null,
      checkedOutAt: resolvedStatus === AppointmentStatus.COMPLETE ? timeOut || timeIn : null
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
}

export async function updateDailyLogEntry(formData: FormData) {
  // Auth: require authenticated session with store ownership verified after appointment lookup.
  const { storeId: sessionStoreId } = await requireSessionStore();

  const appointmentId = asString(formData.get("appointmentId"));
  const guestName = asString(formData.get("guestName"));
  const appointmentTypeOptionId = asString(formData.get("appointmentTypeOptionId"));
  const assignedStaffMemberId = asString(formData.get("assignedStaffMemberId"));
  const locationId = asString(formData.get("locationId"));
  const leadSourceOptionId = asString(formData.get("leadSourceOptionId"));
  const pricePointOptionId = asString(formData.get("pricePointOptionId"));
  const sizeOptionId = asString(formData.get("sizeOptionId"));
  const comments = asString(formData.get("comments"));
  const appointmentDateInput = asString(formData.get("appointmentDate"));
  const timeInInput = asString(formData.get("timeIn"));
  const timeInOffsetMinutes = asString(formData.get("timeInOffsetMinutes"));
  const timeOutInput = asString(formData.get("timeOut"));
  const timeOutOffsetMinutes = asString(formData.get("timeOutOffsetMinutes"));
  const wearDateInput = asString(formData.get("wearDate"));
  const visitTypeInput = asString(formData.get("visitType"));
  const statusInput = asString(formData.get("status"));
  const purchasedInput = asString(formData.get("purchased"));
  const otherPurchaseInput = asString(formData.get("otherPurchase"));

  if (!appointmentId || !guestName || !appointmentTypeOptionId || !appointmentDateInput || !timeInInput) {
    throw new Error("Appointment, guest name, appointment type, date, and time in are required.");
  }

  const existingAppointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }
  });

  if (!existingAppointment) {
    throw new Error("Appointment could not be found.");
  }

  if (existingAppointment.deletedAt) {
    throw new Error("Removed appointments cannot be edited.");
  }

  // Verify the appointment belongs to the session's store.
  // ADMIN users (sessionStoreId === null) may edit appointments in any store.
  if (sessionStoreId !== null && existingAppointment.storeId !== sessionStoreId) {
    throw new Error("Not authorized to edit this appointment.");
  }

  const {
    appointmentTypeOption,
    assignedStaffMember,
    location,
    leadSourceOption,
    pricePointOption,
    sizeOption
  } = await resolveAppointmentRelations({
    storeId: existingAppointment.storeId,
    appointmentTypeOptionId,
    assignedStaffMemberId,
    locationId,
    leadSourceOptionId,
    pricePointOptionId,
    sizeOptionId
  });

  const normalizedGuestName = normalizeName(guestName);
  const appointmentDate = new Date(`${appointmentDateInput}T00:00:00.000Z`);
  const timeIn = buildClientDateTime(appointmentDateInput, timeInInput, timeInOffsetMinutes);
  const timeOut = buildClientDateTime(appointmentDateInput, timeOutInput, timeOutOffsetMinutes);
  const wearDate = wearDateInput ? new Date(`${wearDateInput}T00:00:00.000Z`) : null;

  if (!timeIn) {
    throw new Error("Time in is required.");
  }

  const existingCustomer = await prisma.customer.findFirst({
    where: { storeId: existingAppointment.storeId, normalizedFullName: normalizedGuestName },
    orderBy: { updatedAt: "desc" }
  });
  const customer =
    existingCustomer ||
    (await prisma.customer.create({
      data: {
        storeId: existingAppointment.storeId,
        fullName: guestName,
        normalizedFullName: normalizedGuestName
      }
    }));

  const visitType =
    visitTypeInput === VisitType.WALK_IN || appointmentTypeOption.kind === StoreOptionKind.WALK_IN_TYPE
      ? VisitType.WALK_IN
      : VisitType.APPOINTMENT;

  const resolvedStatus =
    statusInput === AppointmentStatus.COMPLETE
      ? AppointmentStatus.COMPLETE
      : statusInput === AppointmentStatus.WAITING
        ? AppointmentStatus.WAITING
        : AppointmentStatus.ACTIVE;

  // Safety net: only overwrite a detail field when the form actually submitted a
  // value for it. A field that arrives empty leaves the stored value untouched,
  // so a form that fails to render a dropdown correctly can never silently erase
  // data that is already recorded. To change one of these, pick a different value.
  const keepIfBlank = <T>(submittedId: string, resolved: T | null, existing: T | null) =>
    submittedId ? (resolved ?? existing) : existing;

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      customerId: customer.id,
      assignedStaffMemberId: keepIfBlank(
        assignedStaffMemberId,
        assignedStaffMember?.id ?? null,
        existingAppointment.assignedStaffMemberId
      ),
      locationId: keepIfBlank(locationId, location?.id ?? null, existingAppointment.locationId),
      appointmentDate,
      timeIn,
      timeOut,
      wearDate,
      visitType,
      appointmentTypeOptionId: appointmentTypeOption.id,
      appointmentTypeLabel: appointmentTypeOption.label,
      leadSourceOptionId: keepIfBlank(
        leadSourceOptionId,
        leadSourceOption?.id ?? null,
        existingAppointment.leadSourceOptionId
      ),
      leadSourceLabel: keepIfBlank(
        leadSourceOptionId,
        leadSourceOption?.label ?? null,
        existingAppointment.leadSourceLabel
      ),
      pricePointOptionId: keepIfBlank(
        pricePointOptionId,
        pricePointOption?.id ?? null,
        existingAppointment.pricePointOptionId
      ),
      pricePointLabel: keepIfBlank(
        pricePointOptionId,
        pricePointOption?.label ?? null,
        existingAppointment.pricePointLabel
      ),
      sizeOptionId: keepIfBlank(sizeOptionId, sizeOption?.id ?? null, existingAppointment.sizeOptionId),
      sizeLabel: keepIfBlank(sizeOptionId, sizeOption?.label ?? null, existingAppointment.sizeLabel),
      status: resolvedStatus,
      purchased: purchasedInput === "Yes" ? true : purchasedInput === "No" ? false : null,
      otherPurchase: otherPurchaseInput === "Yes" ? true : otherPurchaseInput === "No" ? false : null,
      comments: comments || null,
      checkedOutAt: resolvedStatus === AppointmentStatus.COMPLETE ? timeOut || timeIn : null
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
}

export async function deleteDailyLogEntry(formData: FormData) {
  // Auth: require authenticated session and verify store ownership.
  const { storeId: sessionStoreId } = await requireSessionStore();

  const appointmentId = asString(formData.get("appointmentId"));

  if (!appointmentId) {
    throw new Error("Appointment is required.");
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { storeId: true, deletedAt: true }
  });

  if (!appointment) {
    throw new Error("Appointment could not be found.");
  }

  // ADMIN users (sessionStoreId === null) may delete appointments in any store.
  if (sessionStoreId !== null && appointment.storeId !== sessionStoreId) {
    throw new Error("Not authorized to remove this appointment.");
  }

  if (appointment.deletedAt) {
    // Already removed — treat as a no-op rather than an error.
    return;
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { deletedAt: new Date() }
  });

  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
}
