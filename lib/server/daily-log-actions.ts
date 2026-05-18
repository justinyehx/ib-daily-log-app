"use server";

import { AppointmentStatus, StoreOptionKind, VisitType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/strings";

function asString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Resolves the DB store ID for the current session's store slug. Throws if not found. */
async function requireSessionStore() {
  const session = await getCurrentSession();
  if (!session.isAuthenticated) {
    throw new Error("Authentication required.");
  }
  const store = await prisma.store.findUnique({
    where: { slug: session.storeSlug },
    select: { id: true }
  });
  if (!store) {
    throw new Error("Store not found.");
  }
  return { session, storeId: store.id };
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
    prisma.storeOption.findFirst({
      where: {
        id: appointmentTypeOptionId,
        storeId,
        kind: {
          in: [StoreOptionKind.APPOINTMENT_TYPE, StoreOptionKind.WALK_IN_TYPE]
        }
      }
    }),
    assignedStaffMemberId
      ? prisma.staffMember.findFirst({
          where: {
            id: assignedStaffMemberId,
            storeId,
            isActive: true
          }
        })
      : Promise.resolve(null),
    locationId
      ? prisma.location.findFirst({
          where: {
            id: locationId,
            storeId,
            isActive: true
          }
        })
      : Promise.resolve(null),
    leadSourceOptionId
      ? prisma.storeOption.findFirst({
          where: {
            id: leadSourceOptionId,
            storeId,
            kind: StoreOptionKind.LEAD_SOURCE,
            isActive: true
          }
        })
      : Promise.resolve(null),
    pricePointOptionId
      ? prisma.storeOption.findFirst({
          where: {
            id: pricePointOptionId,
            storeId,
            kind: StoreOptionKind.PRICE_POINT,
            isActive: true
          }
        })
      : Promise.resolve(null),
    sizeOptionId
      ? prisma.storeOption.findFirst({
          where: {
            id: sizeOptionId,
            storeId,
            kind: StoreOptionKind.SIZE,
            isActive: true
          }
        })
      : Promise.resolve(null)
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
  if (storeId !== sessionStoreId) {
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
  if (existingAppointment.storeId !== sessionStoreId) {
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

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
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

  if (appointment.storeId !== sessionStoreId) {
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
